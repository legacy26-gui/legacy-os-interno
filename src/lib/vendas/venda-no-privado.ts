import "server-only";

import { prisma } from "@/lib/prisma";
import { CARTEIRA_NO_META, escopoDaCarteira, type PessoaDaCasa } from "@/lib/carteira";
import { entenderPedidoComVarios, pedeVenda } from "@/lib/whatsapp/entender-pedido";
import {
  acharLojaNoTexto,
  executarPausa,
  palavrasDeLojaDesconhecida,
  respostaDeConfirmacao,
  CONFIRMACAO_VALE_MS,
  type AcaoDeVenda,
  type AlvoPendente,
} from "@/lib/whatsapp/pausar-no-privado";
import { anotar } from "@/lib/whatsapp/trilha";
import { anunciosDaLoja, nomeLimpo, registrar, vendaJaRegistrada } from "./venda-por-lead";
import { dinheiro, extrairValorDaVenda, lerOrigemDaVenda, lerRespostaDaPendencia, precoNoAnuncio } from "./interpretar-venda";

// "Vilela vendeu o Versa": registrar a venda e tirar o carro do ar, pelo privado.
//
// ── Por que existe ───────────────────────────────────────────────────────
//
// No grupo da loja o robô só age quando marcado, e se não entende a frase não faz nada.
// Quando isso acontece (foi o caso do Vilela), o dono precisa de um caminho dele, sem
// depender do grupo. Este é o caminho: o dono escreve pro robô no privado e o robô
// registra no Controle de Vendas e pausa os anúncios do carro.
//
// ── As travas ────────────────────────────────────────────────────────────
//
//   1. SÓ o dono (ADMIN). Quem chama confere; esta função confere de novo.
//   2. O robô diz LOJA e CARRO antes de fazer qualquer coisa, e só age com um "sim".
//      Registrar venda errada suja o Controle, o ranking e o relatório do cliente.
//   3. A confirmação vale pra próxima mensagem, por 10 minutos (mesma regra da pausa).
//   4. Quem executa é o mesmo código do grupo: `registrar` (venda) e `executarPausa`
//      (pausa, com o mesmo registro em meta_acoes). Nada de caminho novo pra Meta.
//   5. Valor: o que a pessoa disse; senão o preço do anúncio; senão o robô pergunta.
//      Origem: lead, balcão ou "não sei" — "não sei" é pergunta, nunca chute.
//   6. Venda fora de lead não entra no controle (regra de sempre): só pausa o carro.

export interface VendaMontada {
  resposta: string;
  /** O que o "sim" executa. `null` quando falta saber a loja ou o carro. */
  pendente: AcaoDeVenda | null;
}

const negrito = (s: string) => `*${s}*`;
const lista = (itens: string[]) => itens.map((n) => `• ${n}`).join("\n");

/** O valor que vai pro controle: o dito, ou o preço do anúncio. */
function valorFinal(a: AcaoDeVenda): number | null {
  return a.valorCents ?? a.precoDoAnuncioCents;
}

/** Falta alguma coisa pra o "sim" poder executar? */
export function faltaAlgo(a: AcaoDeVenda): "origem" | "valor" | null {
  if (a.origemLead === null) return "origem";
  if (a.origemLead === true && valorFinal(a) === null) return "valor";
  return null;
}

/** Os anúncios do carro que ainda estão no ar. */
async function anunciosNoAr(clientId: string, ids: string[]) {
  const contas = await prisma.metaAdAccount.findMany({ where: { clientId, active: true }, select: { id: true } });
  return prisma.metaAdCreative.findMany({
    where: { adAccountId: { in: contas.map((c) => c.id) }, adId: { in: ids }, effectiveStatus: "ACTIVE" },
    select: { adId: true, adName: true },
  });
}

/** O que o robô escreve pra a pessoa conferir antes de fazer. */
export async function textoDaConferencia(a: AcaoDeVenda): Promise<string> {
  const noAr = await anunciosNoAr(a.clientId, a.ids);
  const valor = valorFinal(a);
  const linhas = [
    `• Loja: ${negrito(a.loja)}`,
    `• Carro: ${negrito(a.carro)}`,
    a.origemLead === false
      ? "• Origem: fora de lead (não entra no Controle de Vendas)"
      : a.origemLead === true
        ? "• Origem: lead do anúncio"
        : "• Origem: ❓ falta saber",
    a.origemLead === false
      ? null
      : valor === null
        ? "• Valor: ❓ falta saber"
        : `• Valor: ${dinheiro(valor)}${a.valorCents === null ? " (o preço do anúncio)" : ""}`,
  ].filter((x): x is string => x !== null);

  const partes = [`Vou fazer isto:\n${linhas.join("\n")}`];
  if (a.observacao) partes.push(a.observacao);
  partes.push(
    noAr.length > 0
      ? `E pauso os anúncios do carro que estão no ar:\n${lista(noAr.map((x) => x.adName))}`
      : "Os anúncios desse carro já estão pausados, então não mexo neles.",
  );

  const falta = faltaAlgo(a);
  if (falta === "origem") {
    partes.push(`Foi venda de lead do anúncio? Responde ${negrito("lead")} ou ${negrito("balcão")} (pode mandar o valor junto).`);
  } else if (falta === "valor") {
    partes.push("Esse anúncio não tem preço e ninguém disse o valor. Qual foi o valor da venda?");
  } else {
    const minutos = Math.round(CONFIRMACAO_VALE_MS / 60000);
    partes.push(`Responde ${negrito("sim")} pra confirmar (vale ${minutos} minutos) ou ${negrito("não")} pra cancelar. Se o valor estiver errado, manda o certo.`);
  }
  return partes.join("\n\n");
}

/**
 * Entende "Vilela vendeu o Versa, foi do patrocinado" e monta o que o "sim" vai executar.
 * Devolve `null` quando a frase não é um aviso de venda (e aí a conversa segue normal).
 */
export async function montarVendaNoPrivado(
  pessoa: PessoaDaCasa & { name: string },
  texto: string,
  agora: Date = new Date(),
): Promise<VendaMontada | null> {
  if (pessoa.role !== "ADMIN") return null;
  if (!pedeVenda(texto)) return null;

  const lojas = await prisma.client.findMany({
    where: { ...CARTEIRA_NO_META, ...escopoDaCarteira(pessoa), metaAdAccounts: { some: { active: true } } },
    select: {
      id: true,
      companyName: true,
      controlaVendas: true,
      metaAdAccounts: { where: { active: true }, select: { id: true } },
    },
    orderBy: { companyName: "asc" },
  });
  if (lojas.length === 0) return { resposta: "Não achei lojas com anúncios nas suas contas.", pendente: null };

  const citada = acharLojaNoTexto(texto, lojas.map((l) => ({ id: l.id, nome: l.companyName })));
  if (citada.ambiguas.length > 0) {
    return {
      resposta:
        `Você citou mais de uma loja: ${citada.ambiguas.map((l) => negrito(l.nome)).join(", ")}.\n\n` +
        "Eu registro uma venda por vez. Me manda uma para cada loja.",
      pendente: null,
    };
  }

  const candidatas = citada.loja ? lojas.filter((l) => l.id === citada.loja!.id) : lojas;
  const frase = citada.loja ? citada.restante : texto;

  const porLoja = await Promise.all(
    candidatas.map(async (l) => ({ loja: l, conhecidos: await anunciosDaLoja(l.metaAdAccounts.map((c) => c.id)) })),
  );

  // "…da Point" que não é nenhuma loja conhecida: perguntar, em vez de achar o carro em outra loja.
  if (!citada.loja) {
    const estranhas = palavrasDeLojaDesconhecida(
      texto,
      lojas.map((l) => ({ id: l.id, nome: l.companyName })),
      porLoja.flatMap((p) => p.conhecidos),
    );
    if (estranhas.length > 0) {
      return {
        resposta: `Não achei "${estranhas[0]}" entre as lojas, e não quero registrar a venda na loja errada.\n\nMe manda de novo com o nome da loja certa.`,
        pendente: null,
      };
    }
  }

  const achados = porLoja
    .map((p) => ({ ...p, pedido: entenderPedidoComVarios(frase, p.conhecidos) }))
    .filter((r) => r.pedido.alvos.length > 0 || r.pedido.sugestoes.length > 0);

  if (achados.length === 0) {
    const onde = citada.loja ? `nos anúncios da ${negrito(citada.loja.nome)}` : "nos anúncios das lojas";
    return { resposta: `Não achei esse carro ${onde}. Me manda o nome do carro e da loja.`, pendente: null };
  }
  if (achados.length > 1) {
    return {
      resposta:
        `Achei esse carro em mais de uma loja: ${achados.map((r) => negrito(r.loja.companyName)).join(", ")}.\n\n` +
        "Me manda de novo dizendo de qual loja.",
      pendente: null,
    };
  }

  const { loja, conhecidos, pedido } = achados[0];
  const certos = pedido.alvos.filter((x) => x.semDuvida);
  if (certos.length > 1) {
    return { resposta: "Eu registro uma venda de cada vez. Me avisa a primeira e, depois que eu registrar, a seguinte.", pendente: null };
  }
  if (certos.length === 0) {
    const nomes = pedido.alvos.flatMap((d) => d.candidatos.slice(0, 4).map((c) => c.nome));
    return {
      resposta: nomes.length
        ? `Qual destes da ${negrito(loja.companyName)}?\n${lista(nomes)}\n\nMe manda de novo com o nome certo.`
        : `Não achei esse carro nos anúncios da ${negrito(loja.companyName)}. Me manda o nome certo.`,
      pendente: null,
    };
  }

  const carro = certos[0];
  const ids = carro.mesmoCarro.map((c) => c.adId);
  const preco = precoNoAnuncio(carro.mesmoCarro.flatMap((c) => conhecidos.find((k) => k.adId === c.adId)?.textos ?? []));

  let origemLead = lerOrigemDaVenda(texto);
  let observacao: string | undefined;
  if (!loja.controlaVendas) {
    origemLead = false;
    observacao = `A ${loja.companyName} não usa o Controle de Vendas, então só pauso os anúncios.`;
  } else if (await vendaJaRegistrada(loja.id, ids, agora)) {
    origemLead = false;
    observacao = "Essa venda já está registrada no controle, então não registro de novo: só pauso o que sobrou.";
  }

  const acao: AcaoDeVenda = {
    tipo: "registrar-venda",
    clientId: loja.id,
    loja: loja.companyName,
    carro: nomeLimpo(carro.mesmoCarro),
    ids,
    valorCents: extrairValorDaVenda(texto),
    precoDoAnuncioCents: preco,
    origemLead,
    observacao,
    pedido: texto.slice(0, 300),
  };
  return { resposta: await textoDaConferencia(acao), pendente: acao };
}

export type RespostaDaVenda =
  /** Diz "sim" e está tudo certo: pode executar. */
  | { tipo: "executar" }
  /** Trouxe a origem ou o valor que faltava (ou corrigiu o valor): nova conferência. */
  | { tipo: "atualizar"; acao: AcaoDeVenda; resposta: string }
  | { tipo: "cancelar" }
  /** Não tem a ver com a venda: a pendência acaba e a mensagem segue como conversa nova. */
  | { tipo: "outra-coisa" };

/** Lê a resposta a uma conferência de venda que ficou aberta. */
export async function lerRespostaDaVenda(acao: AcaoDeVenda, texto: string): Promise<RespostaDaVenda> {
  const conf = respostaDeConfirmacao(texto);
  const falta = faltaAlgo(acao);

  if (falta === null) {
    if (conf === "sim") return { tipo: "executar" };
    if (conf === "nao") return { tipo: "cancelar" };
    // O valor corrigido ("foi 38 mil"). Só frase curta e sem pergunta: é resposta, não conversa.
    if (acao.origemLead === true && texto.length <= 80 && !texto.includes("?")) {
      const v = extrairValorDaVenda(texto);
      if (v !== null) {
        const nova = { ...acao, valorCents: v };
        return { tipo: "atualizar", acao: nova, resposta: await textoDaConferencia(nova) };
      }
    }
    return { tipo: "outra-coisa" };
  }

  if (texto.length <= 160 && !texto.includes("?")) {
    const r = lerRespostaDaPendencia(texto, {
      valor: acao.valorCents === null && acao.precoDoAnuncioCents === null,
      origem: acao.origemLead === null,
    });
    const origemLead = r.origemLead ?? acao.origemLead;
    const valorCents = r.valorCents ?? acao.valorCents;
    if (origemLead !== acao.origemLead || valorCents !== acao.valorCents) {
      const nova = { ...acao, origemLead, valorCents };
      return { tipo: "atualizar", acao: nova, resposta: await textoDaConferencia(nova) };
    }
  }
  if (conf === "nao") return { tipo: "cancelar" };
  return { tipo: "outra-coisa" };
}

export interface ResultadoDaVendaNoPrivado {
  resposta: string;
  registrou: boolean;
  pausados: number;
  falhas: number;
}

/** Faz o que foi confirmado: registra a venda (se for lead) e pausa os anúncios do carro. */
export async function executarVendaNoPrivado(
  pessoa: PessoaDaCasa & { name: string },
  acao: AcaoDeVenda,
  agora: Date = new Date(),
  messageId?: string | null,
): Promise<ResultadoDaVendaNoPrivado> {
  if (pessoa.role !== "ADMIN") {
    return { resposta: "Só o dono registra venda por aqui.", registrou: false, pausados: 0, falhas: 0 };
  }

  // A loja ainda é da carteira? (Em dez minutos muita coisa muda.)
  const loja = await prisma.client.findFirst({
    where: { id: acao.clientId, ...CARTEIRA_NO_META, ...escopoDaCarteira(pessoa) },
    select: { id: true, companyName: true, controlaVendas: true, metaAdAccounts: { where: { active: true }, select: { id: true } } },
  });
  if (!loja) {
    return { resposta: `Não achei mais a ${acao.loja} entre as lojas no Meta. Não fiz nada.`, registrou: false, pausados: 0, falhas: 0 };
  }

  const partes: string[] = [];
  let registrou = false;

  // ── 1. A venda ───────────────────────────────────────────────────────
  if (acao.origemLead === true) {
    const valor = valorFinal(acao);
    if (valor === null) {
      return { resposta: "Faltou o valor da venda. Não fiz nada: me manda de novo.", registrou: false, pausados: 0, falhas: 0 };
    }
    if (!loja.controlaVendas) {
      partes.push(`A ${loja.companyName} não usa o Controle de Vendas: não registrei.`);
    } else if (await vendaJaRegistrada(loja.id, acao.ids, agora)) {
      partes.push("Essa venda já estava registrada no controle: não registrei de novo.");
    } else {
      const parabens = await registrar(
        {
          loja: { id: loja.id, companyName: loja.companyName, controlaVendas: loja.controlaVendas, contas: loja.metaAdAccounts.map((c) => c.id) },
          grupoId: `privado:${pessoa.id}`,
          carro: acao.carro,
          ids: acao.ids,
          valorCents: acao.valorCents,
          origemLead: true,
          precoDoAnuncioCents: acao.precoDoAnuncioCents,
          textoOriginal: acao.pedido,
          quem: `${pessoa.name} (privado)`,
          agora,
          messageId,
          onde: "pelo privado",
        },
        valor,
        acao.valorCents === null,
      );
      registrou = true;
      partes.push(`✅ Registrei no Controle de Vendas.\n\nO parabéns, se quiser mandar no grupo da loja (eu não mandei):\n${parabens}`);
    }
  } else {
    partes.push("Não registrei no controle: a venda não foi de lead.");
  }

  // ── 2. A pausa dos anúncios que ainda estão no ar ────────────────────
  const noAr = await anunciosNoAr(acao.clientId, acao.ids);
  let pausados = 0;
  let falhas = 0;
  if (noAr.length > 0) {
    const alvos: AlvoPendente[] = noAr.map((x) => ({ clientId: acao.clientId, loja: acao.loja, adId: x.adId, nome: x.adName }));
    const p = await executarPausa(pessoa, { tipo: "pausar-anuncios", alvos, pedido: acao.pedido });
    partes.push(p.resposta);
    pausados = p.pausados;
    falhas = p.falhas;
  } else {
    partes.push("Os anúncios do carro já estavam pausados.");
  }

  await anotar(messageId, `privado ${pessoa.id}`, "venda-privado-feita", `${acao.carro} · ${acao.origemLead ? "lead" : "fora de lead"} · ${pausados} pausado(s)`);
  return { resposta: partes.join("\n\n"), registrou, pausados, falhas };
}
