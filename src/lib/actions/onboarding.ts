"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { ONBOARDING_FIELDS } from "@/lib/onboarding-form";
import { gerarDiagnostico, GeracaoDuplicada } from "@/lib/ai/diagnostico";
import type { OnboardingStatus, AnalysisKind } from "@/generated/prisma/enums";

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

  const ficha = await prisma.clientOnboarding.create({
    data: {
      companyName,
      contactName,
      phone: (answers.phone as string) || null,
      email: (answers.email as string) || null,
      city: (answers.city as string) || null,
      answers,
    },
  });

  // O diagnóstico roda DEPOIS da resposta ir para o cliente: ele já vê a tela
  // de "recebemos" na hora, e uma falha da IA não derruba o envio da ficha —
  // ela vira uma análise com status de erro, que dá pra gerar de novo.
  after(async () => {
    try {
      await gerarDiagnostico({ onboardingId: ficha.id });
      revalidatePath("/formularios");
    } catch (erro) {
      console.error("[onboarding] diagnóstico automático não iniciou:", erro);
    }
  });

  revalidatePath("/formularios");
  return { ok: true };
}

// Gera de novo — usado quando a ficha foi atualizada ou a geração falhou.
// Cria uma versão nova; a anterior continua no banco.
export async function regenerarDiagnostico(onboardingId: string, kind: AnalysisKind = "PRE_DIAGNOSTICO") {
  const user = await requireModuleAccess("formularios");
  try {
    await gerarDiagnostico({ onboardingId, kind, requestedById: user.id });
  } catch (erro) {
    if (!(erro instanceof GeracaoDuplicada)) throw erro;
  }
  revalidatePath("/formularios");
  revalidatePath("/clientes", "layout");
}

// Resumo/transcrição da reunião de onboarding: é o que separa o pré-diagnóstico
// do plano de ação final.
export async function salvarNotasReuniao(onboardingId: string, formData: FormData) {
  await requireModuleAccess("formularios");
  const notas = (formData.get("meetingNotes") as string)?.trim().slice(0, 40_000) || null;
  await prisma.clientOnboarding.update({ where: { id: onboardingId }, data: { meetingNotes: notas } });
  revalidatePath("/formularios");
  revalidatePath("/clientes", "layout");
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
