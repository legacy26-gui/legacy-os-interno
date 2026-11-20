import { NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { atenderMensagemDoGrupo } from "@/lib/whatsapp/atender-grupo";
import { atenderMensagemPrivada } from "@/lib/whatsapp/atender-privado";
import { atenderAudioDoGrupo } from "@/lib/whatsapp/atender-audio";
import { registrarConexao } from "@/lib/whatsapp/vigia-conexao";
import { primeiraVez } from "@/lib/whatsapp/so-uma-vez";
import { anotar } from "@/lib/whatsapp/trilha";
import { guardarRecado } from "@/lib/whatsapp/guardar-recado";

// A porta por onde mensagem de grupo entra no sistema.
//
// ── Esta rota é diferente de todas as outras ─────────────────────────────
//
// As outras portas abertas daqui (o robô dos alertas, a varredura) toleram
// ser chamadas por qualquer um, porque o que alguém ganharia é nada: elas
// não devolvem dado e não mudam nada que importe.
//
// Esta muda. Quem conseguisse chamá-la forjaria uma mensagem vinda do grupo
// de uma loja e DESLIGARIA os anúncios dela. Então aqui não existe o modo
// "sem segredo configurado, a gente aceita assim mesmo": sem segredo, a
// porta não existe.
//
// ── Por que o segredo vai no CAMINHO ─────────────────────────────────────
//
// Porque a Z-API só deixa configurar uma URL. Não há como mandar cabeçalho
// próprio, não há assinatura do corpo. A única coisa que viaja é o endereço,
// então é no endereço que o segredo tem que estar — e por isso o endereço
// inteiro vale como senha, igual ao da própria Z-API.
//
// Consequência prática: ele não pode aparecer em log nenhum. Por isso nada
// aqui escreve a URL, e os erros não repetem o caminho.
//
// ── Por que quase tudo responde 200 ──────────────────────────────────────
//
// Porque a Z-API reenvia o que falhou. Uma mensagem que o sistema decidiu
// ignorar e devolveu erro voltaria de novo e de novo. 200 quer dizer "chegou
// e eu decidi", não "fiz alguma coisa". O único erro de verdade é o segredo
// errado, e esse a gente QUER que falhe.

export const dynamic = "force-dynamic";
/** Node e não Edge: o atendimento fala com o banco pelo Prisma. */
export const runtime = "nodejs";
/**
 * Tempo pro trabalho que acontece DEPOIS da resposta.
 *
 * Atender uma pergunta da IA são duas chamadas ao modelo. O `after` roda
 * dentro deste limite, não do tempo que a Z-API espera — e é justamente por
 * isso que ele existe aqui.
 */
export const maxDuration = 300;

/** Compara sem deixar o tempo da resposta contar quantas letras acertou. */
function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

interface CorpoDaZapi {
  phone?: unknown;
  isGroup?: unknown;
  fromMe?: unknown;
  type?: unknown;
  senderName?: unknown;
  participantPhone?: unknown;
  instanceId?: unknown;
  /** O número conectado na instância — o próprio robô. */
  connectedPhone?: unknown;
  text?: { message?: unknown; mentionedPhones?: unknown };
  /** Mensagem de voz ou áudio. Só é usada no grupo financeiro, e só do dono. */
  audio?: { audioUrl?: unknown; mimeType?: unknown; seconds?: unknown };
  /** Alguns formatos da Z-API mandam os marcados aqui em cima. */
  mentionedPhones?: unknown;
  /** O id da mensagem, usado pra não atender a mesma duas vezes. */
  messageId?: unknown;
}

/** Os marcados, venham de onde vierem. Formato de webhook muda sem avisar. */
function marcados(corpo: CorpoDaZapi): string[] {
  const fontes = [corpo.mentionedPhones, corpo.text?.mentionedPhones];
  const lista: string[] = [];
  for (const f of fontes) {
    if (Array.isArray(f)) {
      for (const x of f) if (typeof x === "string") lista.push(x);
    }
  }
  return lista;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ segredo: string }> },
) {
  const esperado = process.env.ZAPI_WEBHOOK_SECRET?.trim();
  const { segredo } = await ctx.params;

  // Sem segredo configurado a porta não existe. 404 e não 401 de propósito:
  // 401 confirmaria pra quem está procurando que há algo aqui.
  if (!esperado || esperado.length < 16) {
    return new NextResponse("não encontrado", { status: 404 });
  }
  if (!iguais(segredo, esperado)) {
    return new NextResponse("não encontrado", { status: 404 });
  }

  let corpo: CorpoDaZapi;
  try {
    corpo = (await req.json()) as CorpoDaZapi;
  } catch {
    return NextResponse.json({ ok: true, ignorado: "corpo ilegível" });
  }

  // Segunda tranca: o recado tem que vir da NOSSA instância. Não substitui o
  // segredo — quem tem o endereço poderia copiar o id daqui — mas barra o
  // recado que chega por engano, de outra instância da mesma conta.
  const minha = process.env.ZAPI_INSTANCE_ID?.trim();
  if (minha && typeof corpo.instanceId === "string" && corpo.instanceId !== minha) {
    return NextResponse.json({ ok: true, ignorado: "outra instância" });
  }

  // O retrato do que chegou, antes de qualquer decisão — inclusive das que
  // descartam a mensagem. É justamente a mensagem DESCARTADA que não deixa
  // rastro nenhum, e era ela que a gente não conseguia investigar.
  await guardarRecado(corpo as Record<string, unknown>);

  // ── A Z-API avisando que o número caiu ou voltou ──────────────────────
  //
  // Chega aqui quando o mesmo endereço está em "Ao desconectar" / "Ao conectar" no
  // painel da Z-API. Não é mensagem de ninguém: só muda o estado e avisa o dono.
  if (corpo.type === "DisconnectedCallback" || corpo.type === "ConnectedCallback") {
    const conectou = corpo.type === "ConnectedCallback";
    const erro = typeof (corpo as { error?: unknown }).error === "string" ? (corpo as { error: string }).error : null;
    after(async () => {
      try {
        await registrarConexao(conectou, "zapi", erro);
      } catch (e) {
        await anotar(null, "zapi", "conexao-estourou", e instanceof Error ? e.message : String(e));
      }
    });
    return NextResponse.json({ ok: true, conexao: conectou ? "conectou" : "desconectou" });
  }

  // Mensagem que o próprio robô mandou volta pelo webhook. Sem isto, a
  // resposta "tirei o Onix do ar" seria lida como um novo pedido.
  if (corpo.fromMe === true) {
    return NextResponse.json({ ok: true, ignorado: "minha" });
  }
  const de = typeof corpo.phone === "string" ? corpo.phone : null;
  const texto =
    corpo.text && typeof corpo.text.message === "string"
      ? corpo.text.message
      : null;
  const audioUrl = typeof corpo.audio?.audioUrl === "string" ? corpo.audio.audioUrl : null;
  // Áudio só interessa em GRUPO (o financeiro). No privado e fora dele, sem texto = sem nada a fazer.
  const eAudioDeGrupo = !!de && !texto?.trim() && !!audioUrl && corpo.isGroup === true;
  if (!de || (!texto?.trim() && !eAudioDeGrupo)) {
    return NextResponse.json({ ok: true, ignorado: "sem texto" });
  }

  // ── A mesma mensagem, de novo ─────────────────────────────────────────
  //
  // A Z-API reenvia quando não recebe resposta rápido, e atender uma pergunta
  // da IA leva dezenas de segundos. Sem esta trava, a pessoa recebe a resposta
  // duas vezes — e no grupo o mesmo anúncio seria desligado duas vezes.
  //
  // Vem depois das conferências baratas e ANTES de qualquer trabalho: é o
  // último ponto em que dá pra ir embora sem ter feito nada. Ver so-uma-vez.ts.
  const idDaMensagem =
    typeof corpo.messageId === "string" ? corpo.messageId : null;

  if (!(await primeiraVez(corpo.messageId))) {
    return NextResponse.json({ ok: true, ignorado: "repetida" });
  }

  // ── Privado: a IA atendendo quem é da casa ────────────────────────────
  //
  // Antes isto era descartado com "não é grupo". Agora é a porta pela qual a
  // Giovana pergunta "qual loja minha está sem verba?" do celular. Quem
  // responde é o mesmo Copiloto da tela, com a carteira de quem escreveu —
  // e número que não é de ninguém da casa recebe um recado e não aciona a IA.
  if (corpo.isGroup !== true) {
    // Responde AGORA e atende depois. A Z-API reenvia o que demora, e pensar
    // uma resposta são duas chamadas ao modelo: esperar por elas antes de
    // responder é o que fazia a mesma pergunta ser atendida duas vezes.
    //
    // A posse da mensagem já foi tomada acima, de forma síncrona — então o
    // reenvio que chegar enquanto esta ainda está sendo pensada encontra a
    // linha já criada e vai embora.
    after(async () => {
      try {
        await atenderMensagemPrivada({ telefone: de, texto: texto ?? "", messageId: idDaMensagem });
      } catch (e) {
        // Erro aqui não tem a quem ser devolvido: a resposta HTTP já saiu.
        // O sintoma pra quem escreveu é não receber nada, e o reenvio da
        // Z-API não vai trazer de volta — a posse já está tomada.
        //
        // Então ele vira linha na trilha. Era este `catch` vazio, e os dois
        // irmãos dele no atendimento de grupo, que faziam o robô emudecer
        // sem deixar nada pra investigar.
        await anotar(
          idDaMensagem,
          de,
          "privado-estourou",
          e instanceof Error ? e.message : String(e),
        );
      }
    });
    return NextResponse.json({ ok: true, privado: "recebido" });
  }

  const grupoId = de;

  // ── Áudio: só o do dono, no grupo financeiro ──────────────────────────
  //
  // Todas as travas ficam em atenderAudioDoGrupo, ANTES de baixar o áudio. Aqui só se
  // responde já e se trabalha depois, como no texto.
  if (eAudioDeGrupo && audioUrl) {
    after(async () => {
      try {
        await atenderAudioDoGrupo({
          grupoId,
          audioUrl,
          mimeType: typeof corpo.audio?.mimeType === "string" ? corpo.audio.mimeType : null,
          segundos: typeof corpo.audio?.seconds === "number" ? corpo.audio.seconds : null,
          telefone: typeof corpo.participantPhone === "string" ? corpo.participantPhone : null,
          messageId: idDaMensagem,
        });
      } catch (e) {
        await anotar(idDaMensagem, grupoId, "audio-estourou", e instanceof Error ? e.message : String(e));
      }
    });
    return NextResponse.json({ ok: true, audio: "recebido" });
  }

  // Mesma ideia do privado: responde já, atende depois. No grupo o atendimento
  // conversa com a Meta — que às vezes demora — e a duplicata aqui custaria
  // caro: o mesmo "pode tirar o Compass" desligando um anúncio duas vezes.
  after(async () => {
    try {
      await atenderMensagemDoGrupo({
        grupoId,
        texto: texto ?? "",
        quem: typeof corpo.senderName === "string" ? corpo.senderName : null,
        telefone:
          typeof corpo.participantPhone === "string"
            ? corpo.participantPhone
            : null,
        // O próprio número, pra saber se o @ da mensagem era pra ele. Vem no
        // recado e não de configuração: assim trocar o chip não exige mexer em
        // variável nenhuma, e não existe o caso de a variável ficar com o
        // número velho e o robô emudecer sem ninguém entender por quê.
        numeroDoRobo:
          typeof corpo.connectedPhone === "string" ? corpo.connectedPhone : null,
        mencionados: marcados(corpo),
        messageId: idDaMensagem,
      });
    } catch (e) {
      // A resposta HTTP já saiu; não há a quem devolver o erro. O robô avisa
      // no grupo quando falha ao mexer na Meta — ver atender-grupo.ts.
      //
      // E aqui fica a linha que faltava: um erro no meio do atendimento
      // parecia, de fora, exatamente igual a "o robô decidiu não fazer nada".
      await anotar(
        idDaMensagem,
        grupoId,
        "atendimento-estourou",
        e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e),
      );
    }
  });

  // Só "recebido". Nome de loja, de anúncio ou do carro nunca voltam: do
  // outro lado está um serviço de fora, e o que ele precisa saber é que
  // chegou.
  return NextResponse.json({ ok: true, grupo: "recebido" });
}
