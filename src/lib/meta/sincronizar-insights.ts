import "server-only";

import { prisma } from "@/lib/prisma";
import { buscarNaGraph } from "./cliente-graph";
import {
  limparLinhas,
  comoDataDaMeta,
  desdeQuando,
  DIAS_DE_INSIGHT,
  type LinhaCrua,
  type LinhaLimpa,
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

/**
 * Quantas linhas por inserção.
 *
 * Não é mais uma viagem por linha — é uma viagem por lote — então o número
 * pode ser alto. 500 mantém o comando num tamanho que o banco engole sem
 * reclamar.
 */
const LINHAS_POR_LOTE = 500;

/**
 * Tira linha repetida do mesmo conjunto no mesmo dia.
 *
 * O banco não aceita duas (a chave é conta + conjunto + dia), e agora que a
 * inserção é em massa uma repetida derrubaria o lote inteiro em vez de só
 * sobrescrever. A última vence.
 */
function semRepetir(linhas: LinhaLimpa[]): LinhaLimpa[] {
  const porChave = new Map<string, LinhaLimpa>();
  for (const l of linhas) porChave.set(`${l.adsetId}|${l.date.toISOString()}`, l);
  return [...porChave.values()];
}

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
 * O relógio da varredura.
 *
 * A função que roda isso tem tempo contado pela Vercel. Quando estoura, ela é
 * MORTA — não lança erro, não cai em try/catch, não deixa mensagem: a tela só
 * morre com "This page couldn't load". Por isso o tempo é controlado aqui
 * dentro, parando antes do limite em vez de descobrir que passou.
 */
export interface Prazo {
  /** Quanto tempo ainda dá pra gastar, em milissegundos. */
  restante(): number;
}

export function prazoDe(ms: number): Prazo {
  const fim = Date.now() + ms;
  return { restante: () => fim - Date.now() };
}

/** Abaixo disso não vale começar outra chamada que pode levar 10 segundos. */
const MINIMO_PRA_TENTAR_MS = 12_000;

export function aindaDaTempo(prazo: Prazo | undefined): boolean {
  return !prazo || prazo.restante() > MINIMO_PRA_TENTAR_MS;
}

/**
 * Busca os últimos 30 dias de uma conta e grava.
 *
 * Pede dia a dia (`time_increment: 1`) de propósito: é o que permite montar
 * qualquer período depois sem nova chamada.
 */
export async function sincronizarInsights(
  conta: ContaPraInsights,
  prazo?: Prazo
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
    // Sem tempo pra outra página: para aqui e grava o que já veio. Meio
    // período gravado é melhor que a função morrer sem gravar nada.
    if (!aindaDaTempo(prazo)) break;
  }

  const linhas = semRepetir(limparLinhas(todas, conta.leadActionType));

  // ── Apaga a janela e regrava, em vez de um upsert por linha ─────────────
  //
  // Antes isto era um upsert por linha. Pareceu natural (cada linha é um dia
  // de um conjunto, o upsert resolve novo e repetido do mesmo jeito) e estava
  // errado pelo motivo que não se vê escrevendo o código: cada upsert é uma
  // IDA E VOLTA até o banco. Cinquenta linhas são cinquenta viagens, e o
  // Prisma derruba qualquer transação que passe de 5 segundos. Numa máquina
  // local, onde o banco responde em 1ms, isso nunca aparece; contra um banco
  // na nuvem, estoura.
  //
  // Agora são DUAS consultas, não importa se vierem 20 linhas ou 2 mil: apaga
  // o período dos conjuntos que vieram agora, e insere tudo de uma vez.
  //
  // Apagar só os conjuntos que vieram (e não a janela inteira) é o que mantém
  // isso seguro quando a busca para no meio por falta de tempo: o que não foi
  // relido continua lá, com o número antigo, em vez de sumir da tela.
  const conjuntos = [...new Set(linhas.map((l) => l.adsetId))];

  await prisma.$transaction(
    async (tx) => {
      if (conjuntos.length > 0) {
        await tx.adsetInsightDaily.deleteMany({
          where: { adAccountId: conta.id, date: { gte: de }, adsetId: { in: conjuntos } },
        });
      }
      for (let i = 0; i < linhas.length; i += LINHAS_POR_LOTE) {
        await tx.adsetInsightDaily.createMany({
          data: linhas.slice(i, i + LINHAS_POR_LOTE).map((l) => ({ adAccountId: conta.id, ...l })),
        });
      }
      // O carimbo entra junto: "esta conta está em dia" só é verdade se os
      // números entraram. Separado, uma falha no meio deixaria a conta
      // marcada como atualizada sem os dados.
      await tx.metaAdAccount.update({
        where: { id: conta.id },
        data: { lastSyncedAt: new Date(), lastSyncError: null },
      });
    },
    // O limite do Prisma é 5s e não dá pra contar com ele: o banco fica longe
    // e a latência varia. 20s cabe com folga e continua bem abaixo do tempo
    // da função.
    { timeout: 20_000, maxWait: 10_000 }
  );

  return { ok: true, linhas: linhas.length, dias: DIAS_DE_INSIGHT };
}

async function registrarErro(contaId: string, erro: string) {
  await prisma.metaAdAccount.update({
    where: { id: contaId },
    data: { lastSyncedAt: new Date(), lastSyncError: erro.slice(0, 300) },
  });
}

/** Todas as contas ativas de um cliente. */
export async function sincronizarInsightsDoCliente(clientId: string, prazo?: Prazo) {
  const contas = await prisma.metaAdAccount.findMany({
    where: { clientId, active: true },
    select: { id: true, metaAccountId: true, leadActionType: true },
  });

  const resultados = [];
  for (const conta of contas) {
    if (!aindaDaTempo(prazo)) break;
    // Em sequência: a Meta limita chamadas por token, e nada aqui tem pressa
    // que justifique levar bloqueio.
    resultados.push({ conta, resultado: await sincronizarInsights(conta, prazo) });
  }
  return resultados;
}
