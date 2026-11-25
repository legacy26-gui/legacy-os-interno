"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { canAccessModule } from "@/lib/permissions";
import { escopoDaCarteira } from "@/lib/carteira";
import { carrosParaArte, escolherCarroPeloArquivo, prepararArte } from "@/lib/estoque/artes";

// O banco de artes de uma loja: subir, trocar o carro, apagar. Só quem tem a loja na carteira.

// Usado na tela do Estoque (gestao-contas) e na Campanha do zero (clientes): vale quem entra em qualquer uma das duas.
async function lojaDaPessoa(clientId: string) {
  const user = await getCurrentUser();
  if (!canAccessModule(user.role, "gestao-contas", user.email) && !canAccessModule(user.role, "clientes", user.email)) return null;
  if (typeof clientId !== "string" || !clientId) return null;
  return prisma.client.findFirst({ where: { id: clientId, ...escopoDaCarteira(user) }, select: { id: true } });
}

const caminho = (clientId: string) => `/inteligencia-comercial/estoque/${clientId}/artes`;

/**
 * Sobe UMA arte (a tela manda uma por vez). Adivinha o carro pelo nome do arquivo; se o carro já tinha arte, a antiga fica
 * no banco sem carro (dá pra reatribuir ou apagar).
 */
export async function subirArte(form: FormData): Promise<{ ok: true; id: string; carroId: string | null; carro: string | null } | { ok: false; erro: string }> {
  const clientId = String(form.get("clientId") ?? "");
  const arquivo = form.get("arquivo");
  if (!(await lojaDaPessoa(clientId))) return { ok: false, erro: "Loja fora da sua carteira." };
  if (!(arquivo instanceof File)) return { ok: false, erro: "Faltou o arquivo." };
  const pronta = await prepararArte(Buffer.from(await arquivo.arrayBuffer()));
  if (!pronta.ok) return { ok: false, erro: `${arquivo.name}: ${pronta.erro}` };
  const carros = await carrosParaArte(clientId);
  const escolhido = String(form.get("carroId") ?? "") || escolherCarroPeloArquivo(arquivo.name, carros);
  const carroId = escolhido && carros.some((c) => c.id === escolhido) ? escolhido : null;
  const arte = await prisma.$transaction(async (tx) => {
    if (carroId) await tx.arteDoCarro.updateMany({ where: { carroId }, data: { carroId: null } });
    return tx.arteDoCarro.create({
      data: { clientId, carroId, nome: arquivo.name.slice(0, 200), mime: "image/jpeg", largura: pronta.largura, altura: pronta.altura, bytes: new Uint8Array(pronta.bytes) },
      select: { id: true },
    });
  });
  revalidatePath(caminho(clientId));
  return { ok: true, id: arte.id, carroId, carro: carros.find((c) => c.id === carroId)?.titulo ?? null };
}

/** Liga a arte a um carro (ou tira do carro, com carroId vazio). O carro que já tinha outra arte fica com esta. */
export async function atribuirArte(clientId: string, arteId: string, carroId: string): Promise<{ ok?: string; erro?: string }> {
  if (!(await lojaDaPessoa(clientId))) return { erro: "Loja fora da sua carteira." };
  const arte = await prisma.arteDoCarro.findFirst({ where: { id: arteId, clientId }, select: { id: true } });
  if (!arte) return { erro: "Arte não encontrada." };
  if (carroId) {
    const carro = await prisma.estoqueCarro.findFirst({ where: { id: carroId, clientId }, select: { id: true } });
    if (!carro) return { erro: "Esse carro não é desta loja." };
  }
  await prisma.$transaction(async (tx) => {
    if (carroId) await tx.arteDoCarro.updateMany({ where: { carroId, NOT: { id: arteId } }, data: { carroId: null } });
    await tx.arteDoCarro.update({ where: { id: arteId }, data: { carroId: carroId || null } });
  });
  revalidatePath(caminho(clientId));
  return { ok: carroId ? "Arte ligada ao carro." : "Arte sem carro." };
}

export async function apagarArte(clientId: string, arteId: string): Promise<{ ok?: string; erro?: string }> {
  if (!(await lojaDaPessoa(clientId))) return { erro: "Loja fora da sua carteira." };
  const r = await prisma.arteDoCarro.deleteMany({ where: { id: arteId, clientId } });
  revalidatePath(caminho(clientId));
  return r.count ? { ok: "Arte apagada." } : { erro: "Arte não encontrada." };
}
