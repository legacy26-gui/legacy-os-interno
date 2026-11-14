import "server-only";

import { prisma } from "@/lib/prisma";
import { enviarTexto } from "./zapi";
import { entenderPedido, type AnuncioConhecido } from "./entender-pedido";
import { acharObjetoDaLoja, mudarStatus } from "@/lib/meta/mudar-status";

// O que o robô faz quando alguém escreve no grupo de uma loja.
//
// ── A ordem das travas, da mais barata pra mais cara ─────────────────────
//
// 1. É grupo conhecido? Mensagem de grupo que não é de nenhuma loja é
//    ignorada sem nem ler. É isso que impede que alguém crie um grupo,
//    adicione o robô e mande "desliga tudo".
// 2. A loja autorizou o robô a agir? Nasce desligado, loja por loja.
// 3. A frase é um pedido pra tirar do ar? Quase nenhuma é.
// 4. Dá pra saber QUAL carro, sem dúvida? Na dúvida, pergunta.
// 5. Só então mexe na Meta.
//
// ── Por que ele sempre responde no grupo ─────────────────────────────────
//
// Porque é a única coisa que torna o erro corrigível. Um robô que desliga
// calado deixa a loja descobrir em uma semana, pelo lead que não veio. Um
// robô que diz "desliguei o Onix LT 2020 Branco" é corrigido em trinta
// segundos por quem estava ali e leu.

/** Uma mensagem de grupo, já limpa do que a Z-API manda em volta. */
export interface MensagemDoGrupo {
  grupoId: string;
  texto: string;
  /** Nome de quem escreveu, como o WhatsApp mostra. */
  quem: string | null;
  /** Telefone de quem escreveu, dentro do grupo. */
  telefone: string | null;
}

export type Desfecho =
  /** Grupo que não é de nenhuma loja — nem foi lido. */
  | { tipo: "grupo-desconhecido" }
  /** A loja não autorizou o robô a desligar sozinho. */
  | { tipo: "loja-nao-autoriza"; clientId: string }
  /** A frase não pedia nada. O caso de quase toda mensagem. */
  | { tipo: "sem-pedido"; clientId: string }
  /** Pediu, mas não dá pra saber qual carro. Perguntou no grupo. */
  | { tipo: "perguntou"; clientId: string; quantos: number }
  /** Desligou e avisou no grupo. */
  | { tipo: "desligou"; clientId: string; adId: string; nome: string }
  /** Tentou desligar e a Meta recusou. */
  | { tipo: "falhou"; clientId: string; erro: string };

/**
 * Quantos anúncios no máximo o robô lista quando não sabe qual é.
 *
 * Lista comprida no WhatsApp não é lida. Se há mais que isto parecendo com o
 * que foi pedido, o pedido estava vago demais pra valer uma lista.
 */
const MAXIMO_NA_PERGUNTA = 5;

export async function atenderMensagemDoGrupo(
  m: MensagemDoGrupo,
): Promise<Desfecho> {
  // ── 1. O grupo é de alguma loja? ──────────────────────────────────────
  const loja = await prisma.client.findFirst({
    where: { whatsappGrupoId: m.grupoId },
    select: {
      id: true,
      companyName: true,
      whatsappDesligaAuto: true,
      metaAdAccounts: {
        where: { active: true },
        select: { id: true },
      },
    },
  });
  if (!loja) return { tipo: "grupo-desconhecido" };

  // ── 2. Esta loja deixou o robô agir? ──────────────────────────────────
  //
  // Antes de ler a frase, porque loja que não autorizou não deve nem ter a
  // mensagem interpretada — e porque assim desligar o interruptor desliga
  // o robô de verdade, não só a última etapa.
  if (!loja.whatsappDesligaAuto) {
    return { tipo: "loja-nao-autoriza", clientId: loja.id };
  }

  // ── 3. e 4. A frase pede, e dá pra saber qual? ────────────────────────
  const contas = loja.metaAdAccounts.map((c) => c.id);
  const criativos = contas.length
    ? await prisma.metaAdCreative.findMany({
        // Só o que está no ar: pedir pra desligar o que já está desligado é
        // pedido que se atende sozinho, e um anúncio pausado na lista só
        // aumentaria a chance de o robô escolher o errado.
        where: { adAccountId: { in: contas }, effectiveStatus: "ACTIVE" },
        select: { adId: true, adName: true, titulo: true, legenda: true },
      })
    : [];

  const anuncios: AnuncioConhecido[] = criativos.map((c) => ({
    adId: c.adId,
    nome: c.adName,
    textos: [c.titulo, c.legenda].filter((t): t is string => !!t),
  }));

  const pedido = entenderPedido(m.texto, anuncios);
  if (pedido.intencao === "nenhuma") {
    return { tipo: "sem-pedido", clientId: loja.id };
  }

  if (!pedido.semDuvida) {
    await responder(m.grupoId, textoDaPergunta(pedido.candidatos));
    return {
      tipo: "perguntou",
      clientId: loja.id,
      quantos: pedido.candidatos.length,
    };
  }

  // ── 5. Mexer na Meta ──────────────────────────────────────────────────
  const alvo = pedido.candidatos[0];

  // De novo pelo cadastro da loja, e não pelo id que veio da leitura: é a
  // mesma trava que impede um id trocado no navegador de pausar a campanha
  // de outra pessoa. Custa uma consulta e fecha a porta.
  const objeto = await acharObjetoDaLoja(loja.id, "anuncio", alvo.adId);
  if (!objeto) {
    return { tipo: "sem-pedido", clientId: loja.id };
  }

  const quem = [m.quem, m.telefone].filter(Boolean).join(" · ") || null;

  const r = await mudarStatus({
    clientId: loja.id,
    quemId: null,
    nivel: "anuncio",
    objeto,
    ligar: false,
    origem: "whatsapp",
    pedidoPor: quem,
    pedidoTexto: m.texto,
  });

  if (!r.ok) {
    await responder(
      m.grupoId,
      `Tentei tirar *${objeto.nome}* do ar e não consegui: ${r.erro} ` +
        `Já avisei a equipe — alguém vai fazer na mão.`,
    );
    return { tipo: "falhou", clientId: loja.id, erro: r.erro };
  }

  await responder(
    m.grupoId,
    `Pronto, tirei *${objeto.nome}* do ar. ` +
      `Se não era esse, me avisa aqui que a gente liga de volta na hora.`,
  );
  return {
    tipo: "desligou",
    clientId: loja.id,
    adId: objeto.objetoId,
    nome: objeto.nome,
  };
}

/** A pergunta de quando não dá pra ter certeza. */
function textoDaPergunta(candidatos: AnuncioConhecido[]): string {
  if (candidatos.length === 0) {
    return (
      "Entendi que é pra tirar um carro do ar, mas não achei qual. " +
      "Me diz o nome do anúncio como está no Facebook?"
    );
  }
  const lista = candidatos
    .slice(0, MAXIMO_NA_PERGUNTA)
    .map((c) => `• ${c.nome}`)
    .join("\n");
  const sobrando = candidatos.length - MAXIMO_NA_PERGUNTA;
  return (
    `Qual desses eu tiro do ar?\n\n${lista}` +
    (sobrando > 0 ? `\n…e mais ${sobrando}.` : "") +
    `\n\nMe responde com o nome e eu desligo.`
  );
}

/**
 * Fala no grupo.
 *
 * Falha de resposta NUNCA derruba o atendimento: se o anúncio já foi
 * desligado e o aviso não saiu, o estrago de estourar aqui seria a Z-API
 * tentando de novo e o robô desligando duas vezes.
 */
async function responder(grupoId: string, texto: string): Promise<void> {
  try {
    await enviarTexto(grupoId, texto);
  } catch {
    // Silêncio de propósito — ver acima.
  }
}
