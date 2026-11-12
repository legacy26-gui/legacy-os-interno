import "server-only";

import { prisma } from "@/lib/prisma";
import { somar, custoPorLead, ctr, desdeQuando, type Numeros, type Janela } from "@/lib/meta/insights";

// De onde vêm os números da tela da loja.
//
// A ideia inteira cabe numa frase: o sistema guarda por ANÚNCIO, e campanha e
// conjunto são somas disso. Por isso os três níveis saem da mesma consulta,
// sempre batendo entre si — a soma dos conjuntos é a campanha porque é
// literalmente a mesma linha somada de outro jeito, não dois números buscados
// em lugares diferentes que um dia discordam.
//
// Duas tabelas, uma pergunta cada:
//   meta_insights_daily — "o que aconteceu nestes N dias" (um dia por linha)
//   meta_lifetime       — "quanto já consumiu desde que nasceu" (um total)

/** Uma linha de qualquer nível da tela. */
export interface Nivel extends Numeros {
  id: string;
  nome: string;
  /** Quantos itens tem dentro (conjuntos numa campanha, anúncios num conjunto). */
  dentro: number;
  cpl: number | null;
  ctrLink: number | null;
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
  clicks: true,
  linkClicks: true,
  leads: true,
} as const;

/**
 * Todas as linhas de anúncio da janela pedida.
 *
 * Traz o grão fino e agrupa em memória. São os anúncios de uma loja num
 * período curto — dezenas, não milhares — e agrupar aqui é o que permite os
 * três níveis sem três consultas que podem discordar.
 */
export async function linhasDaLoja(
  idsDasContas: string[],
  janela: Janela
): Promise<LinhaCrua[]> {
  if (idsDasContas.length === 0) return [];

  if (janela === "tudo") {
    return prisma.metaLifetime.findMany({
      where: { adAccountId: { in: idsDasContas } },
      select: CAMPOS,
    });
  }
  return prisma.metaInsightDaily.findMany({
    where: { adAccountId: { in: idsDasContas }, date: { gte: desdeQuando(janela) } },
    select: CAMPOS,
  });
}

/** Junta linhas por uma chave, somando os números. */
function agrupar(
  linhas: LinhaCrua[],
  chave: (l: LinhaCrua) => { id: string; nome: string },
  contar: (l: LinhaCrua) => string
): Nivel[] {
  const caixas = new Map<string, { nome: string; linhas: LinhaCrua[]; dentro: Set<string> }>();

  for (const l of linhas) {
    const { id, nome } = chave(l);
    if (!caixas.has(id)) caixas.set(id, { nome, linhas: [], dentro: new Set() });
    const caixa = caixas.get(id)!;
    // O nome mais recente vence: campanha renomeada aparece com o nome novo.
    if (nome) caixa.nome = nome;
    caixa.linhas.push(l);
    caixa.dentro.add(contar(l));
  }

  return [...caixas.entries()]
    .map(([id, caixa]) => {
      const n = somar(caixa.linhas);
      return {
        id,
        nome: caixa.nome,
        dentro: caixa.dentro.size,
        cpl: custoPorLead(n),
        ctrLink: ctr(n),
        ...n,
      };
    })
    // Quem mais consumiu dinheiro primeiro: é onde a decisão pesa mais.
    .sort((a, b) => b.spendCents - a.spendCents);
}

export function porCampanha(linhas: LinhaCrua[]): Nivel[] {
  return agrupar(
    linhas,
    (l) => ({ id: l.campaignId ?? "sem-campanha", nome: l.campaignName ?? "Campanha sem nome" }),
    (l) => l.adsetId
  );
}

export function porConjunto(linhas: LinhaCrua[]): Nivel[] {
  return agrupar(linhas, (l) => ({ id: l.adsetId, nome: l.adsetName }), (l) => l.adId);
}

export function porAnuncio(linhas: LinhaCrua[]): Nivel[] {
  return agrupar(linhas, (l) => ({ id: l.adId, nome: l.adName }), (l) => l.adId);
}

/** O nome de uma campanha ou conjunto, pra escrever no caminho de volta. */
export function nomeDe(linhas: LinhaCrua[], campo: "campaignId" | "adsetId", id: string) {
  const achou = linhas.find((l) => l[campo] === id);
  if (!achou) return null;
  return campo === "campaignId" ? (achou.campaignName ?? "Campanha sem nome") : achou.adsetName;
}
