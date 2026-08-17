// Divisão do mês em semanas do jeito que a equipe fala: semana 1 são os dias
// 1 a 7, semana 2 os dias 8 a 14, e assim por diante. A última semana absorve
// o resto do mês (dias 29-31), então todo mês tem no máximo 5 semanas.

export function weekOfMonthFor(date: Date): number {
  return Math.min(5, Math.ceil(date.getUTCDate() / 7));
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Quantas semanas o mês tem, pela mesma regra (fevereiro tem 4, meses de 31
// dias têm 5).
export function weeksInMonth(ref: Date): number {
  const lastDay = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0)).getUTCDate();
  return Math.min(5, Math.ceil(lastDay / 7));
}

// Faixa de dias de cada semana, pra mostrar "Semana 2 · dias 8 a 14".
export function weekRange(ref: Date, week: number): { from: number; to: number } {
  const lastDay = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0)).getUTCDate();
  const from = (week - 1) * 7 + 1;
  const to = week === weeksInMonth(ref) ? lastDay : Math.min(lastDay, week * 7);
  return { from, to };
}
