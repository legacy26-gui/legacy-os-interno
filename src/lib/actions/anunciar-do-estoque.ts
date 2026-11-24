"use server";

import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/dal";
import { anunciarCarroDoEstoque, type ResultadoDoAnunciarAgora } from "@/lib/estoque/anunciar-agora";

// O botão "Anunciar agora" das sugestões: do carro do estoque ao rascunho PAUSADO na Meta. A regra e as travas moram
// em src/lib/estoque/anunciar-agora.ts (a mesma do WhatsApp). Aqui só se confere quem pede e se devolve uma frase.

export async function anunciarAgora(carroId: string): Promise<ResultadoDoAnunciarAgora> {
  const user = await requireModuleAccess("clientes");
  try {
    const r = await anunciarCarroDoEstoque({ carroId: String(carroId ?? ""), pessoa: { id: user.id, role: user.role, name: user.name }, origem: "tela" });
    if (r.ok) revalidatePath("/inteligencia-comercial/sugestoes");
    return r;
  } catch (erro) {
    const digest = (erro as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw erro;
    console.error("[anunciar-agora] a ação falhou", erro);
    return { ok: false, erro: "Deu erro no servidor. Tenta de novo, ou sobe pela tela de Subir anúncio." };
  }
}
