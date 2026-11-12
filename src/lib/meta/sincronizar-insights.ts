import "server-only";

import { prisma } from "@/lib/prisma";
import { buscarNaGraph } from "./cliente-graph";
import {
  limparLinhas,
  comoDataDaMeta,
  desdeQuando,
  DIAS_DE_INSIGHT,
  type LinhaCrua,
} from "./insights";

// Buscar os números das campanhas e guardar.
//
// Mesma regra do saldo, pelo mesmo motivo: se a busca falhou, NÃO grava
// número nenhum — o que já estava guardado continua lá, com a data dele, e o
// erro aparece na tela. Número velho identificado como velho é útil; número
// novo inventado não é.
//
// Por que por CONJUNTO (adset) e por DIA, e não um total por campanha: total
// não se desfaz. Guardando o grão fino dá pra somar por campanha, por semana,
// por mês, e comparar duas semanas — tudo sem voltar na Meta. O contrário é
// impossível.

/** Quantas páginas de resposta seguir antes de parar. */
const MAX_PAGINAS = 10;

/** Quantas linhas pedir por página. */
const POR_PAGINA = 300;

/** Quantas linhas gravar por vez. Lote grande demais estoura o tempo. */
const LINHAS_POR_LOTE = 50;

export type ResultadoDosInsights =
  | { ok: true; linhas: number; dias: number }
  | { ok: false; erro: string };

interface RespostaInsights {
  data?: LinhaCrua[];
  paging?: { cursors?: { after?: string }; next?: string };
}

export interface ContaPraInsights {
  id: string;
  metaAccountId: string;
  leadActionType: string;
}

/**
 * Busca os últimos 30 dias de uma conta e grava.
 *
 * Pede dia a dia (`time_increment: 1`) de propósito: é o que permite montar
 * qualquer período depois sem nova chamada.
 */
export async function sincronizarInsights(
  conta: ContaPraInsights
): Promise<ResultadoDosInsights> {
  const ate = new Date();
  const de = desdeQuando(DIAS_DE_INSIGHT, ate);

  const params: Record<string, string> = {
    level: "adset",
    time_increment: "1",
    time_range: JSON.stringify({
      since: comoDataDaMeta(de),
      until: comoDataDaMeta(ate),
    }),
    fields:
      "adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,actions",
    limit: String(POR_PAGINA),
  };

  const todas: LinhaCrua[] = [];
  let depois: string | undefined;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    // A paginação vai pelo cursor `after` e NÃO seguindo a URL `next` que a
    // Meta devolve: aquela URL vem com o token dentro. Seguir ela colocaria o
    // token em lugares que este sistema inteiro foi feito pra evitar.
    const resposta = await buscarNaGraph<RespostaInsights>(`${conta.metaAccountId}/insights`, {
      ...params,
      ...(depois ? { after: depois } : {}),
    });

    if (!resposta.ok) {
      await registrarErro(conta.id, resposta.erro);
      return { ok: false, erro: resposta.erro };
    }

    const lote = resposta.dados.data ?? [];
    todas.push(...lote);

    depois = resposta.dados.paging?.cursors?.after;
    // Sem próxima página, ou página vazia: acabou.
    if (!resposta.dados.paging?.next || lote.length === 0) break;
  }

  const linhas = limparLinhas(todas, conta.leadActionType);

  // Grava em lotes, e não tudo numa transação só.
  //
  // Trinta dias × todos os conjuntos de uma conta grande passa fácil de mil
  // linhas, e uma transação desse tamanho num banco na nuvem estoura o tempo
  // da função — e aí NADA entra, nem o que já tinha sido lido.
  //
  // O preço é que uma falha no meio deixa parte do período gravada. Dá pra
  // conviver: cada linha é um dia de um conjunto, o upsert é idempotente, e
  // apertar o botão de novo completa o que faltou. Perder tudo por causa do
  // tamanho seria pior.
  for (let i = 0; i < linhas.length; i += LINHAS_POR_LOTE) {
    const lote = linhas.slice(i, i + LINHAS_POR_LOTE);
    await prisma.$transaction(
      lote.map((l) =>
        prisma.adsetInsightDaily.upsert({
        where: {
          adAccountId_adsetId_date: {
            adAccountId: conta.id,
            adsetId: l.adsetId,
            date: l.date,
          },
        },
        // Sempre sobrescreve: a Meta reprocessa os últimos dias, e o número
        // dela é a verdade. O nosso é cópia.
        update: {
          adsetName: l.adsetName,
          campaignId: l.campaignId,
          campaignName: l.campaignName,
          spendCents: l.spendCents,
          impressions: l.impressions,
          clicks: l.clicks,
          linkClicks: l.linkClicks,
          leads: l.leads,
        },
        create: { adAccountId: conta.id, ...l },
        })
      )
    );
  }

  // O carimbo vai por último, fora dos lotes: ele diz "esta conta está em
  // dia", e só é verdade depois que tudo entrou.
  await prisma.metaAdAccount.update({
    where: { id: conta.id },
    data: { lastSyncedAt: new Date(), lastSyncError: null },
  });

  return { ok: true, linhas: linhas.length, dias: DIAS_DE_INSIGHT };
}

async function registrarErro(contaId: string, erro: string) {
  await prisma.metaAdAccount.update({
    where: { id: contaId },
    data: { lastSyncedAt: new Date(), lastSyncError: erro.slice(0, 300) },
  });
}

/** Todas as contas ativas de um cliente. */
export async function sincronizarInsightsDoCliente(clientId: string) {
  const contas = await prisma.metaAdAccount.findMany({
    where: { clientId, active: true },
    select: { id: true, metaAccountId: true, leadActionType: true },
  });

  const resultados = [];
  for (const conta of contas) {
    // Em sequência: a Meta limita chamadas por token, e nada aqui tem pressa
    // que justifique levar bloqueio.
    resultados.push({ conta, resultado: await sincronizarInsights(conta) });
  }
  return resultados;
}
