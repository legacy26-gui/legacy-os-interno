"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira } from "@/lib/carteira";
import { diaDaCasaComoData, ehDiaDaFoto } from "@/lib/dia-da-casa";

// A caixinha do dia, no Meu Dia.
//
// Uma marcação por cliente por dia: "passei por aqui hoje". É a lista de
// chamada da carteira — sem ela, cliente quieto some de vista e só reaparece
// quando o dono pergunta por que parou de vender.
//
// Na segunda-feira a caixinha pede a foto da campanha, e não fecha sem ela.
// Nos outros dias é um clique.

/** 5MB: foto de celular passa disso só se ninguém comprimir. */
const FOTO_MAX = 5 * 1024 * 1024;

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
 * Marca o cliente como conferido hoje.
 *
 * Em dia comum, um clique. Na segunda-feira vem com a foto — e sem ela a
 * conferência simplesmente não é gravada, em vez de ser gravada "pela
 * metade". Marcação pela metade é pior que marcação nenhuma: a barra diz que
 * está completo e a foto não existe.
 */
export async function conferirCliente(
  clientId: string,
  _anterior: ConferirState,
  formData: FormData
): Promise<ConferirState> {
  const user = await podeMexer(clientId);
  if (!user) return { erro: "Este cliente não está na sua carteira." };

  const dia = diaDaCasaComoData();
  let fotoUrl: string | null = null;

  if (ehDiaDaFoto()) {
    const foto = formData.get("foto");
    if (!(foto instanceof File) || foto.size === 0) {
      return { erro: "Segunda-feira é o dia da foto: anexe a foto da campanha." };
    }
    if (!foto.type.startsWith("image/")) {
      return { erro: "A foto precisa ser uma imagem (foto ou print)." };
    }
    if (foto.size > FOTO_MAX) {
      return { erro: "Foto muito grande (máx. 5MB). Tire com menos resolução ou comprima." };
    }
    const bytes = Buffer.from(await foto.arrayBuffer());
    fotoUrl = `data:${foto.type};base64,${bytes.toString("base64")}`;
  }

  await prisma.clienteConferido.upsert({
    where: { clientId_dia: { clientId, dia } },
    // Já conferido: só deixa a foto entrar se ainda não tinha. Reclicar não
    // troca o nome de quem olhou primeiro nem a hora.
    update: fotoUrl ? { fotoUrl } : {},
    create: { clientId, dia, quemId: user.id, fotoUrl },
  });
  revalidar();
  return { ok: true };
}

/** Desmarcar, pro clique errado. Só o dia de hoje — ontem não se reescreve. */
export async function desconferirCliente(clientId: string) {
  const user = await podeMexer(clientId);
  if (!user) return;

  await prisma.clienteConferido.deleteMany({ where: { clientId, dia: diaDaCasaComoData() } });
  revalidar();
}
