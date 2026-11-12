import "server-only";

import { prisma } from "@/lib/prisma";
import { buscarNaGraph } from "./cliente-graph";
import { parseSaldoEmCentavos } from "./saldo";

// Buscar o saldo de uma conta e guardar o que foi lido.
//
// ── A regra que manda neste arquivo ───────────────────────────────────────
//
// Se não deu pra ler o saldo, NÃO GRAVA NÚMERO NENHUM.
//
// É a parte mais importante daqui. O caminho fácil seria gravar 0 quando a
// leitura falha — e aí a tela diz "R$ 0,00", alguém vê conta zerada, corre pra
// fazer um Pix que não precisava, ou pior: vê R$ 0,00 numa conta que de fato
// zerou ontem e acha que é o erro de sempre. Número gravado é número em que
// alguém acredita. Falha vira `lastSyncError` e a tela mostra "indisponível",
// que é a verdade: o sistema não sabe.
//
// Por isso cada snapshot é uma linha nova em vez de um campo sobrescrito no
// cliente: saldo é um número que vence, e guardando o histórico dá pra ver o
// consumo entre duas leituras, não só o número de agora.

/** O pedacinho da conta que esta função precisa. */
export interface ContaPraSincronizar {
  id: string;
  metaAccountId: string;
  isPrepay: boolean;
}

export type ResultadoDaSincronizacao =
  | { ok: true; centavos: number }
  | { ok: true; centavos: null; motivo: string }
  | { ok: false; erro: string };

interface RespostaDaConta {
  funding_source_details?: {
    display_string?: string;
  };
}

/**
 * Lê o saldo de uma conta de anúncio e grava o resultado.
 *
 * Grava `BalanceSnapshot` só quando as duas coisas valem: a conta é pré-paga
 * (`isPrepay`) e o parse do texto deu certo. Conta no cartão não tem saldo pra
 * guardar — o número que a Meta devolve ali é limite de crédito, outra coisa.
 *
 * `lastSyncedAt` é atualizado sempre que a Meta respondeu, mesmo sem snapshot:
 * ele diz quando o sistema olhou, não quando o número mudou.
 */
export async function sincronizarSaldo(
  conta: ContaPraSincronizar
): Promise<ResultadoDaSincronizacao> {
  const resposta = await buscarNaGraph<RespostaDaConta>(conta.metaAccountId, {
    fields: "funding_source_details",
  });

  if (!resposta.ok) {
    await registrarErro(conta.id, resposta.erro);
    return { ok: false, erro: resposta.erro };
  }

  const texto = resposta.dados.funding_source_details?.display_string ?? null;

  // Conta no cartão: a Meta respondeu, então a conexão está de pé e o token
  // vale. Só não há saldo pré-pago pra guardar.
  if (!conta.isPrepay) {
    await prisma.metaAdAccount.update({
      where: { id: conta.id },
      data: { lastSyncedAt: new Date(), lastSyncError: null },
    });
    return { ok: true, centavos: null, motivo: "Conta não é pré-paga (sem saldo a acompanhar)." };
  }

  const centavos = parseSaldoEmCentavos(texto);
  if (centavos === null) {
    // A Meta respondeu, mas o texto não tinha valor em reais que dê pra ler
    // com segurança. Pode ser conta sem forma de pagamento, pode ser a Meta
    // tendo mudado a frase. Nos dois casos: erro gravado, número nenhum.
    const erro = texto
      ? "A Meta respondeu, mas não deu pra ler o saldo no texto que ela devolveu."
      : "A Meta não informou a forma de pagamento desta conta.";
    await registrarErro(conta.id, erro);
    return { ok: false, erro };
  }

  // Snapshot e atualização do carimbo na mesma transação: a tela mostra o
  // último snapshot junto com o "atualizado há X", e os dois desencontrados
  // dariam um saldo velho com hora nova.
  await prisma.$transaction([
    prisma.balanceSnapshot.create({
      data: { adAccountId: conta.id, availableCents: centavos },
    }),
    prisma.metaAdAccount.update({
      where: { id: conta.id },
      data: { lastSyncedAt: new Date(), lastSyncError: null },
    }),
  ]);

  return { ok: true, centavos };
}

/**
 * Guarda a falha.
 *
 * `lastSyncedAt` também avança: a tentativa aconteceu, e sem isso não dá pra
 * saber se o erro é de agora ou de três semanas atrás.
 *
 * A mensagem já vem limpa de cliente-graph.ts (sem token). O corte em 300
 * caracteres é pra uma resposta estranha da Meta não virar um texto gigante
 * no banco.
 */
async function registrarErro(contaId: string, erro: string) {
  await prisma.metaAdAccount.update({
    where: { id: contaId },
    data: { lastSyncedAt: new Date(), lastSyncError: erro.slice(0, 300) },
  });
}

/** Todas as contas ativas de um cliente, uma por uma. */
export async function sincronizarSaldosDoCliente(clientId: string) {
  const contas = await prisma.metaAdAccount.findMany({
    where: { clientId, active: true },
    select: { id: true, metaAccountId: true, isPrepay: true },
  });

  const resultados = [];
  for (const conta of contas) {
    // Em sequência e não em paralelo: são uma ou duas contas por loja, e a
    // Meta limita chamadas por token. Nada aqui justifica correr o risco.
    resultados.push({ conta, resultado: await sincronizarSaldo(conta) });
  }
  return resultados;
}
