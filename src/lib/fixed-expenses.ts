import "server-only";
import { prisma } from "@/lib/prisma";

function dueDateForMonth(ref: Date, dueDay: number | null) {
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(dueDay ?? 5, lastDay);
  return new Date(Date.UTC(year, month, day));
}

// Garante que toda despesa fixa ativa tenha um lançamento no mês de
// referência (idempotente — não duplica se já existir).
export async function ensureMonthlyFixedExpenses(ref: Date = new Date()): Promise<number> {
  const monthStart = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1));

  const [fixedExpenses, existing] = await Promise.all([
    prisma.fixedExpense.findMany({ where: { active: true } }),
    prisma.expense.findMany({
      where: { date: { gte: monthStart, lt: monthEnd }, fixedExpenseId: { not: null } },
      select: { fixedExpenseId: true },
    }),
  ]);

  const already = new Set(existing.map((e) => e.fixedExpenseId));
  const toCreate = fixedExpenses.filter((f) => !already.has(f.id));
  if (toCreate.length === 0) return 0;

  await prisma.expense.createMany({
    data: toCreate.map((f) => ({
      description: f.description,
      category: f.category,
      value: f.value,
      date: dueDateForMonth(ref, f.dueDay),
      fixedExpenseId: f.id,
    })),
  });

  return toCreate.length;
}
