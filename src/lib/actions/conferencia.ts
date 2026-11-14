"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira } from "@/lib/carteira";
import { diaDaCasaComoData } from "@/lib/dia-da-casa";

// A caixinha do dia, no Meu Dia.
//
// Uma marcação por cliente por dia: "passei por aqui hoje". É a lista de
// chamada da carteira — sem ela, cliente quieto some de vista e só reaparece
// quando o dono pergunta por que parou de vender.
//
// Nos outros dias é um clique.

export type ConferirState = { erro?: string; ok?: boolean } | undefined;

function revalidar() {
  revalidatePath("/meu-dia");
  revalidatePath("/controle-vendas");
}

async function podeMexer(clientId: string) {
  const user = await requireModuleAccess("clientes");
  // O id vem do navegador: só se confere cliente da própria carteira.
  return (await clienteEDaCarteira(user, clientId)) ? user : null;
}

/**
 * Marca o cliente como conferido hoje. Um clique, todo dia.
 *
 * ── A foto da campanha saiu ──────────────────────────────────────────────
 *
 * Na segunda-feira isto exigia a foto da campanha e não gravava sem ela. A
 * razão original era boa: prova de que a campanha estava no ar. Mas agora o
 * sistema MOSTRA a campanha — veiculação, gasto, resultado, a arte, o texto
 * — e uma foto de tela provando o que a tela ao lado já mostra é trabalho
 * que não prova mais nada.
 *
 * A coluna `fotoUrl` continua na tabela: as fotos que já foram tiradas são
 * registro e não se apagam por mudança de regra.
 */
export async function conferirCliente(
  clientId: string,
  _anterior: ConferirState,
  _formData: FormData,
): Promise<ConferirState> {
  const user = await podeMexer(clientId);
  if (!user) return { erro: "Este cliente não está na sua carteira." };

  await prisma.clienteConferido.upsert({
    where: { clientId_dia: { clientId, dia: diaDaCasaComoData() } },
    // Reclicar não troca o nome de quem olhou primeiro nem a hora.
    update: {},
    create: { clientId, dia: diaDaCasaComoData(), quemId: user.id },
  });
  revalidar();
  return { ok: true };
}

/** Desmarcar, pro clique errado. Só o dia de hoje — ontem não se reescreve. */
export async function desconferirCliente(clientId: string) {
  const user = await podeMexer(clientId);
  if (!user) return;

  await prisma.clienteConferido.deleteMany({
    where: { clientId, dia: diaDaCasaComoData() },
  });
  revalidar();
}
