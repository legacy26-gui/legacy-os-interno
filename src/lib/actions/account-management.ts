"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { weekOfMonthFor, monthKey } from "@/lib/month-weeks";

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

// A foto da campanha é obrigatória: sem ela a revisão diária não é
// salva e não conta como concluída.
export async function submitDailyReview(
  clientId: string,
  _prevState: ReviewFormState,
  formData: FormData
): Promise<ReviewFormState> {
  const user = await requireModuleAccess("gestao-contas");

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { error: "Anexe a foto da campanha para concluir a revisão diária." };
  }
  if (!photo.type.startsWith("image/")) {
    return { error: "A foto precisa ser uma imagem (foto ou print)." };
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return { error: "Foto muito grande (máx. 5MB). Tire uma foto com menos resolução ou comprima." };
  }

  const buffer = Buffer.from(await photo.arrayBuffer());
  const photoUrl = `data:${photo.type};base64,${buffer.toString("base64")}`;

  await prisma.dailyReview.create({
    data: {
      clientId,
      reviewerId: user.id,
      checkedBalance: bool(formData, "checkedBalance"),
      checkedDailyBudget: bool(formData, "checkedDailyBudget"),
      checkedTodaySpend: bool(formData, "checkedTodaySpend"),
      checkedBillingLimit: bool(formData, "checkedBillingLimit"),
      checkedPendingPayments: bool(formData, "checkedPendingPayments"),
      checkedWhatsappResolved: bool(formData, "checkedWhatsappResolved"),
      photoUrl,
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

  // Semana e mês a que a revisão se refere. Vem do formulário pra permitir
  // preencher com atraso sem cair na semana errada; sem isso, usa hoje.
  const now = new Date();
  const weekRaw = Number(formData.get("weekOfMonth"));
  const weekOfMonth = weekRaw >= 1 && weekRaw <= 5 ? weekRaw : weekOfMonthFor(now);
  const refMonthRaw = (formData.get("refMonth") as string) || "";
  const refMonth = /^\d{4}-\d{2}$/.test(refMonthRaw) ? refMonthRaw : monthKey(now);

  await prisma.weeklyReview.create({
    data: {
      clientId,
      reviewerId: user.id,
      weekOfMonth,
      refMonth,
      paymentCleared: bool(formData, "paymentCleared"),
      reportGenerated: bool(formData, "reportGenerated"),
      checkedBestCampaigns: bool(formData, "checkedBestCampaigns"),
      checkedWeeklyCost: bool(formData, "checkedWeeklyCost"),
      definedNewCreatives: bool(formData, "definedNewCreatives"),
      definedNewCampaigns: bool(formData, "definedNewCampaigns"),
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
