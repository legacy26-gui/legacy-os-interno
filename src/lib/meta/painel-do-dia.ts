import "server-only";

import { prisma } from "@/lib/prisma";
import { janelaDeDias, type Numeros } from "./insights";
import { avaliarLoja, comoDias, DIAS_DO_RITMO, type Veredito } from "./estado-da-loja";
import { diagnosticar, DIAS_DA_JANELA, type Diagnostico } from "./criativo-cansado";
import {
  projetarOMes,
  diasDoMes,
  inicioDoMes,
  type Projecao,
} from "./ritmo-do-combinado";

// O que o Meta Ads tem a dizer sobre a carteira de uma pessoa, hoje.
//
// ── Por que existe, e por que mora aqui ───────────────────────────────────
//
// O gestor abre o Meu Dia de manhã. É a primeira tela dele e, até agora, ela
// só sabia falar de venda — o que acontece na conta de anúncio ficava a dois
// cliques de distância, numa tela que ele abria quando lembrava.
//
// "Quando lembrava" é a parte que não funciona. Conta zerada para a campanha
// no mesmo dia; arte cansada estraga o mês inteiro em silêncio. As duas só
// aparecem pra quem foi procurar.
//
// Mora num arquivo só, fora da tela, por dois motivos: a mesma apuração vai
// servir o robô dos alertas (que é a próxima parada deste caminho), e porque
// são quatro consultas com regras em cima — isso dentro do componente vira
// uma tela que ninguém mais consegue ler.

export interface CriativoCansado {
  adId: string;
  nome: string;
  loja: string;
  clientId: string;
  diagnostico: Diagnostico;
}

export interface LojaNoDia {
  clientId: string;
  nome: string;
  veredito: Veredito;
  /** Já escrito: "2 dias", "menos de 1 dia". */
  diasDeSaldo: string | null;
  saldoCents: number | null;
  /** Quando o link de verba foi mandado, se houver pedido em aberto. */
  pedidoEnviadoEm: Date | null;
  projecao: Projecao;
  /** Quantas artes dela estão cansadas. */
  artesCansadas: number;
}

export interface PainelDoDia {
  lojas: LojaNoDia[];
  /** As piores artes da carteira inteira, da mais cansada pra menos. */
  criativos: CriativoCansado[];
}

const SOMAS = {
  spendCents: true,
  impressions: true,
  reach: true,
  clicks: true,
  linkClicks: true,
  leads: true,
} as const;

type Grupo = {
  _sum: Partial<Record<keyof typeof SOMAS, number | null>>;
};

function numeros(g: Grupo): Numeros {
  return {
    spendCents: g._sum.spendCents ?? 0,
    impressions: g._sum.impressions ?? 0,
    reach: g._sum.reach ?? 0,
    clicks: g._sum.clicks ?? 0,
    linkClicks: g._sum.linkClicks ?? 0,
    leads: g._sum.leads ?? 0,
  };
}

/**
 * Apura tudo que a tela do dia precisa, pros clientes que forem pedidos.
 *
 * Recebe os ids prontos em vez de descobrir sozinha quem é de quem: o recorte
 * de carteira é decisão da tela que chama (ou do robô), e decidir isso aqui
 * dentro significaria ter duas respostas possíveis pra "quem vê o quê".
 */
export async function montarPainelDoDia(
  clientIds: string[],
  agora = new Date()
): Promise<PainelDoDia> {
  if (clientIds.length === 0) return { lojas: [], criativos: [] };

  const clientes = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    select: {
      id: true,
      companyName: true,
      gastoMensalPrevistoCents: true,
      pedidosDeVerba: {
        orderBy: { enviadoEm: "desc" },
        take: 1,
        select: { enviadoEm: true, entrouEm: true },
      },
      metaAdAccounts: {
        where: { active: true },
        select: {
          id: true,
          isPrepay: true,
          lastSyncError: true,
          balanceSnapshots: {
            orderBy: { capturedAt: "desc" },
            take: 1,
            select: { availableCents: true },
          },
        },
      },
    },
  });

  const contas = clientes.flatMap((c) => c.metaAdAccounts.map((a) => a.id));
  const daConta = new Map<string, string>();
  for (const c of clientes) for (const a of c.metaAdAccounts) daConta.set(a.id, c.id);

  if (contas.length === 0) {
    return {
      lojas: clientes.map((c) => semMeta(c.id, c.companyName)),
      criativos: [],
    };
  }

  const ritmo = janelaDeDias(DIAS_DO_RITMO, agora);
  const recente = janelaDeDias(DIAS_DA_JANELA, agora);
  // A janela anterior: os DIAS_DA_JANELA dias que vieram antes da recente.
  const anterior = janelaDeDias(DIAS_DA_JANELA * 2, agora);
  const fimDoAnterior = new Date(recente.de);
  fimDoAnterior.setUTCDate(fimDoAnterior.getUTCDate() - 1);

  const [porDia, doMes, artesAgora, artesAntes] = await Promise.all([
    // O ritmo de gasto, por conta e por dia — é a régua dos dias de saldo.
    prisma.metaInsightDaily.groupBy({
      by: ["adAccountId", "date"],
      where: { adAccountId: { in: contas }, date: { gte: ritmo.de, lte: ritmo.ate } },
      _sum: { spendCents: true },
    }),
    // O gasto do mês corrente, pra comparar com o combinado. Inclui hoje de
    // propósito: aqui a pergunta é "quanto já saiu", não "qual é a média".
    prisma.metaInsightDaily.groupBy({
      by: ["adAccountId"],
      where: { adAccountId: { in: contas }, date: { gte: inicioDoMes(agora) } },
      _sum: { spendCents: true },
    }),
    prisma.metaInsightDaily.groupBy({
      by: ["adAccountId", "adId", "adName"],
      where: { adAccountId: { in: contas }, date: { gte: recente.de, lte: recente.ate } },
      _sum: SOMAS,
    }),
    prisma.metaInsightDaily.groupBy({
      by: ["adAccountId", "adId", "adName"],
      where: { adAccountId: { in: contas }, date: { gte: anterior.de, lte: fimDoAnterior } },
      _sum: SOMAS,
    }),
  ]);

  const ritmoDaConta = new Map<string, { gasto: number; dias: Set<number> }>();
  for (const g of porDia) {
    const atual = ritmoDaConta.get(g.adAccountId) ?? { gasto: 0, dias: new Set<number>() };
    atual.gasto += g._sum.spendCents ?? 0;
    atual.dias.add(g.date.getTime());
    ritmoDaConta.set(g.adAccountId, atual);
  }

  const mesDaConta = new Map(doMes.map((g) => [g.adAccountId, g._sum.spendCents ?? 0]));

  // Diagnóstico por anúncio. A chave junta conta e anúncio porque o id do
  // anúncio é único na Meta, mas guardá-lo sozinho num mapa esconderia o dia
  // em que duas contas tiverem o mesmo.
  const antesPorAd = new Map(artesAntes.map((g) => [`${g.adAccountId}|${g.adId}`, numeros(g)]));
  const criativos: CriativoCansado[] = [];
  const cansadasDaLoja = new Map<string, number>();
  const nomeDaLoja = new Map(clientes.map((c) => [c.id, c.companyName]));

  for (const g of artesAgora) {
    const antes = antesPorAd.get(`${g.adAccountId}|${g.adId}`);
    if (!antes) continue; // Anúncio novo não tem com o que comparar.
    const d = diagnosticar(numeros(g), antes);
    if (d.estado !== "cansado" && d.estado !== "cansando") continue;

    const clientId = daConta.get(g.adAccountId);
    if (!clientId) continue;
    if (d.estado === "cansado") {
      cansadasDaLoja.set(clientId, (cansadasDaLoja.get(clientId) ?? 0) + 1);
    }
    criativos.push({
      adId: g.adId,
      nome: g.adName ?? g.adId,
      loja: nomeDaLoja.get(clientId) ?? "",
      clientId,
      diagnostico: d,
    });
  }

  // Pior primeiro: quem cansou antes de quem está cansando, e dentro disso
  // quem subiu mais de custo.
  criativos.sort(
    (a, b) =>
      Number(b.diagnostico.estado === "cansado") - Number(a.diagnostico.estado === "cansado") ||
      (b.diagnostico.variacaoDoCusto ?? 0) - (a.diagnostico.variacaoDoCusto ?? 0)
  );

  const { diaDoMes, diasNoMes } = diasDoMes(agora);

  const lojas: LojaNoDia[] = clientes.map((c) => {
    const prePagas = c.metaAdAccounts.filter((a) => a.isPrepay);
    const lidas = prePagas.filter((a) => a.balanceSnapshots[0]);
    const saldo =
      prePagas.length > 0 && lidas.length === prePagas.length
        ? lidas.reduce((s, a) => s + a.balanceSnapshots[0].availableCents, 0)
        : null;

    let gastoRecenteCents = 0;
    const dias = new Set<number>();
    let gastoNoMesCents = 0;
    for (const a of c.metaAdAccounts) {
      const r = ritmoDaConta.get(a.id);
      if (r) {
        gastoRecenteCents += r.gasto;
        for (const d of r.dias) dias.add(d);
      }
      gastoNoMesCents += mesDaConta.get(a.id) ?? 0;
    }

    const veredito = avaliarLoja({
      temConta: c.metaAdAccounts.length > 0,
      saldoCents: saldo,
      temPrePaga: prePagas.length > 0,
      comErro: c.metaAdAccounts.some((a) => a.lastSyncError),
      gastoRecenteCents,
      diasComDado: dias.size,
      gastoMensalPrevistoCents: c.gastoMensalPrevistoCents,
      // Aqui o "gastou sem lead" não entra: o Meu Dia fala do saldo e do
      // combinado, e o aviso de lead já mora na tela do Meta Ads com o
      // período escolhido. Repetir com outro período daria dois números
      // diferentes pra mesma pergunta.
      gastoDoPeriodoCents: 0,
      leads: 0,
      pedido: c.pedidosDeVerba[0] ?? null,
      agora,
    });

    return {
      clientId: c.id,
      nome: c.companyName,
      veredito,
      diasDeSaldo: comoDias(veredito.diasDeSaldo),
      saldoCents: saldo,
      pedidoEnviadoEm: veredito.pedido ? (c.pedidosDeVerba[0]?.enviadoEm ?? null) : null,
      projecao: projetarOMes({
        previstoCents: c.gastoMensalPrevistoCents,
        gastoNoMesCents,
        diaDoMes,
        diasNoMes,
      }),
      artesCansadas: cansadasDaLoja.get(c.id) ?? 0,
    };
  });

  return { lojas, criativos };
}

function semMeta(clientId: string, nome: string): LojaNoDia {
  return {
    clientId,
    nome,
    veredito: {
      tom: "neutro",
      diasDeSaldo: null,
      diasExatos: null,
      gastoDiarioCents: null,
      origemDoRitmo: null,
      pedido: null,
    },
    diasDeSaldo: null,
    saldoCents: null,
    pedidoEnviadoEm: null,
    projecao: {
      ritmo: "sem-regua",
      projetadoCents: null,
      fracao: null,
      gastoAteAgoraCents: 0,
    },
    artesCansadas: 0,
  };
}
