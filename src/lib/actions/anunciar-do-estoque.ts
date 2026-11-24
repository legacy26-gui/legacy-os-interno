"use server";

import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/dal";
import { anunciarCarroDoEstoque, prepararAnuncio, type ResultadoDoAnunciarAgora } from "@/lib/estoque/anunciar-agora";
import type { EscolhaDoAnuncio, PlanoDoAnuncio } from "@/lib/estoque/anunciar-tipos";

// "Anunciar agora" da ficha da loja (Estoque) e das Sugestões. A regra e as travas moram em src/lib/estoque/anunciar-agora.ts
// (a mesma do WhatsApp). Aqui só se confere quem pede e se devolve uma frase — nunca erro técnico, nunca token.

async function semQuebrar<T extends { ok: boolean; erro?: string }>(fazer: () => Promise<T>, aoFalhar: T): Promise<T> {
  try {
    return await fazer();
  } catch (erro) {
    const digest = (erro as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw erro;
    console.error("[anunciar-agora] a ação falhou", erro);
    return { ...aoFalhar, ok: false, erro: "Deu erro no servidor. Tenta de novo, ou sobe pela tela de Subir anúncio." };
  }
}

/** Abre o "Anunciar agora": as fotos do carro, as campanhas e conjuntos da loja, o "mesmo de sempre" e a legenda da IA. */
export async function prepararAnunciarAgora(carroId: string): Promise<PlanoDoAnuncio> {
  const user = await requireModuleAccess("clientes");
  return semQuebrar<PlanoDoAnuncio>(() => prepararAnuncio({ carroId: String(carroId ?? ""), pessoa: { id: user.id, role: user.role } }), { ok: false });
}

/** Cria o rascunho PAUSADO com o que a pessoa escolheu (campanha e conjunto existentes ou novos, fotos, legenda). */
export async function anunciarAgora(carroId: string, escolha: EscolhaDoAnuncio | null = null): Promise<ResultadoDoAnunciarAgora> {
  const user = await requireModuleAccess("clientes");
  return semQuebrar<ResultadoDoAnunciarAgora>(async () => {
    const r = await anunciarCarroDoEstoque({ carroId: String(carroId ?? ""), pessoa: { id: user.id, role: user.role, name: user.name }, origem: "tela", escolha });
    if (r.ok) {
      revalidatePath("/inteligencia-comercial/sugestoes");
      revalidatePath("/clientes");
    }
    return r;
  }, { ok: false });
}

/** O estoque da loja (com a situação de anúncio de cada carro), pro balão de Estoque do Meta Ads. */
export async function lerEstoqueDaLoja(clientId: string): Promise<{ ok: boolean; erro?: string; estoque?: import("@/lib/estoque/da-loja").EstoqueDaFicha; loja?: string }> {
  const user = await requireModuleAccess("clientes");
  const { clienteEDaCarteira } = await import("@/lib/carteira");
  const { estoqueDaFicha } = await import("@/lib/estoque/da-loja");
  const { prisma } = await import("@/lib/prisma");
  try {
    if (typeof clientId !== "string" || !clientId || !(await clienteEDaCarteira({ id: user.id, role: user.role }, clientId))) return { ok: false, erro: "Esta loja não está na sua carteira." };
    const loja = await prisma.client.findUnique({ where: { id: clientId }, select: { companyName: true } });
    return { ok: true, estoque: await estoqueDaFicha(clientId), loja: loja?.companyName };
  } catch (erro) {
    const digest = (erro as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw erro;
    console.error("[estoque] leitura da ficha falhou", erro);
    return { ok: false, erro: "Deu erro no servidor. Tenta de novo." };
  }
}
