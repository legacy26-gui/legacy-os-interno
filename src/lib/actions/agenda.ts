"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

const AgendaItemSchema = z.object({
  type: z.enum(["AGENDAMENTO", "REUNIAO", "TEMPO"]),
  title: z.string().min(2, "Informe um título."),
  date: z.string().min(1, "Informe a data."),
  startTime: z.string().min(1, "Informe o horário."),
  endTime: z.string().optional(),
  notes: z.string().optional(),
});

export type AgendaFormState = { error?: string } | undefined;

export async function createAgendaItem(_prevState: AgendaFormState, formData: FormData): Promise<AgendaFormState> {
  const user = await requireModuleAccess("calendario");
  const parsed = AgendaItemSchema.safeParse({
    type: formData.get("type"),
    title: formData.get("title"),
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { type, title, date, startTime, endTime, notes } = parsed.data;
  const startAt = new Date(`${date}T${startTime}`);
  const endAt = endTime ? new Date(`${date}T${endTime}`) : null;

  await prisma.agendaItem.create({
    data: { ownerId: user.id, type, title, startAt, endAt, notes: notes?.trim() || null },
  });
  revalidatePath("/calendario");
}

export async function deleteAgendaItem(agendaItemId: string) {
  const user = await requireModuleAccess("calendario");
  const item = await prisma.agendaItem.findUnique({ where: { id: agendaItemId }, select: { ownerId: true } });
  if (!item) return;
  if (item.ownerId !== user.id && user.role !== "ADMIN") return;
  await prisma.agendaItem.delete({ where: { id: agendaItemId } });
  revalidatePath("/calendario");
}
