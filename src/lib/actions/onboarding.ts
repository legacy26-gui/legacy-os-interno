"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { ONBOARDING_FIELDS } from "@/lib/onboarding-form";
import type { OnboardingStatus } from "@/generated/prisma/enums";

export type OnboardingFormState = { error?: string; ok?: boolean } | undefined;

const MAX_LEN = 2000;

function texto(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim().slice(0, MAX_LEN) : "";
}

// AÇÃO PÚBLICA: quem responde é o cliente, sem login. Por isso não tem
// requireModuleAccess aqui — a proteção é só validação e limite de tamanho.
export async function submitOnboarding(
  _prevState: OnboardingFormState,
  formData: FormData
): Promise<OnboardingFormState> {
  // Campo-armadilha: fica escondido na tela, então só robô preenche.
  if (texto(formData, "website")) return { ok: true };

  const answers: Record<string, string | string[]> = {};
  for (const field of ONBOARDING_FIELDS) {
    const valor =
      field.type === "multi"
        ? formData.getAll(field.id).filter((v): v is string => typeof v === "string")
        : texto(formData, field.id);

    if (field.required && (Array.isArray(valor) ? valor.length === 0 : !valor)) {
      return { error: `Preencha: ${field.label}` };
    }
    if (Array.isArray(valor) ? valor.length > 0 : valor) answers[field.id] = valor;
  }

  const companyName = String(answers.companyName ?? "");
  const contactName = String(answers.contactName ?? "");
  if (companyName.length < 2 || contactName.length < 2) {
    return { error: "Informe o nome da loja e o seu nome." };
  }

  await prisma.clientOnboarding.create({
    data: {
      companyName,
      contactName,
      phone: (answers.phone as string) || null,
      email: (answers.email as string) || null,
      city: (answers.city as string) || null,
      answers,
    },
  });

  revalidatePath("/formularios");
  return { ok: true };
}

export async function setOnboardingStatus(id: string, status: OnboardingStatus) {
  await requireModuleAccess("formularios");
  await prisma.clientOnboarding.update({ where: { id }, data: { status } });
  revalidatePath("/formularios");
}

export async function saveOnboardingNotes(id: string, formData: FormData) {
  await requireModuleAccess("formularios");
  const notes = texto(formData, "internalNotes");
  await prisma.clientOnboarding.update({
    where: { id },
    data: { internalNotes: notes || null },
  });
  revalidatePath("/formularios");
}

export async function deleteOnboarding(id: string) {
  await requireModuleAccess("formularios");
  await prisma.clientOnboarding.delete({ where: { id } });
  revalidatePath("/formularios");
}

// Usado quando a ficha vira cliente de verdade: guarda o vínculo e marca a
// ficha como concluída, pra não ficar aparecendo como pendente pra Andriele.
export async function linkOnboardingToClient(onboardingId: string, clientId: string) {
  await requireModuleAccess("formularios");
  await prisma.clientOnboarding.update({
    where: { id: onboardingId },
    data: { clientId, status: "CONCLUIDO" },
  });
  revalidatePath("/formularios");
}
