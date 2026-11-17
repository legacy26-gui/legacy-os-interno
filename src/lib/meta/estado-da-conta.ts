// O que a Meta quer dizer com `account_status`.
//
// ── Por que isto existe ───────────────────────────────────────────────────
//
// Porque "a conta está pausada" e "a conta está desativada" são coisas
// diferentes, e o sistema só sabia a primeira.
//
// Campanha pausada é decisão nossa: o anúncio para, o saldo continua lá, a
// conta continua de pé. Conta de anúncio DESATIVADA é a Meta tirando a conta
// do ar — por fatura em aberto, por revisão de política, por risco no
// pagamento. Nesse caso a Meta costuma soltar a forma de pagamento junto, e
// o sintoma que chega até nós é o saldo sumir.
//
// Sem perguntar o status, os dois acabavam na mesma frase sobre forma de
// pagamento — e a frase mandava procurar acesso de administrador quando o
// problema era a conta estar fora do ar.
//
// Este arquivo é puro de propósito: é tradução de número pra frase, a mesma
// no servidor e em qualquer teste, sem banco e sem rede.

/** ACTIVE. O único status em que está tudo certo. */
export const CONTA_ATIVA = 1;

/**
 * Os status que a Meta publica, em português e já no tom de quem vai ler:
 * o que aconteceu, e o que fazer.
 *
 * `201` (ANY_ACTIVE) é um valor de BUSCA, não de conta — a Meta aceita ele
 * como filtro. Está aqui tratado como ativo por garantia, pra uma resposta
 * inesperada não virar alarme falso.
 */
const POR_STATUS: Record<number, string> = {
  2: "a conta de anúncio está DESATIVADA na Meta. Abra a conta no Gerenciador para ver o motivo — enquanto isso ela não veicula e não tem saldo.",
  3: "a conta de anúncio está com PENDÊNCIA DE PAGAMENTO na Meta. Tem fatura em aberto: quite no Gerenciador para a conta voltar.",
  7: "a conta de anúncio está EM ANÁLISE DE RISCO na Meta. Não há o que fazer além de esperar a Meta liberar.",
  8: "a conta de anúncio está AGUARDANDO ACERTO DE PAGAMENTO na Meta.",
  9: "a conta de anúncio está EM PERÍODO DE CARÊNCIA na Meta — tem cobrança pendente e o prazo está correndo.",
  100: "a conta de anúncio está EM PROCESSO DE ENCERRAMENTO na Meta.",
  101: "a conta de anúncio foi ENCERRADA na Meta.",
  202: "a conta de anúncio foi encerrada na Meta.",
};

/**
 * Traduz o status numa frase, ou `null` quando não há o que dizer.
 *
 * Devolve `null` em três casos, e os três são de propósito:
 *
 *   - status 1 (e 201): está tudo certo, não há aviso a dar.
 *   - status ausente: a Meta não mandou o campo. Pode ser permissão, pode ser
 *     versão da API. "Não sei" não pode virar alarme — inventar problema é
 *     tão ruim quanto esconder um.
 *   - número que eu não conheço: a Meta pode criar status novo, e um número
 *     cru na tela ("status 42") não ajuda ninguém. Melhor seguir pro
 *     diagnóstico normal do saldo.
 */
export function problemaDaConta(status: number | null | undefined): string | null {
  if (status === null || status === undefined) return null;
  if (status === CONTA_ATIVA || status === 201) return null;
  return POR_STATUS[status] ?? null;
}
