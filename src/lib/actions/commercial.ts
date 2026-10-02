"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { empresaAtual } from "@/lib/empresa-atual";

const EventSchema = z.object({
  type: z.enum(["VENDA", "CHURN"]),
  companyName: z.string().min(1, "Informe uma descrição."),
  value: z.coerce.number().min(0, "Valor inválido."),
  date: z.string().min(1, "Informe a data."),
});

export type CommercialEventFormState = { error?: string } | undefined;

function parseEventForm(formData: FormData) {
  return EventSchema.safeParse({
    type: formData.get("type"),
    companyName: formData.get("companyName"),
    value: formData.get("value"),
    date: formData.get("date"),
  });
}

export async function createCommercialEvent(
  _prevState: CommercialEventFormState,
  formData: FormData
): Promise<CommercialEventFormState> {
  await requireModuleAccess("comercial");

  const parsed = parseEventForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await prisma.commercialEvent.create({
    data: {
      empresa: await empresaAtual(),
      type: parsed.data.type,
      companyName: parsed.data.companyName,
      value: parsed.data.value,
      createdAt: new Date(parsed.data.date),
    },
  });

  revalidatePath("/comercial");
  redirect("/comercial");
}

export async function updateCommercialEvent(
  eventId: string,
  _prevState: CommercialEventFormState,
  formData: FormData
): Promise<CommercialEventFormState> {
  await requireModuleAccess("comercial");

  const parsed = parseEventForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // updateMany com a empresa no where: o id vem do navegador, então mexer num
  // evento de outra empresa simplesmente não acha nada pra alterar.
  await prisma.commercialEvent.updateMany({
    where: { id: eventId, empresa: await empresaAtual() },
    data: {
      type: parsed.data.type,
      companyName: parsed.data.companyName,
      value: parsed.data.value,
      createdAt: new Date(parsed.data.date),
    },
  });

  revalidatePath("/comercial");
  redirect("/comercial");
}

export async function deleteCommercialEvent(eventId: string) {
  await requireModuleAccess("comercial");
  await prisma.commercialEvent.deleteMany({ where: { id: eventId, empresa: await empresaAtual() } });
  revalidatePath("/comercial");
}

const SalesGoalSchema = z.object({
  month: z.string().min(1),
  targetSalesQty: z.coerce.number().int().min(0, "Quantidade inválida.").optional(),
  targetSalesValue: z.coerce.number().min(0, "Valor inválido.").optional(),
});

export type SalesGoalFormState = { error?: string } | undefined;

export async function setSalesGoal(_prevState: SalesGoalFormState, formData: FormData): Promise<SalesGoalFormState> {
  await requireModuleAccess("comercial");

  const parsed = SalesGoalSchema.safeParse({
    month: formData.get("month"),
    targetSalesQty: formData.get("targetSalesQty") || undefined,
    targetSalesValue: formData.get("targetSalesValue") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const empresa = await empresaAtual();
  await prisma.monthlyGoal.upsert({
    where: { empresa_month: { empresa, month: parsed.data.month } },
    update: { targetSalesQty: parsed.data.targetSalesQty, targetSalesValue: parsed.data.targetSalesValue },
    create: {
      empresa,
      month: parsed.data.month,
      targetRevenue: 0,
      targetSalesQty: parsed.data.targetSalesQty,
      targetSalesValue: parsed.data.targetSalesValue,
    },
  });
  revalidatePath("/comercial");
}
