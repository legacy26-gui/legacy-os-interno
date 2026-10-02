"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess, getCurrentUser } from "@/lib/dal";
import { empresaAtual } from "@/lib/empresa-atual";

// Toda gravação daqui carrega a empresa aberta na tela, e toda alteração de
// registro existente confere que o registro É daquela empresa antes de mexer.
//
// Essa segunda parte é a que importa: o id vem do navegador. Sem a conferência,
// quem tem acesso só ao Treinamentos poderia apagar uma receita da agência
// mandando o id na mão. Por isso os updates/deletes usam updateMany/deleteMany
// com { id, empresa } em vez de update({ where: { id } }).

const RevenueSchema = z.object({
  // Entrada sem cliente existe (curso, venda avulsa) — aí quem identifica é a
  // descrição.
  clientId: z.string().optional(),
  description: z.string().min(2, "Informe uma descrição."),
  value: z.coerce.number().positive("Valor deve ser maior que zero."),
  dueDate: z.string().min(1, "Informe a data de vencimento."),
  status: z.enum(["PAGO", "PENDENTE", "ATRASADO"]),
});

export type FinanceFormState = { error?: string } | undefined;

export async function createRevenue(_prevState: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  await requireModuleAccess("financeiro");
  const empresa = await empresaAtual();
  const parsed = RevenueSchema.safeParse({
    clientId: formData.get("clientId") || undefined,
    description: formData.get("description"),
    value: formData.get("value"),
    dueDate: formData.get("dueDate"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { dueDate, status, clientId, ...rest } = parsed.data;
  // Cliente é da carteira da agência. Se a tela aberta é do Treinamentos, a
  // entrada nasce sem cliente — não dá pra pendurar dinheiro de curso numa loja.
  const clienteValido = empresa === "AGENCIA" && clientId ? clientId : null;
  await prisma.revenue.create({
    data: {
      ...rest,
      empresa,
      clientId: clienteValido,
      status,
      dueDate: new Date(dueDate),
      paidDate: status === "PAGO" ? new Date() : null,
    },
  });
  revalidatePath("/financeiro", "layout");
}

export async function markRevenuePaid(revenueId: string) {
  await requireModuleAccess("financeiro");
  const empresa = await empresaAtual();
  await prisma.revenue.updateMany({
    where: { id: revenueId, empresa },
    data: { status: "PAGO", paidDate: new Date() },
  });
  revalidatePath("/financeiro", "layout");
}

// Desfaz um "marcar como pago" feito por engano — volta pra pendente.
export async function markRevenueUnpaid(revenueId: string) {
  await requireModuleAccess("financeiro");
  const empresa = await empresaAtual();
  await prisma.revenue.updateMany({
    where: { id: revenueId, empresa },
    data: { status: "PENDENTE", paidDate: null },
  });
  revalidatePath("/financeiro", "layout");
}

export async function deleteRevenue(revenueId: string) {
  await requireModuleAccess("financeiro");
  const empresa = await empresaAtual();
  await prisma.revenue.deleteMany({ where: { id: revenueId, empresa } });
  revalidatePath("/financeiro", "layout");
}

export async function updateRevenueDueDate(revenueId: string, dueDate: string) {
  await requireModuleAccess("financeiro");
  if (!dueDate) return;
  const empresa = await empresaAtual();
  await prisma.revenue.updateMany({ where: { id: revenueId, empresa }, data: { dueDate: new Date(dueDate) } });
  revalidatePath("/financeiro", "layout");
}

// Exclui um cliente do fluxo de pagamento mensal (Financeiro) sem mexer no
// status dele em Clientes — some do quadro de MRR e apaga as cobranças
// pendentes deste mês em diante. Cobranças já pagas continuam no histórico.
/**
 * Tira o cliente da cobrança de UM mês — o mês que está aberto na tela.
 *
 * Não desliga o cliente: ele continua no faturamento e volta a ser cobrado no
 * mês seguinte sozinho. Pra parar de vez, o caminho é mudar o status em
 * Clientes; este botão é pro mês em que se negociou, deu cortesia ou pulou.
 */
export async function excludeClientFromBilling(clientId: string, month: string) {
  await requireModuleAccess("financeiro");
  if (!/^\d{4}-\d{2}$/.test(month)) return;

  await prisma.cobrancaPulada.upsert({
    where: { clientId_month: { clientId, month } },
    create: { clientId, month },
    update: {},
  });

  // Apaga só a cobrança em aberto DAQUELE mês. Cobrança já paga fica: ela
  // aconteceu, e mês seguinte não é da conta deste botão.
  const inicio = new Date(`${month}-01T00:00:00.000Z`);
  const fim = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 1));
  await prisma.revenue.deleteMany({
    where: {
      empresa: "AGENCIA",
      clientId,
      status: { in: ["PENDENTE", "ATRASADO"] },
      dueDate: { gte: inicio, lt: fim },
    },
  });

  revalidatePath("/financeiro", "layout");
}

/** Volta o cliente pra cobrança daquele mês. A cobrança é recriada sozinha. */
export async function includeClientInBilling(clientId: string, month: string) {
  await requireModuleAccess("financeiro");
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  await prisma.cobrancaPulada.deleteMany({ where: { clientId, month } });
  revalidatePath("/financeiro", "layout");
}

// Move o card do quadro de MRR pra outro dia de recebimento — mantém mês/ano,
// só troca o dia (com clamp pro último dia do mês, ex: dia 30 em fevereiro).
export async function moveMrrRevenueToDay(revenueId: string, day: number) {
  await requireModuleAccess("financeiro");
  const empresa = await empresaAtual();
  const revenue = await prisma.revenue.findFirst({
    where: { id: revenueId, empresa },
    select: { dueDate: true },
  });
  if (!revenue) return;

  const year = revenue.dueDate.getUTCFullYear();
  const month = revenue.dueDate.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const newDueDate = new Date(Date.UTC(year, month, Math.min(day, lastDay)));

  await prisma.revenue.updateMany({ where: { id: revenueId, empresa }, data: { dueDate: newDueDate } });
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
  const empresa = await empresaAtual();
  const parsed = ExpenseSchema.safeParse({
    description: formData.get("description"),
    category: formData.get("category"),
    value: formData.get("value"),
    date: formData.get("date"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { date, ...rest } = parsed.data;
  await prisma.expense.create({
    data: { ...rest, empresa, date: new Date(date), responsibleId: user.id },
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
  const empresa = await empresaAtual();
  const parsed = FixedExpenseSchema.safeParse({
    description: formData.get("description"),
    category: formData.get("category"),
    value: formData.get("value"),
    dueDay: formData.get("dueDay") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  await prisma.fixedExpense.create({ data: { ...parsed.data, empresa } });
  revalidatePath("/financeiro", "layout");
}

export async function toggleFixedExpenseActive(fixedExpenseId: string, active: boolean) {
  await requireModuleAccess("financeiro");
  const empresa = await empresaAtual();
  await prisma.fixedExpense.updateMany({ where: { id: fixedExpenseId, empresa }, data: { active } });
  revalidatePath("/financeiro", "layout");
}

export async function deleteFixedExpense(fixedExpenseId: string) {
  await requireModuleAccess("financeiro");
  const empresa = await empresaAtual();
  await prisma.fixedExpense.deleteMany({ where: { id: fixedExpenseId, empresa } });
  revalidatePath("/financeiro", "layout");
}

// Confirma que a saída aconteceu de verdade. Antes disso ela não entra no
// DRE, no DFC nem no lucro — fica só como "a pagar".
export async function markExpensePaid(expenseId: string) {
  await requireModuleAccess("financeiro");
  const empresa = await empresaAtual();
  await prisma.expense.updateMany({
    where: { id: expenseId, empresa },
    data: { paid: true, paidDate: new Date() },
  });
  revalidatePath("/financeiro", "layout");
}

export async function markExpenseUnpaid(expenseId: string) {
  await requireModuleAccess("financeiro");
  const empresa = await empresaAtual();
  await prisma.expense.updateMany({
    where: { id: expenseId, empresa },
    data: { paid: false, paidDate: null },
  });
  revalidatePath("/financeiro", "layout");
}

export async function deleteExpense(expenseId: string) {
  await requireModuleAccess("financeiro");
  const empresa = await empresaAtual();
  await prisma.expense.deleteMany({ where: { id: expenseId, empresa } });
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
  const empresa = await empresaAtual();
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
    where: { empresa },
    update: data,
    // O id antigo era sempre "default", de quando havia um caixa só. Agora é um
    // por empresa, então o id passa a ser o nome dela.
    create: { id: empresa.toLowerCase(), empresa, ...data },
  });
  revalidatePath("/financeiro", "layout");
}

const GoalSchema = z.object({
  month: z.string().min(1),
  targetRevenue: z.coerce.number().positive("Meta deve ser maior que zero."),
});

export async function setMonthlyGoal(_prevState: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  await requireModuleAccess("financeiro");
  const empresa = await empresaAtual();
  const parsed = GoalSchema.safeParse({
    month: formData.get("month"),
    targetRevenue: formData.get("targetRevenue"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  await prisma.monthlyGoal.upsert({
    where: { empresa_month: { empresa, month: parsed.data.month } },
    update: { targetRevenue: parsed.data.targetRevenue },
    create: { empresa, month: parsed.data.month, targetRevenue: parsed.data.targetRevenue },
  });
  revalidatePath("/financeiro", "layout");
  revalidatePath("/dashboard");
}

export async function ensureFinanceAccess() {
  return getCurrentUser();
}
