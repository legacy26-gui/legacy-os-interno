"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

const MetricSchema = z.object({
  storeName: z.string().min(2, "Informe a loja."),
  periodMonth: z.string().min(1, "Informe o mês (YYYY-MM)."),
  conversations: z.coerce.number().int().min(0),
  leadsCaptured: z.coerce.number().int().min(0),
  avgLeadScore: z.coerce.number().min(0).max(100),
  visitsGenerated: z.coerce.number().int().min(0),
  testDrivesGenerated: z.coerce.number().int().min(0),
  conversions: z.coerce.number().int().min(0),
  topSalesperson: z.string().optional(),
});

export type MetricFormState = { error?: string } | undefined;

export async function upsertAquilaMetric(_prevState: MetricFormState, formData: FormData): Promise<MetricFormState> {
  await requireModuleAccess("aquila");
  const parsed = MetricSchema.safeParse({
    storeName: formData.get("storeName"),
    periodMonth: formData.get("periodMonth"),
    conversations: formData.get("conversations"),
    leadsCaptured: formData.get("leadsCaptured"),
    avgLeadScore: formData.get("avgLeadScore"),
    visitsGenerated: formData.get("visitsGenerated"),
    testDrivesGenerated: formData.get("testDrivesGenerated"),
    conversions: formData.get("conversions"),
    topSalesperson: formData.get("topSalesperson") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { storeName, periodMonth, ...rest } = parsed.data;
  await prisma.aquilaMetric.upsert({
    where: { storeName_periodMonth: { storeName, periodMonth } },
    update: rest,
    create: { storeName, periodMonth, ...rest },
  });
  revalidatePath("/aquila");
}

export async function deleteAquilaMetric(metricId: string) {
  await requireModuleAccess("aquila");
  await prisma.aquilaMetric.delete({ where: { id: metricId } });
  revalidatePath("/aquila");
}
