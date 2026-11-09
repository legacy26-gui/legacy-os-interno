"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { etapaExiste, ETAPA_QUE_CONCLUI } from "@/lib/etapas-implantacao";

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

  // Campanha no ar encerra a implantação: a ficha sai da lista de abertas e
  // vai pra "Concluídos" sozinha. Sem isso alguém teria que lembrar de mudar
  // o status na mão, e ficha pronta ficaria entulhando a tela de quem ainda
  // tem trabalho a fazer.
  if (chave === ETAPA_QUE_CONCLUI) {
    await prisma.clientOnboarding.update({
      where: { id: onboardingId },
      data: { status: "CONCLUIDO" },
    });
  }

  revalidatePath("/formularios");
}

/** Desmarca, pra desfazer o clique errado. */
export async function desmarcarEtapa(onboardingId: string, chave: string) {
  await requireModuleAccess("formularios");
  await prisma.onboardingEtapa.deleteMany({ where: { onboardingId, chave } });

  // Desmarcar a campanha traz a ficha de volta pras abertas — senão o
  // desfazer ficaria pela metade: a etapa voltava e a ficha continuava
  // escondida em "Concluídos".
  if (chave === ETAPA_QUE_CONCLUI) {
    await prisma.clientOnboarding.updateMany({
      where: { id: onboardingId, status: "CONCLUIDO" },
      data: { status: "EM_ANDAMENTO" },
    });
  }

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
