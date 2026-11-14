import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { atenderMensagemDoGrupo } from "@/lib/whatsapp/atender-grupo";

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
  text?: { message?: unknown };
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

  // Mensagem que o próprio robô mandou volta pelo webhook. Sem isto, a
  // resposta "tirei o Onix do ar" seria lida como um novo pedido.
  if (corpo.fromMe === true) {
    return NextResponse.json({ ok: true, ignorado: "minha" });
  }
  if (corpo.isGroup !== true) {
    return NextResponse.json({ ok: true, ignorado: "não é grupo" });
  }

  const grupoId = typeof corpo.phone === "string" ? corpo.phone : null;
  const texto =
    corpo.text && typeof corpo.text.message === "string"
      ? corpo.text.message
      : null;
  if (!grupoId || !texto?.trim()) {
    return NextResponse.json({ ok: true, ignorado: "sem texto" });
  }

  try {
    const desfecho = await atenderMensagemDoGrupo({
      grupoId,
      texto,
      quem: typeof corpo.senderName === "string" ? corpo.senderName : null,
      telefone:
        typeof corpo.participantPhone === "string"
          ? corpo.participantPhone
          : null,
    });
    // Devolve só o TIPO do desfecho. Nome de loja, de anúncio ou do carro
    // não voltam: do outro lado está um serviço de fora, e o que ele precisa
    // saber é que chegou.
    return NextResponse.json({ ok: true, desfecho: desfecho.tipo });
  } catch {
    // Erro nosso não vira reenvio: a Z-API mandaria de novo e, se a falha
    // foi DEPOIS de desligar, o anúncio seria desligado duas vezes.
    return NextResponse.json({ ok: true, desfecho: "erro" });
  }
}
