"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

const CHANGE_TYPES = [
  "CAMPANHA_CRIADA",
  "CAMPANHA_PAUSADA",
  "CRIATIVO_ALTERADO",
  "CRIATIVO_NOVO",
  "PUBLICO_ALTERADO",
  "ORCAMENTO_ALTERADO",
  "OUTRO",
] as const;

function bool(fd: FormData, name: string) {
  return fd.get(name) === "on" || fd.get(name) === "true";
}

export async function submitDailyReview(clientId: string, formData: FormData) {
  const user = await requireModuleAccess("gestao-contas");
  await prisma.dailyReview.create({
    data: {
      clientId,
      reviewerId: user.id,
      checkedCpl: bool(formData, "checkedCpl"),
      checkedBudget: bool(formData, "checkedBudget"),
      checkedRejected: bool(formData, "checkedRejected"),
      checkedFrequency: bool(formData, "checkedFrequency"),
      checkedComments: bool(formData, "checkedComments"),
      checkedLeads: bool(formData, "checkedLeads"),
      checkedLeadDelivery: bool(formData, "checkedLeadDelivery"),
      checkedService: bool(formData, "checkedService"),
      checkedScheduling: bool(formData, "checkedScheduling"),
      notes: (formData.get("notes") as string)?.trim() || null,
    },
  });
  revalidatePath(`/gestao-contas/${clientId}`);
  revalidatePath("/gestao-contas");
}

export async function submitWeeklyReview(clientId: string, formData: FormData) {
  const user = await requireModuleAccess("gestao-contas");
  await prisma.weeklyReview.create({
    data: {
      clientId,
      reviewerId: user.id,
      createdCreative: bool(formData, "createdCreative"),
      createdAd: bool(formData, "createdAd"),
      testedAudience: bool(formData, "testedAudience"),
      updatedOffers: bool(formData, "updatedOffers"),
      reportSent: bool(formData, "reportSent"),
      clientReplied: bool(formData, "clientReplied"),
      adjustmentsDone: bool(formData, "adjustmentsDone"),
      notes: (formData.get("notes") as string)?.trim() || null,
    },
  });
  revalidatePath(`/gestao-contas/${clientId}`);
  revalidatePath("/gestao-contas");
}

export async function logCampaignChange(clientId: string, formData: FormData) {
  const user = await requireModuleAccess("gestao-contas");
  const type = formData.get("type") as (typeof CHANGE_TYPES)[number];
  if (!CHANGE_TYPES.includes(type)) return;
  await prisma.campaignChange.create({
    data: {
      clientId,
      responsibleId: user.id,
      type,
      description: (formData.get("description") as string)?.trim() || null,
    },
  });
  revalidatePath(`/gestao-contas/${clientId}`);
  revalidatePath("/gestao-contas");
}
