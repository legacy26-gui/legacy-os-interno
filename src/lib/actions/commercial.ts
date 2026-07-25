"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

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

  await prisma.commercialEvent.update({
    where: { id: eventId },
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
  await prisma.commercialEvent.delete({ where: { id: eventId } });
  revalidatePath("/comercial");
}
