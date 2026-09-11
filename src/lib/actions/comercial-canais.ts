"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CANAIS } from "@/lib/comercial-metrics";
import type { LeadChannel } from "@/generated/prisma/enums";

// Impressão e verba do mês, canal por canal. É o que vira CPL, custo por
// reunião e CAC lá no dashboard.

const LinhaSchema = z.object({
  impressions: z.coerce.number().int().min(0),
  investment: z.coerce.number().min(0),
});

export type VerbaFormState = { error?: string; ok?: boolean } | undefined;

export async function salvarVerbaDoMes(
  month: string,
  _prevState: VerbaFormState,
  formData: FormData
): Promise<VerbaFormState> {
  await requireModuleAccess("comercial");
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Mês inválido." };

  const linhas: { canal: LeadChannel; impressions: number; investment: number }[] = [];
  for (const canal of CANAIS) {
    const parsed = LinhaSchema.safeParse({
      impressions: formData.get(`impressions_${canal}`) || 0,
      investment: formData.get(`investment_${canal}`) || 0,
    });
    if (!parsed.success) return { error: "Confira os números: use só valores positivos." };
    linhas.push({ canal, ...parsed.data });
  }

  await prisma.$transaction(
    linhas.map((l) =>
      prisma.channelMonth.upsert({
        where: { month_channel: { month, channel: l.canal } },
        create: { month, channel: l.canal, impressions: l.impressions, investment: l.investment },
        update: { impressions: l.impressions, investment: l.investment },
      })
    )
  );

  revalidatePath("/comercial/dashboard");
  return { ok: true };
}
