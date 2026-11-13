// A loja está gastando o que combinou?
//
// ── As duas perguntas, que são uma só ─────────────────────────────────────
//
// Gastar DEMAIS é problema óbvio: a verba acaba no dia 20 e a loja passa dez
// dias sem anúncio nenhum, bem no fim do mês, que é quando ela mais vende.
//
// Gastar DE MENOS é problema silencioso, e por isso pior. A loja pagou pelo
// mês inteiro, o dinheiro está parado na conta e ninguém reclama — até o dia
// em que ela olha o extrato, vê que investiu metade do combinado e pergunta
// pelo resto. Não existe cobrança pior que essa.
//
// ── Por que projeção e não "já gastou mais que o combinado" ───────────────
//
// Porque comparar o gasto do mês com o total combinado só acusa o problema no
// fim, quando não dá mais pra corrigir. No dia 10, ter gasto um terço da
// verba não diz nada sozinho: diz tudo quando se percebe que nesse ritmo vai
// dar o dobro do contratado.
//
// A projeção é a conta mais simples possível — o que gastou por dia até aqui,
// vezes os dias do mês. Não tenta adivinhar fim de semana nem feriado, e não
// precisa: o que se quer saber é se está MUITO fora, não calcular o centavo.

/** Antes disso o mês é novo demais pra projetar. */
export const DIAS_PRA_PROJETAR = 5;

/** Acima disso do combinado, está acelerado. */
export const TETO = 1.15;

/** Abaixo disso do combinado, está sobrando verba. */
export const PISO = 0.6;

export type RitmoDoMes = "acelerado" | "parado" | "em-linha" | "sem-regua";

export interface Projecao {
  ritmo: RitmoDoMes;
  /** Quanto a loja vai ter gasto no fim do mês, nesse ritmo. */
  projetadoCents: number | null;
  /** A fração do combinado que a projeção representa. 1 = exatamente. */
  fracao: number | null;
  gastoAteAgoraCents: number;
}

export interface DadosDoMes {
  /** O combinado com a loja, em centavos. Null = não há régua. */
  previstoCents: number | null;
  /** Quanto a loja já gastou neste mês. */
  gastoNoMesCents: number;
  /** Quantos dias do mês já passaram, incluindo hoje. */
  diaDoMes: number;
  /** Quantos dias o mês tem. */
  diasNoMes: number;
}

export function projetarOMes(d: DadosDoMes): Projecao {
  const base: Projecao = {
    ritmo: "sem-regua",
    projetadoCents: null,
    fracao: null,
    gastoAteAgoraCents: d.gastoNoMesCents,
  };

  // Sem combinado não há o que comparar — e inventar uma média da casa seria
  // cobrar a loja por um número que ninguém acertou com ela.
  if (!d.previstoCents || d.previstoCents <= 0) return base;

  // Mês novo demais: no dia 2, um único dia parado viraria "a loja está
  // gastando 50% do combinado" e o aviso sairia errado todo começo de mês.
  if (d.diaDoMes < DIAS_PRA_PROJETAR) return base;

  const porDia = d.gastoNoMesCents / d.diaDoMes;
  const projetado = Math.round(porDia * d.diasNoMes);
  const fracao = projetado / d.previstoCents;

  return {
    ritmo: fracao > TETO ? "acelerado" : fracao < PISO ? "parado" : "em-linha",
    projetadoCents: projetado,
    fracao,
    gastoAteAgoraCents: d.gastoNoMesCents,
  };
}

/** "120% do combinado", "45% do combinado". */
export function comoPorcentagem(fracao: number | null): string | null {
  if (fracao === null) return null;
  return `${Math.round(fracao * 100)}% do combinado`;
}

/** O primeiro instante do mês de uma data, no mesmo fuso em que os dias são guardados. */
export function inicioDoMes(agora = new Date()): Date {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1, 12));
}

export function diasDoMes(agora = new Date()): { diaDoMes: number; diasNoMes: number } {
  return {
    diaDoMes: agora.getUTCDate(),
    // Dia 0 do mês seguinte é o último dia deste.
    diasNoMes: new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0)).getUTCDate(),
  };
}
