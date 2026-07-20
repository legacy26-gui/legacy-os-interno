import "server-only";
import { prisma } from "@/lib/prisma";
import type { RevenueModel } from "@/generated/prisma/models";

// Marca as receitas geradas automaticamente a partir do MRR, para diferenciar
// de lançamentos manuais e permitir checagem idempotente por mês.
const MRR_TAG = "[MRR]";

function monthLabel(ref: Date) {
  return ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

function dueDateForMonth(ref: Date, dueDay: number | null) {
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(dueDay ?? 5, lastDay);
  return new Date(Date.UTC(year, month, day));
}

// Garante que todo cliente ativo com mensalidade tenha uma receita "[MRR]"
// lançada para o mês de referência (idempotente — não duplica se já existir).
export async function ensureMonthlyMrrRevenues(ref: Date = new Date()): Promise<number> {
  const monthStart = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1));
  const label = monthLabel(ref);

  const [clients, existing] = await Promise.all([
    prisma.client.findMany({
      where: { status: "ATIVO", monthlyValue: { gt: 0 } },
      select: { id: true, monthlyValue: true, dueDay: true },
    }),
    prisma.revenue.findMany({
      where: { dueDate: { gte: monthStart, lt: monthEnd }, description: { startsWith: MRR_TAG } },
      select: { clientId: true },
    }),
  ]);

  const already = new Set(existing.map((r) => r.clientId));
  const toCreate = clients.filter((c) => !already.has(c.id));
  if (toCreate.length === 0) return 0;

  await prisma.revenue.createMany({
    data: toCreate.map((c) => ({
      clientId: c.id,
      description: `${MRR_TAG} Mensalidade — ${label}`,
      value: c.monthlyValue,
      dueDate: dueDateForMonth(ref, c.dueDay),
      status: "PENDENTE" as const,
    })),
  });

  return toCreate.length;
}

export interface MrrRevenueGroup {
  day: number;
  items: (RevenueModel & { client: { companyName: string } })[];
}

// Busca as receitas de MRR do mês de referência, agrupadas por dia de
// vencimento (5 → 30), do início ao fim do mês.
export async function getMonthlyMrrRevenues(ref: Date = new Date()): Promise<{
  groups: MrrRevenueGroup[];
  totalMonth: number;
  paidTotal: number;
  pendingTotal: number;
}> {
  const monthStart = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1));

  const revenues = await prisma.revenue.findMany({
    where: { dueDate: { gte: monthStart, lt: monthEnd }, description: { startsWith: MRR_TAG } },
    include: { client: { select: { companyName: true } } },
    orderBy: [{ dueDate: "asc" }, { client: { companyName: "asc" } }],
  });

  const byDay = new Map<number, (RevenueModel & { client: { companyName: string } })[]>();
  for (const r of revenues) {
    const day = r.dueDate.getUTCDate();
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(r);
  }

  // Sempre mostra as colunas do dia 5 ao 30, mesmo vazias — são os alvos
  // pra arrastar o card do cliente pro dia de recebimento certo.
  const groups: MrrRevenueGroup[] = Array.from({ length: 26 }, (_, i) => i + 5).map((day) => ({
    day,
    items: byDay.get(day) ?? [],
  }));

  const totalMonth = revenues.reduce((s, r) => s + Number(r.value), 0);
  const paidTotal = revenues.filter((r) => r.status === "PAGO").reduce((s, r) => s + Number(r.value), 0);
  const pendingTotal = totalMonth - paidTotal;

  return { groups, totalMonth, paidTotal, pendingTotal };
}
