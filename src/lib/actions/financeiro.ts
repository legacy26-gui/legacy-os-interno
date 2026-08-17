"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess, getCurrentUser } from "@/lib/dal";

const RevenueSchema = z.object({
  clientId: z.string().min(1, "Selecione um cliente."),
  description: z.string().min(2, "Informe uma descrição."),
  value: z.coerce.number().positive("Valor deve ser maior que zero."),
  dueDate: z.string().min(1, "Informe a data de vencimento."),
  status: z.enum(["PAGO", "PENDENTE", "ATRASADO"]),
});

export type FinanceFormState = { error?: string } | undefined;

export async function createRevenue(_prevState: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  await requireModuleAccess("financeiro");
  const parsed = RevenueSchema.safeParse({
    clientId: formData.get("clientId"),
    description: formData.get("description"),
    value: formData.get("value"),
    dueDate: formData.get("dueDate"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { dueDate, status, ...rest } = parsed.data;
  await prisma.revenue.create({
    data: {
      ...rest,
      status,
      dueDate: new Date(dueDate),
      paidDate: status === "PAGO" ? new Date() : null,
    },
  });
  revalidatePath("/financeiro", "layout");
}

export async function markRevenuePaid(revenueId: string) {
  await requireModuleAccess("financeiro");
  await prisma.revenue.update({ where: { id: revenueId }, data: { status: "PAGO", paidDate: new Date() } });
  revalidatePath("/financeiro", "layout");
}

// Desfaz um "marcar como pago" feito por engano — volta pra pendente.
export async function markRevenueUnpaid(revenueId: string) {
  await requireModuleAccess("financeiro");
  await prisma.revenue.update({ where: { id: revenueId }, data: { status: "PENDENTE", paidDate: null } });
  revalidatePath("/financeiro", "layout");
}

export async function deleteRevenue(revenueId: string) {
  await requireModuleAccess("financeiro");
  await prisma.revenue.delete({ where: { id: revenueId } });
  revalidatePath("/financeiro", "layout");
}

export async function updateRevenueDueDate(revenueId: string, dueDate: string) {
  await requireModuleAccess("financeiro");
  if (!dueDate) return;
  await prisma.revenue.update({ where: { id: revenueId }, data: { dueDate: new Date(dueDate) } });
  revalidatePath("/financeiro", "layout");
}

// Exclui um cliente do fluxo de pagamento mensal (Financeiro) sem mexer no
// status dele em Clientes — some do quadro de MRR e apaga as cobranças
// pendentes deste mês em diante. Cobranças já pagas continuam no histórico.
export async function excludeClientFromBilling(clientId: string) {
  await requireModuleAccess("financeiro");
  await prisma.client.update({ where: { id: clientId }, data: { billingActive: false } });

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  await prisma.revenue.deleteMany({
    where: { clientId, status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { gte: monthStart } },
  });

  revalidatePath("/financeiro", "layout");
}

export async function includeClientInBilling(clientId: string) {
  await requireModuleAccess("financeiro");
  await prisma.client.update({ where: { id: clientId }, data: { billingActive: true } });
  revalidatePath("/financeiro", "layout");
}

// Move o card do quadro de MRR pra outro dia de recebimento — mantém mês/ano,
// só troca o dia (com clamp pro último dia do mês, ex: dia 30 em fevereiro).
export async function moveMrrRevenueToDay(revenueId: string, day: number) {
  await requireModuleAccess("financeiro");
  const revenue = await prisma.revenue.findUnique({ where: { id: revenueId }, select: { dueDate: true } });
  if (!revenue) return;

  const year = revenue.dueDate.getUTCFullYear();
  const month = revenue.dueDate.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const newDueDate = new Date(Date.UTC(year, month, Math.min(day, lastDay)));

  await prisma.revenue.update({ where: { id: revenueId }, data: { dueDate: newDueDate } });
  revalidatePath("/financeiro", "layout");
}

const ExpenseSchema = z.object({
  description: z.string().min(2, "Informe uma descrição."),
  category: z.string().min(1, "Informe a categoria."),
  value: z.coerce.number().positive("Valor deve ser maior que zero."),
  date: z.string().min(1, "Informe a data."),
});

export async function createExpense(_prevState: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const user = await requireModuleAccess("financeiro");
  const parsed = ExpenseSchema.safeParse({
    description: formData.get("description"),
    category: formData.get("category"),
    value: formData.get("value"),
    date: formData.get("date"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { date, ...rest } = parsed.data;
  await prisma.expense.create({
    data: { ...rest, date: new Date(date), responsibleId: user.id },
  });
  revalidatePath("/financeiro", "layout");
}

const FixedExpenseSchema = z.object({
  description: z.string().min(2, "Informe uma descrição."),
  category: z.string().min(1, "Informe a categoria."),
  value: z.coerce.number().positive("Valor deve ser maior que zero."),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
});

export type FixedExpenseFormState = { error?: string } | undefined;

export async function createFixedExpense(
  _prevState: FixedExpenseFormState,
  formData: FormData
): Promise<FixedExpenseFormState> {
  await requireModuleAccess("financeiro");
  const parsed = FixedExpenseSchema.safeParse({
    description: formData.get("description"),
    category: formData.get("category"),
    value: formData.get("value"),
    dueDay: formData.get("dueDay") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  await prisma.fixedExpense.create({ data: parsed.data });
  revalidatePath("/financeiro", "layout");
}

export async function toggleFixedExpenseActive(fixedExpenseId: string, active: boolean) {
  await requireModuleAccess("financeiro");
  await prisma.fixedExpense.update({ where: { id: fixedExpenseId }, data: { active } });
  revalidatePath("/financeiro", "layout");
}

export async function deleteFixedExpense(fixedExpenseId: string) {
  await requireModuleAccess("financeiro");
  await prisma.fixedExpense.delete({ where: { id: fixedExpenseId } });
  revalidatePath("/financeiro", "layout");
}

// Confirma que a saída aconteceu de verdade. Antes disso ela não entra no
// DRE, no DFC nem no lucro — fica só como "a pagar".
export async function markExpensePaid(expenseId: string) {
  await requireModuleAccess("financeiro");
  await prisma.expense.update({ where: { id: expenseId }, data: { paid: true, paidDate: new Date() } });
  revalidatePath("/financeiro", "layout");
}

export async function markExpenseUnpaid(expenseId: string) {
  await requireModuleAccess("financeiro");
  await prisma.expense.update({ where: { id: expenseId }, data: { paid: false, paidDate: null } });
  revalidatePath("/financeiro", "layout");
}

export async function deleteExpense(expenseId: string) {
  await requireModuleAccess("financeiro");
  await prisma.expense.delete({ where: { id: expenseId } });
  revalidatePath("/financeiro", "layout");
}

const CashOpeningSchema = z.object({
  openingBalance: z.coerce.number("Informe um valor válido."),
  openingDate: z.string().min(1, "Informe a data em que conferiu o saldo."),
});

// Saldo conferido no banco numa data. É o ponto de partida do caixa — o
// sistema não lê o extrato, então esse número vem de você. Só entradas e
// saídas posteriores a essa data mexem no saldo.
export async function setCashOpeningBalance(
  _prevState: FinanceFormState,
  formData: FormData
): Promise<FinanceFormState> {
  await requireModuleAccess("financeiro");
  const parsed = CashOpeningSchema.safeParse({
    openingBalance: formData.get("openingBalance"),
    openingDate: formData.get("openingDate"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const data = {
    openingBalance: parsed.data.openingBalance,
    openingDate: new Date(`${parsed.data.openingDate}T00:00:00Z`),
  };

  await prisma.cashSetting.upsert({
    where: { id: "default" },
    update: data,
    create: { id: "default", ...data },
  });
  revalidatePath("/financeiro", "layout");
}

const GoalSchema = z.object({
  month: z.string().min(1),
  targetRevenue: z.coerce.number().positive("Meta deve ser maior que zero."),
});

export async function setMonthlyGoal(_prevState: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  await requireModuleAccess("financeiro");
  const parsed = GoalSchema.safeParse({
    month: formData.get("month"),
    targetRevenue: formData.get("targetRevenue"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  await prisma.monthlyGoal.upsert({
    where: { month: parsed.data.month },
    update: { targetRevenue: parsed.data.targetRevenue },
    create: { month: parsed.data.month, targetRevenue: parsed.data.targetRevenue },
  });
  revalidatePath("/financeiro", "layout");
  revalidatePath("/dashboard");
}

export async function ensureFinanceAccess() {
  return getCurrentUser();
}
