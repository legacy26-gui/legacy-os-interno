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

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB

function bool(fd: FormData, name: string) {
  return fd.get(name) === "on" || fd.get(name) === "true";
}

export type ReviewFormState = { error?: string } | undefined;

export async function submitDailyReview(
  clientId: string,
  _prevState: ReviewFormState,
  formData: FormData
): Promise<ReviewFormState> {
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
  revalidatePath("/operacoes");
  return {};
}

// A foto do relatório é obrigatória: sem ela a revisão semanal não é
// salva e conta como pendente para o score da conta.
export async function submitWeeklyReview(
  clientId: string,
  _prevState: ReviewFormState,
  formData: FormData
): Promise<ReviewFormState> {
  const user = await requireModuleAccess("gestao-contas");

  const photo = formData.get("reportPhoto");
  if (!(photo instanceof File) || photo.size === 0) {
    return { error: "Anexe a foto do relatório para concluir a revisão semanal." };
  }
  if (!photo.type.startsWith("image/")) {
    return { error: "O relatório precisa ser uma imagem (foto ou print)." };
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return { error: "Foto muito grande (máx. 5MB). Tire uma foto com menos resolução ou comprima." };
  }

  const buffer = Buffer.from(await photo.arrayBuffer());
  const reportPhotoUrl = `data:${photo.type};base64,${buffer.toString("base64")}`;

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
      reportPhotoUrl,
      notes: (formData.get("notes") as string)?.trim() || null,
    },
  });
  revalidatePath(`/gestao-contas/${clientId}`);
  revalidatePath("/gestao-contas");
  revalidatePath("/operacoes");
  return {};
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
