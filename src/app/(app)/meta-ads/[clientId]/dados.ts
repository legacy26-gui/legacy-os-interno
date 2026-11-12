import "server-only";

import { prisma } from "@/lib/prisma";
import { somar, custoPorLead, ctr, ZERO, type Numeros, type Intervalo } from "@/lib/meta/insights";

// De onde vêm as linhas da tela da loja.
//
// ── A ideia inteira numa frase ────────────────────────────────────────────
//
// O CADASTRO manda em quem aparece; os NÚMEROS só preenchem.
//
// Antes era o contrário: a lista saía dos insights, e aí campanha que não
// gastou nada no período simplesmente não existia na tela. Campanha pausada
// há duas semanas sumia — e sumir é a pior forma de mostrar que algo está
// desligado, porque ninguém procura o que não vê. Justamente a campanha que
// alguém precisa reparar que está parada.
//
// Agora a lista vem de meta_campaigns / meta_adsets / meta_ad_creatives, e os
// números entram por cima quando existem. Quem não gastou aparece zerado, com
// a chave mostrando que está pausado.

export type Nivel = "campanha" | "conjunto" | "anuncio";

export interface LinhaDaTela extends Numeros {
  id: string;
  nome: string;
  /** ACTIVE, PAUSED… como a Meta escreve. Null quando não temos o cadastro. */
  status: string | null;
  /** Já considerando campanha e conjunto acima. É o que de fato vale. */
  statusEfetivo: string | null;
  /** Em centavos, e se é por dia ou pelo total. */
  orcamentoCents: number | null;
  orcamentoDiario: boolean;
  /** Quantos itens tem dentro (conjuntos na campanha, anúncios no conjunto). */
  dentro: number;
  cpl: number | null;
  ctrLink: number | null;
  /** Só no anúncio. */
  miniatura?: string | null;
  preview?: string | null;
  /** Pra descer um nível. */
  filho?: string | null;
}

interface LinhaCrua extends Numeros {
  adId: string;
  adName: string;
  adsetId: string;
  adsetName: string;
  campaignId: string | null;
  campaignName: string | null;
}

const CAMPOS = {
  adId: true,
  adName: true,
  adsetId: true,
  adsetName: true,
  campaignId: true,
  campaignName: true,
  spendCents: true,
  impressions: true,
  reach: true,
  clicks: true,
  linkClicks: true,
  leads: true,
} as const;

export async function linhasDaLoja(
  idsDasContas: string[],
  periodo: Intervalo
): Promise<LinhaCrua[]> {
  if (idsDasContas.length === 0) return [];

  if (periodo.vidaInteira) {
    return prisma.metaLifetime.findMany({
      where: { adAccountId: { in: idsDasContas } },
      select: CAMPOS,
    });
  }
  return prisma.metaInsightDaily.findMany({
    where: {
      adAccountId: { in: idsDasContas },
      date: {
        ...(periodo.de ? { gte: periodo.de } : {}),
        ...(periodo.ate ? { lte: periodo.ate } : {}),
      },
    },
    select: CAMPOS,
  });
}

/** O cadastro: campanhas, conjuntos e anúncios que EXISTEM na conta. */
export async function cadastroDaLoja(idsDasContas: string[]) {
  if (idsDasContas.length === 0) {
    return { campanhas: [], conjuntos: [], anuncios: [] };
  }
  const [campanhas, conjuntos, anuncios] = await Promise.all([
    prisma.metaCampaign.findMany({
      where: { adAccountId: { in: idsDasContas } },
      select: {
        campaignId: true,
        name: true,
        status: true,
        effectiveStatus: true,
        dailyBudgetCents: true,
        lifetimeBudgetCents: true,
      },
    }),
    prisma.metaAdset.findMany({
      where: { adAccountId: { in: idsDasContas } },
      select: {
        adsetId: true,
        campaignId: true,
        name: true,
        status: true,
        effectiveStatus: true,
        dailyBudgetCents: true,
        lifetimeBudgetCents: true,
      },
    }),
    prisma.metaAdCreative.findMany({
      where: { adAccountId: { in: idsDasContas } },
      select: {
        adId: true,
        adsetId: true,
        campaignId: true,
        adName: true,
        status: true,
        effectiveStatus: true,
        thumbnailUrl: true,
        previewUrl: true,
      },
    }),
  ]);
  return { campanhas, conjuntos, anuncios };
}

export type Cadastro = Awaited<ReturnType<typeof cadastroDaLoja>>;

/** Soma as linhas de números por uma chave. */
function somarPor(linhas: LinhaCrua[], chave: (l: LinhaCrua) => string) {
  const caixas = new Map<string, LinhaCrua[]>();
  for (const l of linhas) {
    const k = chave(l);
    if (!caixas.has(k)) caixas.set(k, []);
    caixas.get(k)!.push(l);
  }
  return new Map([...caixas.entries()].map(([k, ls]) => [k, somar(ls)]));
}

function completar(n: Numeros, extras: Omit<LinhaDaTela, keyof Numeros>): LinhaDaTela {
  return { ...n, ...extras, cpl: custoPorLead(n), ctrLink: ctr(n) };
}

/**
 * Monta as linhas do nível pedido.
 *
 * `filtro` é a campanha ou o conjunto aberto — quando há, a lista é só do que
 * está dentro dele.
 */
export function montarNivel(
  nivel: Nivel,
  cadastro: Cadastro,
  numeros: LinhaCrua[],
  filtro: { campanha?: string | null; conjunto?: string | null }
): LinhaDaTela[] {
  if (nivel === "campanha") {
    const porId = somarPor(numeros, (l) => l.campaignId ?? "sem-campanha");
    // Nome vindo dos números, pra campanha que já saiu do cadastro mas tem
    // gasto no período: ela precisa aparecer, senão o total não fecha.
    const nomesSoltos = new Map(
      numeros.filter((l) => l.campaignId).map((l) => [l.campaignId!, l.campaignName ?? l.campaignId!])
    );
    const ids = new Set([...cadastro.campanhas.map((c) => c.campaignId), ...porId.keys()]);
    const porCadastro = new Map(cadastro.campanhas.map((c) => [c.campaignId, c]));

    return [...ids]
      .map((id) => {
        const c = porCadastro.get(id);
        const dentro = cadastro.conjuntos.filter((s) => s.campaignId === id).length;
        return completar(porId.get(id) ?? { ...ZERO }, {
          id,
          nome: c?.name ?? nomesSoltos.get(id) ?? "Campanha sem nome",
          status: c?.status ?? null,
          statusEfetivo: c?.effectiveStatus ?? null,
          orcamentoCents: c?.dailyBudgetCents ?? c?.lifetimeBudgetCents ?? null,
          orcamentoDiario: !!c?.dailyBudgetCents,
          dentro,
          cpl: null,
          ctrLink: null,
          filho: id,
        });
      })
      .sort(ordenar);
  }

  if (nivel === "conjunto") {
    const doFiltro = filtro.campanha
      ? numeros.filter((l) => (l.campaignId ?? "sem-campanha") === filtro.campanha)
      : numeros;
    const porId = somarPor(doFiltro, (l) => l.adsetId);
    const conjuntos = filtro.campanha
      ? cadastro.conjuntos.filter((s) => s.campaignId === filtro.campanha)
      : cadastro.conjuntos;
    const nomesSoltos = new Map(doFiltro.map((l) => [l.adsetId, l.adsetName]));
    const ids = new Set([...conjuntos.map((s) => s.adsetId), ...porId.keys()]);
    const porCadastro = new Map(conjuntos.map((s) => [s.adsetId, s]));

    return [...ids]
      .map((id) => {
        const s = porCadastro.get(id);
        const dentro = cadastro.anuncios.filter((a) => a.adsetId === id).length;
        return completar(porId.get(id) ?? { ...ZERO }, {
          id,
          nome: s?.name ?? nomesSoltos.get(id) ?? "Conjunto sem nome",
          status: s?.status ?? null,
          statusEfetivo: s?.effectiveStatus ?? null,
          orcamentoCents: s?.dailyBudgetCents ?? s?.lifetimeBudgetCents ?? null,
          orcamentoDiario: !!s?.dailyBudgetCents,
          dentro,
          cpl: null,
          ctrLink: null,
          filho: id,
        });
      })
      .sort(ordenar);
  }

  // Anúncios
  const doFiltro = filtro.conjunto
    ? numeros.filter((l) => l.adsetId === filtro.conjunto)
    : filtro.campanha
      ? numeros.filter((l) => (l.campaignId ?? "sem-campanha") === filtro.campanha)
      : numeros;
  const porId = somarPor(doFiltro, (l) => l.adId);
  const anuncios = filtro.conjunto
    ? cadastro.anuncios.filter((a) => a.adsetId === filtro.conjunto)
    : filtro.campanha
      ? cadastro.anuncios.filter((a) => a.campaignId === filtro.campanha)
      : cadastro.anuncios;
  const nomesSoltos = new Map(doFiltro.map((l) => [l.adId, l.adName]));
  const ids = new Set([...anuncios.map((a) => a.adId), ...porId.keys()]);
  const porCadastro = new Map(anuncios.map((a) => [a.adId, a]));

  return [...ids]
    .map((id) => {
      const a = porCadastro.get(id);
      return completar(porId.get(id) ?? { ...ZERO }, {
        id,
        nome: a?.adName ?? nomesSoltos.get(id) ?? "Anúncio sem nome",
        status: a?.status ?? null,
        statusEfetivo: a?.effectiveStatus ?? null,
        // Anúncio não tem orçamento próprio: quem tem é o conjunto.
        orcamentoCents: null,
        orcamentoDiario: false,
        dentro: 0,
        cpl: null,
        ctrLink: null,
        miniatura: a?.thumbnailUrl ?? null,
        preview: a?.previewUrl ?? null,
        filho: null,
      });
    })
    .sort(ordenar);
}

/**
 * Quem gastou mais primeiro; entre os que não gastaram, por nome.
 *
 * Gasto zero empatado é a maioria numa conta com muita campanha velha — sem o
 * desempate por nome a ordem mudaria a cada carregamento, e lista que se
 * mexe sozinha ninguém consegue usar.
 */
function ordenar(a: LinhaDaTela, b: LinhaDaTela) {
  return b.spendCents - a.spendCents || a.nome.localeCompare(b.nome, "pt-BR");
}

/** O nome de uma campanha ou conjunto, pro caminho de volta. */
export function nomeNoCadastro(cadastro: Cadastro, nivel: "campanha" | "conjunto", id: string) {
  if (nivel === "campanha") {
    return cadastro.campanhas.find((c) => c.campaignId === id)?.name ?? null;
  }
  return cadastro.conjuntos.find((s) => s.adsetId === id)?.name ?? null;
}

/** Está entregando? É o status EFETIVO que responde, não o próprio. */
export function estaLigado(l: LinhaDaTela): boolean {
  return (l.statusEfetivo ?? l.status) === "ACTIVE";
}
