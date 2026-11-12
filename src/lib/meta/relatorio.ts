import "server-only";

import { prisma } from "@/lib/prisma";
import {
  somar,
  custoPorLead,
  type Numeros,
  type Intervalo,
  type NivelDoRelatorio,
} from "./insights";

// Os números do relatório do cliente.
//
// ── O que entra, e o que fica de fora ─────────────────────────────────────
//
// Quatro números, escolhidos pelo Guilherme: investido, leads, custo por lead
// e visualizações. CTR, cliques, alcance e conjunto ficam de fora de
// propósito — quem lê é o dono da loja, não gestor de tráfego. Número que o
// leitor não sabe usar não informa: atrapalha, porque faz o que importa
// competir por atenção com o que não importa.
//
// É o contrário da tela interna, que mostra tudo. São leitores diferentes.

export interface LinhaDoRelatorio extends Numeros {
  id: string;
  nome: string;
  cpl: number | null;
  /** A arte, quando é anúncio e o sistema a tem. */
  miniatura: string | null;
}

export interface Relatorio {
  loja: string;
  gestor: string | null;
  total: Numeros;
  cplTotal: number | null;
  linhas: LinhaDoRelatorio[];
  /** A arte do anúncio que mais gastou — a "foto" do relatório. */
  fotoDeCapa: string | null;
  /** Falso quando a loja nunca teve leitura boa: aí não se mostra zero. */
  temDados: boolean;
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

/** Monta o relatório de uma loja num período. */
export async function montarRelatorio(
  clientId: string,
  periodo: Intervalo,
  nivel: NivelDoRelatorio
): Promise<Relatorio | null> {
  const cliente = await prisma.client.findUnique({
    where: { id: clientId },
    select: { companyName: true, manager: { select: { name: true } } },
  });
  if (!cliente) return null;

  const contas = await prisma.metaAdAccount.findMany({
    where: { clientId, active: true },
    select: { id: true, lastSyncedAt: true, lastSyncError: true },
  });
  const ids = contas.map((c) => c.id);

  const cru = ids.length
    ? periodo.vidaInteira
      ? await prisma.metaLifetime.findMany({ where: { adAccountId: { in: ids } }, select: CAMPOS })
      : await prisma.metaInsightDaily.findMany({
          where: {
            adAccountId: { in: ids },
            date: {
              ...(periodo.de ? { gte: periodo.de } : {}),
              ...(periodo.ate ? { lte: periodo.ate } : {}),
            },
          },
          select: CAMPOS,
        })
    : [];

  const artes = ids.length
    ? new Map(
        (
          await prisma.metaAdCreative.findMany({
            where: { adAccountId: { in: ids } },
            select: { adId: true, thumbnailUrl: true },
          })
        ).map((a) => [a.adId, a.thumbnailUrl])
      )
    : new Map<string, string | null>();

  // Agrupa no nível pedido. Mesma ideia da tela: o grão guardado é o anúncio,
  // e conjunto e campanha são somas dele — então os três sempre batem.
  const caixas = new Map<string, { nome: string; linhas: typeof cru }>();
  for (const l of cru) {
    const [id, nome] =
      nivel === "anuncio"
        ? [l.adId, l.adName]
        : nivel === "conjunto"
          ? [l.adsetId, l.adsetName]
          : [l.campaignId ?? "sem-campanha", l.campaignName ?? "Campanha sem nome"];
    if (!caixas.has(id)) caixas.set(id, { nome, linhas: [] });
    const caixa = caixas.get(id)!;
    if (nome) caixa.nome = nome;
    caixa.linhas.push(l);
  }

  const linhas: LinhaDoRelatorio[] = [...caixas.entries()]
    .map(([id, caixa]) => {
      const n = somar(caixa.linhas);
      return {
        id,
        nome: caixa.nome,
        cpl: custoPorLead(n),
        miniatura: nivel === "anuncio" ? (artes.get(id) ?? null) : null,
        ...n,
      };
    })
    // Quem mais consumiu dinheiro primeiro.
    .sort((a, b) => b.spendCents - a.spendCents);

  // A foto de capa é a arte do anúncio que mais gastou no período: é a cara
  // da campanha que o dono da loja mais pagou pra rodar.
  //
  // "Que mais gastou E TEM ARTE", não só "que mais gastou": vídeo às vezes
  // volta da Meta sem miniatura, e aí o relatório ficava sem foto nenhuma
  // tendo quatro artes à disposição logo abaixo na lista.
  const porAnuncio = new Map<string, number>();
  for (const l of cru) porAnuncio.set(l.adId, (porAnuncio.get(l.adId) ?? 0) + l.spendCents);
  const fotoDeCapa =
    [...porAnuncio.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([adId]) => artes.get(adId))
      .find((arte) => !!arte) ?? null;

  const total = somar(linhas);

  return {
    loja: cliente.companyName,
    gestor: cliente.manager?.name ?? null,
    total,
    cplTotal: custoPorLead(total),
    linhas,
    fotoDeCapa,
    // Buscado quer dizer buscado COM SUCESSO: num relatório que vai pro
    // cliente, "R$ 0,00 investido" porque a leitura falhou seria pior que
    // não mandar relatório nenhum.
    temDados: contas.some((c) => c.lastSyncedAt && !c.lastSyncError),
  };
}
