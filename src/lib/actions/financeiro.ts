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
  revalidatePath("/financeiro");
}

export async function markRevenuePaid(revenueId: string) {
  await requireModuleAccess("financeiro");
  await prisma.revenue.update({ where: { id: revenueId }, data: { status: "PAGO", paidDate: new Date() } });
  revalidatePath("/financeiro");
}

// Desfaz um "marcar como pago" feito por engano — volta pra pendente.
export async function markRevenueUnpaid(revenueId: string) {
  await requireModuleAccess("financeiro");
  await prisma.revenue.update({ where: { id: revenueId }, data: { status: "PENDENTE", paidDate: null } });
  revalidatePath("/financeiro");
}

export async function deleteRevenue(revenueId: string) {
  await requireModuleAccess("financeiro");
  await prisma.revenue.delete({ where: { id: revenueId } });
  revalidatePath("/financeiro");
}

export async function updateRevenueDueDate(revenueId: string, dueDate: string) {
  await requireModuleAccess("financeiro");
  if (!dueDate) return;
  await prisma.revenue.update({ where: { id: revenueId }, data: { dueDate: new Date(dueDate) } });
  revalidatePath("/financeiro");
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
  revalidatePath("/financeiro");
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
  revalidatePath("/financeiro");
}

export async function deleteExpense(expenseId: string) {
  await requireModuleAccess("financeiro");
  await prisma.expense.delete({ where: { id: expenseId } });
  revalidatePath("/financeiro");
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
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
}

export async function ensureFinanceAccess() {
  return getCurrentUser();
}
