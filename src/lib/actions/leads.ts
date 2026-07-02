"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

const LeadSchema = z.object({
  companyName: z.string().min(2, "Informe o nome da empresa."),
  contactName: z.string().min(2, "Informe o nome do contato."),
  city: z.string().optional(),
  phone: z.string().optional(),
  origin: z.enum(["INSTAGRAM", "FACEBOOK", "WHATSAPP", "INDICACAO", "SITE", "TRAFEGO_PAGO"]),
  notes: z.string().optional(),
});

export type LeadFormState = { error?: string } | undefined;

export async function createLead(_prevState: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const user = await requireModuleAccess("comercial");
  const parsed = LeadSchema.safeParse({
    companyName: formData.get("companyName"),
    contactName: formData.get("contactName"),
    city: formData.get("city") || undefined,
    phone: formData.get("phone") || undefined,
    origin: formData.get("origin"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  await prisma.lead.create({ data: { ...parsed.data, ownerId: user.id } });
  revalidatePath("/comercial");
}

export async function updateLeadStage(leadId: string, stage: string) {
  await requireModuleAccess("comercial");
  await prisma.lead.update({ where: { id: leadId }, data: { stage: stage as never } });
  revalidatePath("/comercial");
}

export async function deleteLead(leadId: string) {
  await requireModuleAccess("comercial");
  await prisma.lead.delete({ where: { id: leadId } });
  revalidatePath("/comercial");
}
