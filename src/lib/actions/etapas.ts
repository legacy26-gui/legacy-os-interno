"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { etapaExiste } from "@/lib/etapas-implantacao";

// As etapas de implantação de um cliente novo, marcadas na ficha.
//
// Quem marca é quem cuida das fichas — hoje a Andrielli. O acesso é o mesmo
// do módulo de Formulários, então ela faz sozinha.

/** Marca a etapa como feita, guardando quem marcou e quando. */
export async function marcarEtapa(onboardingId: string, chave: string) {
  const user = await requireModuleAccess("formularios");
  // Chave que não está na lista de hoje não entra: o valor vem do navegador.
  if (!etapaExiste(chave)) return;

  await prisma.onboardingEtapa.upsert({
    where: { onboardingId_chave: { onboardingId, chave } },
    // Já marcada: não mexe. Reclicar não troca o autor nem a data de quem
    // fez de verdade.
    update: {},
    create: { onboardingId, chave, concluidoPorId: user.id },
  });
  revalidatePath("/formularios");
}

/** Desmarca, pra desfazer o clique errado. */
export async function desmarcarEtapa(onboardingId: string, chave: string) {
  await requireModuleAccess("formularios");
  await prisma.onboardingEtapa.deleteMany({ where: { onboardingId, chave } });
  revalidatePath("/formularios");
}

/**
 * Observação de uma etapa: "cliente pediu pra mandar o contrato na segunda",
 * "acesso veio incompleto". Só pode existir em etapa já marcada, senão a
 * observação ficaria pendurada em coisa que não aconteceu.
 */
export async function salvarObservacaoDaEtapa(
  onboardingId: string,
  chave: string,
  formData: FormData
) {
  await requireModuleAccess("formularios");
  if (!etapaExiste(chave)) return;

  const texto = ((formData.get("observacao") as string) ?? "").trim();
  await prisma.onboardingEtapa.updateMany({
    where: { onboardingId, chave },
    data: { observacao: texto || null },
  });
  revalidatePath("/formularios");
}
