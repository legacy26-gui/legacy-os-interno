import "server-only";

import { prisma } from "@/lib/prisma";
import { achatar, PALAVRAS_DE_FORMATO } from "./entender-pedido";

// O NOME de um anúncio que identifica o carro.
//
// ── Por que isto existe (o erro da Clube Mais, 25/11/2026) ────────────────
//
// Tem loja que dá nome aos anúncios só pelo FORMATO — "Stories", "Video", "Feed - Stories" — e o carro fica no nome do CONJUNTO
// (ou da campanha). O robô olhava só o nome do anúncio: perguntou "qual desses?" listando "Stories / Video / Video / Feed -
// Stories", e quando o Guilherme respondeu com esses nomes, pausou TODO anúncio da loja chamado "Video", de todos os carros (o
// agrupamento "mesmo carro" juntava os anúncios pelo nome, e "Video" era o "mesmo carro" de todos).
//
// Agora o anúncio de nome genérico ganha o nome do conjunto na frente ("FIAT PULSE AUDACE — Stories"), e esse é o nome que o
// robô usa pra achar, agrupar e perguntar.

/** Palavras de formato + ligação: o que sobra disto é o que identifica um carro. */
const DE_FORMATO = new Set([...PALAVRAS_DE_FORMATO, "novo", "nova", "teste", "e", "de", "do", "da", "com"]);

/** O nome do anúncio só fala do formato (não tem palavra de carro)? Pura. */
export function nomeEhGenerico(nome: string): boolean {
  const palavras = achatar(nome).split(" ").filter(Boolean);
  const doCarro = palavras.filter((p) => !DE_FORMATO.has(p) && !/^v?\d{1,2}$/.test(p) && p.length >= 2);
  return doCarro.length === 0;
}

/** O nome que identifica o carro: o do anúncio, ou "CONJUNTO — anúncio" quando o do anúncio é genérico. Pura. */
export function nomeIdentificavel(nomeDoAnuncio: string, conjunto: string | null, campanha: string | null): { nome: string; carro: string } {
  if (!nomeEhGenerico(nomeDoAnuncio)) return { nome: nomeDoAnuncio, carro: nomeDoAnuncio };
  const dono = [conjunto, campanha].find((n) => n && !nomeEhGenerico(n)) ?? conjunto ?? campanha;
  if (!dono) return { nome: nomeDoAnuncio, carro: nomeDoAnuncio };
  return { nome: `${dono.trim()} — ${nomeDoAnuncio.trim()}`, carro: dono.trim() };
}

/** Os nomes do conjunto e da campanha de cada anúncio, pra montar o nome identificável. */
export async function donosDosAnuncios(criativos: { adId: string; adsetId: string | null; campaignId: string | null }[]) {
  const adsets = [...new Set(criativos.map((c) => c.adsetId).filter((x): x is string => !!x))];
  const camps = [...new Set(criativos.map((c) => c.campaignId).filter((x): x is string => !!x))];
  const [conjuntos, campanhas] = await Promise.all([
    adsets.length ? prisma.metaAdset.findMany({ where: { adsetId: { in: adsets } }, select: { adsetId: true, name: true } }) : [],
    camps.length ? prisma.metaCampaign.findMany({ where: { campaignId: { in: camps } }, select: { campaignId: true, name: true } }) : [],
  ]);
  const nomeDoConjunto = new Map(conjuntos.map((c) => [c.adsetId, c.name]));
  const nomeDaCampanha = new Map(campanhas.map((c) => [c.campaignId, c.name]));
  return (c: { adsetId: string | null; campaignId: string | null }) => ({
    conjunto: (c.adsetId && nomeDoConjunto.get(c.adsetId)) || null,
    campanha: (c.campaignId && nomeDaCampanha.get(c.campaignId)) || null,
  });
}
