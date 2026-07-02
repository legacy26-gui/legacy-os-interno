"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

const ReportSchema = z.object({
  clientId: z.string().min(1, "Selecione um cliente."),
  periodLabel: z.string().min(2, "Informe o período (ex: Junho/2026)."),
  investment: z.coerce.number().min(0),
  leads: z.coerce.number().int().min(0),
  reach: z.coerce.number().int().min(0),
  impressions: z.coerce.number().int().min(0),
  recommendations: z.string().optional(),
});

export type ReportFormState = { error?: string } | undefined;

export async function createReport(_prevState: ReportFormState, formData: FormData): Promise<ReportFormState> {
  await requireModuleAccess("relatorios");
  const parsed = ReportSchema.safeParse({
    clientId: formData.get("clientId"),
    periodLabel: formData.get("periodLabel"),
    investment: formData.get("investment"),
    leads: formData.get("leads"),
    reach: formData.get("reach"),
    impressions: formData.get("impressions"),
    recommendations: formData.get("recommendations") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  await prisma.report.create({ data: parsed.data });
  revalidatePath("/relatorios");
}

export async function deleteReport(reportId: string) {
  await requireModuleAccess("relatorios");
  await prisma.report.delete({ where: { id: reportId } });
  revalidatePath("/relatorios");
}
