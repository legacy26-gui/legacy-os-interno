import "server-only";

import { prisma } from "@/lib/prisma";
import { getCashFlow } from "@/lib/metrics";
import type { Empresa } from "@/generated/prisma/client";
import { diaDaCasa } from "@/lib/dia-da-casa";
import { reais } from "./interpretar-gasto";

// A projeção do fim do mês: com quanto de caixa o mês fecha.
//
//   saldo em caixa hoje                       ← o que ele informou + o que entrou/saiu desde então
//   (+) a receber no mês                      ← a MESMA conta do "A receber" da Análise financeira
//   (−) gastos fixos e contas a pagar         ← saídas do mês que ainda não foram confirmadas
//   (−) gastos do dia a dia, no ritmo atual   ← estimativa (média por dia × dias que faltam)
//   ─────────────────────────────────────────
//   = como o mês fecha
//
// ── O que NÃO entra, e por quê ───────────────────────────────────────────
//
// - Cobrança atrasada de MESES ANTERIORES: não está no "a receber" da Análise e ninguém
//   sabe se entra. Aparece numa linha à parte, fora da conta.
// - Entrada que já foi confirmada: já está dentro do saldo de hoje. Somar de novo seria
//   contar duas vezes.
//
// O "ritmo atual" é a única linha que é palpite, e por isso vem separada: o número
// "sem contar novos gastos do dia a dia" também aparece, pra ele ver os dois.

export interface Projecao {
  empresa: Empresa;
  /** null quando o saldo em caixa nunca foi informado: sem ele não há projeção honesta. */
  saldoHojeCents: number | null;
  conferidoEm: Date | null;
  aReceberCents: number;
  aReceberQtd: number;
  aPagarCents: number;
  aPagarQtd: number;
  ritmoCents: number;
  diasQueFaltam: number;
  /** Cobrança atrasada de meses anteriores: fora da conta. */
  atrasadoAntigoCents: number;
  semRitmoCents: number | null;
  fechaEmCents: number | null;
  mesRotulo: string;
}

const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);

export async function projetarFimDoMes(empresa: Empresa, agora: Date = new Date()): Promise<Projecao> {
  const hoje = diaDaCasa(agora);
  const [ano, mes, dia] = hoje.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 1));
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const diasQueFaltam = Math.max(diasNoMes - dia, 0);

  const [cf, receber, antigos, aPagar, variaveis, retiradas, caixa] = await Promise.all([
    getCashFlow(empresa, inicio, 1),
    // A mesma regra do "A receber" da Análise: pendente/atrasado com vencimento neste mês.
    prisma.revenue.aggregate({
      where: { empresa, status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { gte: inicio, lt: fim } },
      _sum: { value: true },
      _count: true,
    }),
    prisma.revenue.aggregate({
      where: { empresa, status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { lt: inicio } },
      _sum: { value: true },
    }),
    // Saída do mês que ainda não saiu: fixos aguardando confirmação e contas lançadas a pagar.
    prisma.expense.aggregate({
      where: { empresa, paid: false, date: { gte: inicio, lt: fim } },
      _sum: { value: true },
      _count: true,
    }),
    // Dia a dia: o que já saiu no mês e NÃO é fixo.
    prisma.expense.aggregate({
      where: { empresa, paid: true, fixedExpenseId: null, date: { gte: inicio, lt: fim } },
      _sum: { value: true },
    }),
    // Retirada pessoal também é dinheiro que sai do caixa.
    prisma.gastoPessoal.aggregate({
      where: { empresa, date: { gte: inicio, lt: fim } },
      _sum: { value: true },
    }),
    prisma.cashSetting.findUnique({ where: { empresa } }),
  ]);

  const saldoHoje = cf.saldoEmCaixa === null ? null : Math.round(cf.saldoEmCaixa * 100);
  const gastoDoDiaADia = cents(variaveis._sum.value) + cents(retiradas._sum.value);
  const ritmoCents = dia > 0 ? Math.round((gastoDoDiaADia / dia) * diasQueFaltam) : 0;

  const aReceberCents = cents(receber._sum.value);
  const aPagarCents = cents(aPagar._sum.value);
  const semRitmo = saldoHoje === null ? null : saldoHoje + aReceberCents - aPagarCents;
  const rotulo = inicio.toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });

  return {
    empresa,
    saldoHojeCents: saldoHoje,
    conferidoEm: caixa?.updatedAt ?? null,
    aReceberCents,
    aReceberQtd: receber._count,
    aPagarCents,
    aPagarQtd: aPagar._count,
    ritmoCents,
    diasQueFaltam,
    atrasadoAntigoCents: cents(antigos._sum.value),
    semRitmoCents: semRitmo,
    fechaEmCents: semRitmo === null ? null : semRitmo - ritmoCents,
    mesRotulo: rotulo,
  };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** A projeção como o robô escreve no WhatsApp. */
export function textoDaProjecao(p: Projecao): string {
  if (p.saldoHojeCents === null) {
    return "Ainda não sei o seu saldo em caixa. Me fala: *meu saldo é 12.500* — e eu passo a descontar cada gasto e somar cada entrada.";
  }
  const linhas = [
    `*Saldo em caixa hoje:* ${reais(p.saldoHojeCents)}`,
    `(+) A receber em ${p.mesRotulo}: ${reais(p.aReceberCents)} (${plural(p.aReceberQtd, "cobrança", "cobranças")})`,
    `(−) Fixos e contas a pagar: ${reais(p.aPagarCents)} (${plural(p.aPagarQtd, "saída", "saídas")})`,
  ];
  if (p.diasQueFaltam > 0) {
    linhas.push(`(−) Gastos do dia a dia até o fim do mês: ${reais(p.ritmoCents)} (estimativa pelo ritmo, ${p.diasQueFaltam} ${p.diasQueFaltam === 1 ? "dia" : "dias"})`);
  }
  linhas.push("", `*O mês fecha com:* ${reais(p.fechaEmCents ?? 0)}`);
  if (p.diasQueFaltam > 0) linhas.push(`Sem contar novos gastos do dia a dia: ${reais(p.semRitmoCents ?? 0)}`);
  if (p.atrasadoAntigoCents > 0) {
    linhas.push("", `Fora da conta: ${reais(p.atrasadoAntigoCents)} de cobranças atrasadas de meses anteriores.`);
  }
  return linhas.join("\n");
}
