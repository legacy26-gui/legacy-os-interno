import "server-only";

import { prisma } from "@/lib/prisma";
import { etapaExiste, ETAPA_QUE_CONCLUI } from "@/lib/etapas-implantacao";

// Grava uma etapa de implantação como feita. Existe separado da ação da tela porque quem marca pode ser a ficha
// (marcarEtapa, com a pessoa logada) ou o WhatsApp (comandos-do-dia.ts) — a regra tem que ser UMA só.

/** Marca a etapa guardando quem marcou. Já marcada: não mexe (quem fez primeiro continua sendo quem fez). */
export async function gravarEtapa(onboardingId: string, chave: string, userId: string): Promise<boolean> {
  // Chave que não está na lista de hoje não entra.
  if (!etapaExiste(chave)) return false;

  await prisma.onboardingEtapa.upsert({
    where: { onboardingId_chave: { onboardingId, chave } },
    update: {},
    create: { onboardingId, chave, concluidoPorId: userId },
  });

  // Campanha no ar encerra a implantação: a ficha sai da lista de abertas e vai pra "Concluídos" sozinha.
  if (chave === ETAPA_QUE_CONCLUI) {
    await prisma.clientOnboarding.update({ where: { id: onboardingId }, data: { status: "CONCLUIDO" } });
  }
  return true;
}
