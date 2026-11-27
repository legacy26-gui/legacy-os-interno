"use server";

import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira } from "@/lib/carteira";
import { prisma } from "@/lib/prisma";
import { comecarVideo, mandarPedaco, PEDACO, terminarVideo } from "@/lib/meta/video";
import { subirFoto } from "@/lib/meta/campanha-do-zero";

// Subir vídeo (e a capa) pra conta de anúncio da loja, pela tela. Ver src/lib/meta/video.ts. O navegador manda um pedaço por
// vez; cada chamada confere de novo: módulo de clientes, loja da carteira, conta da loja.

async function contaDaPessoa(clientId: string, contaMeta: string): Promise<string | null> {
  const user = await requireModuleAccess("clientes");
  if (typeof clientId !== "string" || !clientId || typeof contaMeta !== "string") return null;
  if (!(await clienteEDaCarteira(user, clientId))) return null;
  const conta = await prisma.metaAdAccount.findFirst({ where: { clientId, metaAccountId: contaMeta, active: true }, select: { metaAccountId: true } });
  return conta?.metaAccountId ?? null;
}

const FORA = { ok: false as const, erro: "Essa conta não é de uma loja da sua carteira." };

async function seguro<T>(f: () => Promise<T>, falha: T): Promise<T> {
  try {
    return await f();
  } catch (e) {
    const digest = (e as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
    console.error("[video]", e);
    return falha;
  }
}
const QUEBROU = { ok: false as const, erro: "Deu erro no servidor no envio do vídeo. Tenta de novo." };

export async function comecarVideoDaLoja(clientId: string, contaMeta: string, tamanho: number) {
  return seguro(async () => {
    const conta = await contaDaPessoa(clientId, contaMeta);
    if (!conta) return FORA;
    const r = await comecarVideo(conta, Number(tamanho));
    return r.ok ? { ...r, pedaco: PEDACO } : r;
  }, QUEBROU);
}

export async function pedacoDoVideo(form: FormData) {
  return seguro(async () => {
    const conta = await contaDaPessoa(String(form.get("clientId") ?? ""), String(form.get("contaMeta") ?? ""));
    if (!conta) return FORA;
    const arquivo = form.get("pedaco");
    if (!(arquivo instanceof Blob)) return { ok: false as const, erro: "Faltou o pedaço do vídeo." };
    return mandarPedaco(conta, String(form.get("sessao") ?? ""), Number(form.get("offset")), new Uint8Array(await arquivo.arrayBuffer()));
  }, QUEBROU);
}

export async function terminarVideoDaLoja(clientId: string, contaMeta: string, sessao: string, titulo: string) {
  return seguro(async () => {
    const conta = await contaDaPessoa(clientId, contaMeta);
    if (!conta) return FORA;
    return terminarVideo(conta, String(sessao), String(titulo ?? "Vídeo"));
  }, QUEBROU);
}

/** A capa do vídeo (o quadro que o navegador tirou), como foto da conta. Devolve o hash. */
export async function capaDoVideo(form: FormData): Promise<{ ok: true; hash: string } | { ok: false; erro: string }> {
  return seguro(async () => {
    const conta = await contaDaPessoa(String(form.get("clientId") ?? ""), String(form.get("contaMeta") ?? ""));
    if (!conta) return FORA;
    const arquivo = form.get("capa");
    if (!(arquivo instanceof Blob) || arquivo.size > 5_000_000) return { ok: false as const, erro: "Capa inválida." };
    const hash = await subirFoto(conta, Buffer.from(await arquivo.arrayBuffer()), `capa ${String(form.get("nome") ?? "")}`.slice(0, 100));
    return hash ? { ok: true as const, hash } : { ok: false as const, erro: "A Meta não aceitou a capa do vídeo." };
  }, QUEBROU);
}
