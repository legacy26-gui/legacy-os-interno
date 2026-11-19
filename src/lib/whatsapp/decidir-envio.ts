// Sai sozinho, ou passa por gente antes?
//
// ── A regra, e de onde ela vem ───────────────────────────────────────────
//
// Do Guilherme: relatório com custo por lead ABAIXO de R$ 12 vai automático
// pro grupo do cliente; de R$ 12 pra cima vai pra Andrielli aprovar, toda
// segunda.
//
// O raciocínio por trás é bom e vale escrever: relatório de semana boa se
// manda sozinho — o cliente abre, vê lead barato, fica satisfeito, ninguém
// precisa estar no meio. Relatório de semana cara é outra conversa. Ele
// chega no grupo e a primeira reação do dono da loja é "por que subiu?". Se
// ninguém da casa olhou antes, quem recebe a pergunta é um robô, e a agência
// descobre o problema junto com o cliente — pelo WhatsApp dele.
//
// Então o corte não é sobre o número: é sobre quem fala primeiro.
//
// ── Por que isto é um arquivo só, puro ───────────────────────────────────
//
// Porque é A regra de negócio daqui, e porque mudar o valor de R$ 12 tem que
// ser mexer num lugar e em mais nenhum. Sem banco e sem rede, dá pra provar
// os quatro casos — inclusive os dois que não são sobre custo alto — sem
// subir nada.

/**
 * O teto do envio automático, em centavos.
 *
 * R$ 12,00. "Abaixo de 12 envia automático, acima de 12 vai aprovar" —
 * então exatamente R$ 12,00 vai pra aprovação, porque não está abaixo. O
 * lado conservador do empate é o que põe um par de olhos a mais, e é o lado
 * barato de errar.
 */
export const TETO_DO_CPL_AUTOMATICO = 1200;

/** Por que um relatório ficou esperando. */
export type MotivoDaEspera =
  /** Custo por lead de R$ 12 pra cima. */
  | "cpl-alto"
  /** Gastou e não trouxe lead nenhum: não há custo por lead, há prejuízo. */
  | "sem-lead"
  /** Não gastou nada na semana — o relatório sairia zerado. */
  | "sem-gasto";

export type Decisao =
  | { tipo: "manda" }
  | { tipo: "aprovar"; motivo: MotivoDaEspera };

export const EXPLICACAO: Record<MotivoDaEspera, string> = {
  "cpl-alto": "Custo por lead de R$ 12 ou mais",
  "sem-lead": "Gastou e não trouxe nenhum lead",
  "sem-gasto": "Não houve investimento na semana",
};

/**
 * Decide o destino do relatório de uma loja.
 *
 * ── Os dois casos que não são sobre custo alto ───────────────────────────
 *
 * O custo por lead é `null` quando não houve lead, e `null` não é "barato".
 * São duas situações bem diferentes escondidas no mesmo vazio:
 *
 *   gastou e não trouxe lead  → é o pior resultado possível da semana, e o
 *                               que mais precisa de alguém explicando antes
 *                               de chegar no grupo do cliente.
 *   não gastou nada           → o relatório sai todo zerado. Mandar isso
 *                               sozinho é o cliente descobrir por uma imagem
 *                               que a semana dele não rodou.
 *
 * Tratar `null` como "abaixo de 12" mandaria os dois automaticamente — os
 * dois piores da fila, justamente os que ninguém olhou.
 */
export function decidirEnvio(
  cplCents: number | null,
  spendCents: number,
  teto: number = TETO_DO_CPL_AUTOMATICO,
): Decisao {
  if (cplCents === null) {
    return {
      tipo: "aprovar",
      motivo: spendCents > 0 ? "sem-lead" : "sem-gasto",
    };
  }
  if (cplCents >= teto) return { tipo: "aprovar", motivo: "cpl-alto" };
  return { tipo: "manda" };
}
