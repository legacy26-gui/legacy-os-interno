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

/**
 * Como esse dia se chama pra quem está olhando: "Hoje", "Amanhã", "Ontem" —
 * ou nada, quando é um dia qualquer e a data já diz tudo.
 *
 * Existe porque ler "12/11" e descobrir sozinho que é hoje dá trabalho, e a
 * tela de gravações é consultada às pressas. Nome vem antes da data.
 *
 * Trabalha com texto aaaa-mm-dd e não com Date de propósito: comparar dia de
 * calendário com objeto de data erra na virada de fuso, e aqui a pergunta é
 * "é o mesmo dia?", não "são o mesmo instante?".
 */
export function apelidoDoDia(dia: string, hoje: string): "Hoje" | "Amanhã" | "Ontem" | null {
  if (dia === hoje) return "Hoje";
  if (dia === diaDaEntrega(hoje, 1)) return "Amanhã";
  if (dia === diaDaEntrega(hoje, -1)) return "Ontem";
  return null;
}
