"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

const TicketSchema = z.object({
  clientId: z.string().min(1, "Selecione o cliente."),
  subject: z.string().min(2, "Informe o assunto."),
  description: z.string().optional(),
  assigneeId: z.string().optional(),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]),
});

export type TicketFormState = { error?: string } | undefined;

export async function createTicket(_prevState: TicketFormState, formData: FormData): Promise<TicketFormState> {
  await requireModuleAccess("suporte");
  const parsed = TicketSchema.safeParse({
    clientId: formData.get("clientId"),
    subject: formData.get("subject"),
    description: formData.get("description") || undefined,
    assigneeId: formData.get("assigneeId") || undefined,
    priority: formData.get("priority"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  await prisma.supportTicket.create({ data: parsed.data });
  revalidatePath("/suporte");
}

export async function updateTicketStatus(ticketId: string, status: string) {
  await requireModuleAccess("suporte");
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { status: status as never } });
  revalidatePath("/suporte");
}

export async function deleteTicket(ticketId: string) {
  await requireModuleAccess("suporte");
  await prisma.supportTicket.delete({ where: { id: ticketId } });
  revalidatePath("/suporte");
}
