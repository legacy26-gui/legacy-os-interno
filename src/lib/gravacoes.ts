// A regra de prazo da gravação, num lugar só.
//
// Sem "server-only" de propósito: o formulário roda no navegador e mostra a
// data da entrega enquanto a pessoa escolhe o dia da gravação. A mesma função
// que mostra é a que grava, então o que aparece na tela é o que vai pro banco.

/** Gravou hoje, entrega amanhã. É o critério que a agência usa. */
export const PRAZO_PADRAO_DIAS = 1;

/**
 * O dia da entrega a partir do dia da gravação (formato aaaa-mm-dd).
 *
 * Soma em UTC de propósito: somar 24 horas num horário local erra o dia nas
 * viradas de horário de verão, e aqui o que importa é "o dia seguinte no
 * calendário", não "24 horas depois".
 */
export function diaDaEntrega(data: string, dias: number = PRAZO_PADRAO_DIAS): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  if (!ano || !mes || !dia) return data;
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** aaaa-mm-dd → dd/mm, pro aviso curto do formulário. */
export function diaCurto(data: string): string {
  const [, mes, dia] = data.split("-");
  return mes && dia ? `${dia}/${mes}` : data;
}
