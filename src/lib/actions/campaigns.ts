"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

const CampaignSchema = z.object({
  clientId: z.string().min(1, "Selecione um cliente."),
  periodStart: z.string().min(1, "Informe o início do período."),
  periodEnd: z.string().min(1, "Informe o fim do período."),
  investment: z.coerce.number().min(0),
  leads: z.coerce.number().int().min(0),
  reach: z.coerce.number().int().min(0),
  impressions: z.coerce.number().int().min(0),
});

export type CampaignFormState = { error?: string } | undefined;

export async function createCampaign(_prevState: CampaignFormState, formData: FormData): Promise<CampaignFormState> {
  await requireModuleAccess("trafego");
  const parsed = CampaignSchema.safeParse({
    clientId: formData.get("clientId"),
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
    investment: formData.get("investment"),
    leads: formData.get("leads"),
    reach: formData.get("reach"),
    impressions: formData.get("impressions"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { periodStart, periodEnd, ...rest } = parsed.data;
  await prisma.campaign.create({
    data: { ...rest, periodStart: new Date(periodStart), periodEnd: new Date(periodEnd) },
  });
  revalidatePath("/trafego");
}

export async function deleteCampaign(campaignId: string) {
  await requireModuleAccess("trafego");
  await prisma.campaign.delete({ where: { id: campaignId } });
  revalidatePath("/trafego");
}
