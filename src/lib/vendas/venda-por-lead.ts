import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { diaDaCasa, diaDaCasaComoData } from "@/lib/dia-da-casa";
import {
  entenderPedidoComVarios,
  pedeVenda,
  type AnuncioConhecido,
} from "@/lib/whatsapp/entender-pedido";
import { avisarAEquipeDaLoja } from "@/lib/whatsapp/avisar-a-equipe";
import { anotar } from "@/lib/whatsapp/trilha";
import {
  dinheiro,
  extrairValorDaVenda,
  lerOrigemDaVenda,
  lerRespostaDaPendencia,
  precoNoAnuncio,
  textoDaPergunta,
  textoDeParabens,
  TEXTO_FORA_DE_LEAD,
} from "./interpretar-venda";

// A venda por lead, do aviso no grupo até o Controle de Vendas.
//
// ── O fluxo ──────────────────────────────────────────────────────────────
//
//   1. Alguém do grupo marca o robô: "@robô vendeu o Virtus".
//   2. O robô acha o carro nos anúncios da loja — os que estão no ar E os que já
//      foram pausados, porque a venda pode acontecer depois de a pausa.
//   3. Tenta ler o VALOR e a ORIGEM na própria frase.
//   4. O que não achou, pergunta no grupo. A venda fica guardada à espera.
//   5. Com valor e origem "lead", registra no Controle de Vendas e parabeniza.
//
// ── "Somente de venda por leads" ─────────────────────────────────────────
//
// Regra do Guilherme. O Controle de Vendas mede o resultado do trabalho da
// agência: venda de balcão ou de indicação não é resultado dele, e contá-la faria
// a loja parecer mais bem atendida do que está. Por isso a origem é uma pergunta
// de verdade, não um palpite — se a frase não diz, o robô pergunta.
//
// ── O que NUNCA acontece sozinho ─────────────────────────────────────────
//
// O robô não registra venda sem valor, e não decide origem por chute. Registrar
// errado aqui não é só um número torto: o Controle de Vendas alimenta o alerta de
// "loja sem vender", o ranking e o relatório do cliente.

/** Quanto tempo a pergunta fica aberta. Passou, a venda continua podendo ser lançada na mão. */
const VALE_HORAS = 48;

/** O mesmo carro avisado de novo dentro deste prazo não vira outra venda. */
const DIAS_CONTRA_DUPLICATA = 30;

export interface LojaParaVenda {
  id: string;
  companyName: string;
  /** Loja tirada do Controle de Vendas (consórcio, banco) não recebe venda. */
  controlaVendas: boolean;
  /** Ids das contas de anúncio ativas da loja. */
  contas: string[];
}

export interface ResultadoDaVenda {
  /**
   * A mensagem foi INTEIRAMENTE sobre a venda (era a resposta à pergunta), e quem
   * chamou não deve continuar lendo-a como pedido pra desligar anúncio.
   */
  fim: boolean;
  /** O que dizer no grupo, se houver. */
  recado: string | null;
  passo: string | null;
}

const NADA: ResultadoDaVenda = { fim: false, recado: null, passo: null };

// Os ids vão entre vírgulas — ",1,2," — pra procurar ",1," nunca casar dentro de ",11,".
const marcar = (ids: string[]) => `,${ids.join(",")},`;
const desmarcar = (texto: string) => texto.split(",").filter(Boolean);

function nomeLimpo(anuncios: AnuncioConhecido[]): string {
  return (
    anuncios.find((a) => !/c[oó]pia|v[ií]deo/i.test(a.nome))?.nome ??
    anuncios[0]?.nome ??
    "o carro"
  );
}

function mesmoConjunto(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

async function anunciosDaLoja(contas: string[]) {
  // Todos os anúncios, qualquer status: a venda pode vir depois da pausa.
  const criativos = await prisma.metaAdCreative.findMany({
    where: { adAccountId: { in: contas } },
    select: { adId: true, adName: true, titulo: true, legenda: true },
  });
  const conhecidos: AnuncioConhecido[] = criativos.map((c) => ({
    adId: c.adId,
    nome: c.adName,
    textos: [c.titulo, c.legenda].filter((t): t is string => !!t),
  }));
  return conhecidos;
}

interface Estado {
  loja: LojaParaVenda;
  grupoId: string;
  carro: string;
  ids: string[];
  valorCents: number | null;
  origemLead: boolean | null;
  precoDoAnuncioCents: number | null;
  textoOriginal: string;
  quem: string | null;
  agora: Date;
  messageId?: string | null;
}

/**
 * Trata uma mensagem do grupo sob a ótica da venda.
 *
 * Duas portas: um AVISO ("vendeu o Virtus") ou uma RESPOSTA à pergunta que o
 * robô deixou aberta ("68 mil, lead"). Qualquer outra mensagem passa direto.
 */
export async function tratarVendaNoGrupo(a: {
  loja: LojaParaVenda;
  grupoId: string;
  /** O texto SEM a marcação do robô. */
  texto: string;
  quem: string | null;
  messageId?: string | null;
  agora?: Date;
}): Promise<ResultadoDaVenda> {
  const agora = a.agora ?? new Date();
  const { loja, grupoId, texto } = a;
  if (!loja.controlaVendas || loja.contas.length === 0) return NADA;

  const aviso = pedeVenda(texto);

  let pend = await prisma.vendaAguardandoDados.findUnique({ where: { grupoId } });
  if (pend && pend.venceEm <= agora) {
    await prisma.vendaAguardandoDados.deleteMany({ where: { grupoId } });
    pend = null;
  }
  if (!aviso && !pend) return NADA;

  /**
   * Lê a mensagem como RESPOSTA à pergunta que ficou aberta.
   * `null` quando ela não responde nada — e aí quem chamou segue o fluxo normal.
   */
  const comoResposta = async (): Promise<ResultadoDaVenda | null> => {
    if (!pend) return null;
    // Mensagem comprida ou com "?" é conversa, não resposta: sem isto, qualquer
    // pergunta com um número no meio seria lida como valor de venda.
    if (texto.length > 160 || texto.includes("?")) return null;

    const r = lerRespostaDaPendencia(texto, {
      valor: pend.valorCents === null,
      origem: pend.origemLead === null,
    });
    if (r.valorCents === null && r.origemLead === null) return null;

    const fechado = await concluirOuPerguntar({
      loja,
      grupoId,
      carro: pend.carro,
      ids: desmarcar(pend.anuncioIds),
      valorCents: r.valorCents ?? pend.valorCents,
      origemLead: r.origemLead ?? pend.origemLead,
      precoDoAnuncioCents: pend.precoDoAnuncioCents,
      textoOriginal: pend.textoOriginal,
      quem: pend.quem,
      agora,
      messageId: a.messageId,
    });
    return { fim: true, ...fechado };
  };

  // ── Resposta à pergunta que ficou aberta ─────────────────────────────
  if (!aviso && pend) return (await comoResposta()) ?? NADA;

  // ── Um aviso de venda ────────────────────────────────────────────────
  const conhecidos = await anunciosDaLoja(loja.contas);
  if (conhecidos.length === 0) return NADA;

  const lido = entenderPedidoComVarios(texto, conhecidos);
  const certos = lido.alvos.filter((x) => x.semDuvida);
  if (certos.length === 0) {
    // ── "vendido por 39.900" COM uma pergunta aberta ────────────────────
    //
    // Respondendo ao "qual foi o valor?", a pessoa escreve do jeito que se fala:
    // "vendido por 39.900". A frase tem a palavra "vendido", então parece um aviso
    // NOVO — e como não nomeia carro nenhum, caía no "esse carro não está no ar".
    // Foi o que aconteceu no primeiro uso real, no grupo da Vilela Motors.
    //
    // Aviso que não nomeia carro e chega com uma pergunta aberta é a resposta a
    // ela. Se o texto também não responde nada, aí sim segue o fluxo normal.
    const resposta = await comoResposta();
    if (resposta) return resposta;

    // Sem pergunta aberta: quem trata é o fluxo de desligar (que pergunta "qual
    // desses?" ou avisa que não está anunciado). Aqui não há o que registrar.
    return NADA;
  }

  if (certos.length > 1) {
    await anotar(a.messageId, grupoId, "venda-varios-carros", loja.companyName);
    return {
      fim: false,
      passo: "venda-varios-carros",
      recado:
        "Pra eu registrar venda no controle preciso de uma de cada vez. " +
        "Me avisa a primeira e, depois que eu registrar, a seguinte.",
    };
  }

  const carro = certos[0];
  const ids = carro.mesmoCarro.map((c) => c.adId);
  const nome = nomeLimpo(carro.mesmoCarro);

  // Já existe uma pergunta aberta sobre OUTRO carro: duas abertas e a resposta
  // "68 mil" não saberia a qual pertence.
  if (pend && !mesmoConjunto(desmarcar(pend.anuncioIds), ids)) {
    const pergunta = textoDaPergunta({
      faltaValor: pend.valorCents === null,
      faltaOrigem: pend.origemLead === null,
      precoDoAnuncioCents: pend.precoDoAnuncioCents,
    });
    return {
      fim: false,
      passo: "venda-pendente-outra",
      recado: `Antes de registrar outra venda, preciso fechar a do *${pend.carro}*.\n${pergunta}`,
    };
  }

  // O mesmo carro já registrado: o aviso repetido não vira outra venda.
  const hoje = diaDaCasaComoData(agora);
  const limite = new Date(hoje.getTime() - DIAS_CONTRA_DUPLICATA * 24 * 60 * 60 * 1000);
  const jaRegistrada = await prisma.clientSale.findFirst({
    where: {
      clientId: loja.id,
      origem: "robo-whatsapp",
      soldAt: { gte: limite },
      OR: ids.map((id) => ({ anuncioIds: { contains: `,${id},` } })),
    },
    select: { id: true },
  });
  if (jaRegistrada) {
    await prisma.vendaAguardandoDados.deleteMany({ where: { grupoId } });
    await anotar(a.messageId, grupoId, "venda-ja-registrada", nome);
    return {
      fim: false,
      passo: "venda-ja-registrada",
      recado: `A venda do *${nome}* já está registrada no controle. 👍`,
    };
  }

  const preco = precoNoAnuncio(
    carro.mesmoCarro.flatMap((c) => conhecidos.find((k) => k.adId === c.adId)?.textos ?? []),
  );

  const fechado = await concluirOuPerguntar({
    loja,
    grupoId,
    carro: nome,
    ids,
    // O que a frase nova traz vale mais; o que já se sabia fica se ela não trouxer.
    valorCents: extrairValorDaVenda(texto) ?? pend?.valorCents ?? null,
    origemLead: lerOrigemDaVenda(texto) ?? pend?.origemLead ?? null,
    precoDoAnuncioCents: preco,
    textoOriginal: texto,
    quem: a.quem,
    agora,
    messageId: a.messageId,
  });
  return { fim: false, ...fechado };
}

/** Fecha a venda se já dá, ou guarda o que se sabe e pergunta o que falta. */
async function concluirOuPerguntar(e: Estado): Promise<{ recado: string; passo: string }> {
  // ── Fora de lead: não conta, e não fica nada pendente ─────────────────
  if (e.origemLead === false) {
    await prisma.vendaAguardandoDados.deleteMany({ where: { grupoId: e.grupoId } });
    await anotar(e.messageId, e.grupoId, "venda-fora-de-lead", e.carro);
    return { recado: TEXTO_FORA_DE_LEAD, passo: "venda-fora-de-lead" };
  }

  // ── Lead e com valor: registra ───────────────────────────────────────
  //
  // O valor que ninguém disse é o PREÇO DO ANÚNCIO, quando o anúncio tem um: o
  // Guilherme pediu que o robô procure ali primeiro e só pergunte se não achar. O
  // aviso ao gestor diz de onde veio o número, pra ele corrigir se a venda saiu
  // por outro valor.
  const valorFinal = e.valorCents ?? e.precoDoAnuncioCents;
  if (e.origemLead === true && valorFinal !== null) {
    const recado = await registrar(e, valorFinal, e.valorCents === null);
    await prisma.vendaAguardandoDados.deleteMany({ where: { grupoId: e.grupoId } });
    return { recado, passo: "venda-registrada" };
  }

  // ── Falta alguma coisa: guarda e pergunta ────────────────────────────
  const venceEm = new Date(e.agora.getTime() + VALE_HORAS * 60 * 60 * 1000);
  const dados = {
    clientId: e.loja.id,
    carro: e.carro,
    anuncioIds: marcar(e.ids),
    valorCents: e.valorCents,
    origemLead: e.origemLead,
    precoDoAnuncioCents: e.precoDoAnuncioCents,
    textoOriginal: e.textoOriginal.slice(0, 300),
    quem: e.quem,
    venceEm,
  };
  await prisma.vendaAguardandoDados.upsert({
    where: { grupoId: e.grupoId },
    create: { grupoId: e.grupoId, ...dados },
    update: dados,
  });
  await anotar(
    e.messageId,
    e.grupoId,
    "venda-perguntou",
    `${e.carro} · falta ${[e.valorCents === null ? "valor" : null, e.origemLead === null ? "origem" : null].filter(Boolean).join(" e ")}`,
  );
  return {
    recado: textoDaPergunta({
      faltaValor: e.valorCents === null,
      faltaOrigem: e.origemLead === null,
      precoDoAnuncioCents: e.precoDoAnuncioCents,
    }),
    passo: "venda-perguntou",
  };
}

/** Grava no Controle de Vendas e devolve o parabéns. */
async function registrar(
  e: Estado,
  valorCents: number,
  valorDoAnuncio: boolean,
): Promise<string> {
  // O gasto é o TOTAL do carro, somando os anúncios dele (o Ka e o Ka "Cópia"),
  // pelo mesmo acumulado que o Copiloto usa pra responder "quanto gastou".
  const vida = await prisma.metaLifetime.findMany({
    where: { adAccountId: { in: e.loja.contas }, adId: { in: e.ids } },
    select: { spendCents: true, leads: true },
  });
  const gastoCents = vida.reduce((s, v) => s + v.spendCents, 0);
  // Quantos leads o carro trouxe, somando os anúncios dele: o gestor pediu os dois
  // números juntos ("o custo total dos anúncios e quantos leads chegaram").
  const leads = vida.reduce((s, v) => s + v.leads, 0);

  const hoje = diaDaCasaComoData(e.agora);
  await prisma.clientSale.create({
    data: {
      clientId: e.loja.id,
      description: `${e.carro} — venda por lead, registrada pelo robô do WhatsApp`,
      value: valorCents / 100,
      adSpend: gastoCents / 100,
      soldAt: hoje,
      // Sem usuário: quem avisou é gente do cliente, que não tem login. A
      // origem é o que mantém a venda com dono — ver ClientSale.origem.
      createdById: null,
      origem: "robo-whatsapp",
      anuncioIds: marcar(e.ids),
    },
  });

  // A venda do mês, contada DEPOIS de gravar: a que acabou de entrar é a n-ésima.
  const [ano, mes] = diaDaCasa(e.agora).split("-").map(Number);
  const inicioDoMes = new Date(Date.UTC(ano, mes - 1, 1));
  const vendasNoMes = await prisma.clientSale.count({
    where: { clientId: e.loja.id, soldAt: { gte: inicioDoMes, lte: hoje } },
  });

  await anotar(e.messageId, e.grupoId, "venda-registrada", `${e.carro} · ${vendasNoMes}ª do mês`);

  // Uma venda aparece em várias telas; sem isto o Controle continuaria mostrando
  // a loja no vermelho depois de ela ter vendido. Não pode derrubar o registro.
  try {
    for (const rota of ["/marcar-venda", "/controle-vendas", "/ranking-lojas", "/gestao-contas"]) {
      revalidatePath(rota);
    }
    revalidatePath(`/gestao-contas/${e.loja.id}`);
  } catch {
    // Fora de um pedido do Next (num teste, por exemplo) isto não tem o que atualizar.
  }

  // O gestor da loja fica sabendo, com o caminho de desfazer: o robô pode errar
  // um valor, e quem corrige precisa descobrir que foi registrado.
  await avisarAEquipeDaLoja(
    e.loja.id,
    `*${e.loja.companyName}* — registrei uma venda por lead no controle:\n` +
      `• ${e.carro}\n` +
      `• Valor: ${dinheiro(valorCents)}${valorDoAnuncio ? " (o preço do anúncio — ninguém disse o valor)" : ""}\n` +
      `• Gasto de anúncio do carro: ${dinheiro(gastoCents)}` +
      (leads > 0 ? ` · ${leads} ${leads === 1 ? "lead" : "leads"}` : "") +
      `\n` +
      `• Quem avisou no grupo: ${e.quem ?? "não identificado"}\n\n` +
      `Se estiver errada, apaga em Marcar Venda → Últimas vendas marcadas.`,
  );

  return textoDeParabens({ loja: e.loja.companyName, vendasNoMes, gastoCents, leads });
}
