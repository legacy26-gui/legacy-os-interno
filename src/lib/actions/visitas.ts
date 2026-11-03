"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

// Última visita na loja.
//
// Um botão só: apertou, marca hoje. É isso que se usa no dia a dia — sair da
// loja e registrar na hora, sem escolher data em lugar nenhum.
//
// A data também pode ser escrita na mão, porque nem sempre dá pra marcar na
// hora e lembrar depois "fui terça" é comum.

function revalidar(clientId: string) {
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clientId}`);
}

/** Apertou o botão: a visita foi hoje. */
export async function marcarVisitaHoje(clientId: string) {
  await requireModuleAccess("clientes");

  // Meio-dia, e não a hora do clique: a data é o que importa, e o meio-dia
  // nunca cai no dia errado quando a tela mostra em outro fuso.
  const agora = new Date();
  const hojeMeioDia = new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), 12, 0, 0)
  );

  await prisma.client.update({
    where: { id: clientId },
    data: { ultimaVisitaEm: hojeMeioDia },
  });
  revalidar(clientId);
}

/** Visita que aconteceu outro dia, escrita na mão. Data vazia limpa o registro. */
export async function definirDataDaVisita(clientId: string, data: string) {
  await requireModuleAccess("clientes");

  if (!data) {
    await prisma.client.update({ where: { id: clientId }, data: { ultimaVisitaEm: null } });
    revalidar(clientId);
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return;

  const [ano, mes, dia] = data.split("-").map(Number);
  const quando = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));

  // Visita no futuro é engano de digitação — não grava.
  if (quando.getTime() > Date.now() + 24 * 60 * 60 * 1000) return;

  await prisma.client.update({ where: { id: clientId }, data: { ultimaVisitaEm: quando } });
  revalidar(clientId);
}
