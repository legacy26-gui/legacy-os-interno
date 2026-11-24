"use server";

import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira } from "@/lib/carteira";
import { buscarLocais, lerPublicoDoConjunto, salvarPublicoDoConjunto, type LeituraDoPublico } from "@/lib/meta/publico-do-conjunto";
import type { EdicaoDoPublico, LocalDoPublico } from "@/lib/meta/publico-puro";

// O editor de público do conjunto (idade, gênero, localização). Toda ação confere antes: quem pede pode mexer em clientes e a
// loja é da carteira dele. O id da loja e do conjunto vêm do navegador e nunca são confiados.

async function pode(clientId: string) {
  const user = await requireModuleAccess("clientes");
  if (typeof clientId !== "string" || !clientId) return null;
  return (await clienteEDaCarteira(user, clientId)) ? user : null;
}

async function semQuebrar<T extends { ok: boolean }>(fazer: () => Promise<T>, falha: T): Promise<T> {
  try {
    return await fazer();
  } catch (erro) {
    const digest = (erro as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw erro;
    console.error("[publico] a ação falhou", erro);
    return falha;
  }
}

export async function abrirPublicoDoConjunto(clientId: string, adsetId: string): Promise<LeituraDoPublico> {
  return semQuebrar<LeituraDoPublico>(async () => {
    if (!(await pode(clientId))) return { ok: false, erro: "Esta loja não está na sua carteira." };
    return lerPublicoDoConjunto(clientId, String(adsetId ?? ""));
  }, { ok: false, erro: "Deu erro no servidor. Tenta de novo." });
}

export async function procurarLocais(clientId: string, termo: string): Promise<{ ok: boolean; erro?: string; locais?: LocalDoPublico[] }> {
  return semQuebrar<{ ok: boolean; erro?: string; locais?: LocalDoPublico[] }>(async () => {
    if (!(await pode(clientId))) return { ok: false, erro: "Esta loja não está na sua carteira." };
    return buscarLocais(String(termo ?? ""));
  }, { ok: false, erro: "Deu erro no servidor. Tenta de novo." });
}

export async function salvarPublico(clientId: string, adsetId: string, edicao: EdicaoDoPublico): Promise<{ ok: boolean; erro?: string; resumo?: string; avisos?: string[] }> {
  return semQuebrar<{ ok: boolean; erro?: string; resumo?: string; avisos?: string[] }>(async () => {
    const user = await pode(clientId);
    if (!user) return { ok: false, erro: "Esta loja não está na sua carteira." };
    const r = await salvarPublicoDoConjunto({ clientId, quemId: user.id, adsetId: String(adsetId ?? ""), edicao });
    if (r.ok) revalidatePath(`/meta-ads/${clientId}`);
    return r;
  }, { ok: false, erro: "Deu erro no servidor. Tenta de novo." });
}
