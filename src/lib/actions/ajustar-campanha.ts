"use server";

import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira } from "@/lib/carteira";
import {
  campanhasDaConta,
  criarConjuntoCopiando,
  excluirAnuncio,
  lerCampanhaParaAjustar,
  moverAnuncio,
  mudarOrcamentoDoConjunto,
  renomear,
  type CampanhaParaAjustar,
} from "@/lib/meta/ajustar-campanha";

// Ajustar campanha depois de criada (ver src/lib/meta/ajustar-campanha.ts). Módulo de clientes + loja da carteira; os ids que
// vêm do navegador são conferidos de novo na lib (conta da loja, objeto da campanha, só pausado).

async function pode(clientId: string) {
  const user = await requireModuleAccess("clientes");
  if (typeof clientId !== "string" || !clientId) return null;
  return (await clienteEDaCarteira(user, clientId)) ? user : null;
}

async function seguro<T>(fazer: () => Promise<T>, falha: T): Promise<T> {
  try {
    return await fazer();
  } catch (erro) {
    const digest = (erro as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw erro;
    console.error("[ajustar-campanha]", erro);
    return falha;
  }
}

const FORA = { ok: false as const, erro: "Esta loja não está na sua carteira." };
const QUEBROU = { ok: false as const, erro: "Deu erro no servidor. Tenta de novo." };
const txt = (v: unknown) => String(v ?? "");

export async function listarCampanhas(clientId: string, contaMeta: string) {
  return seguro(async () => ((await pode(clientId)) ? campanhasDaConta(clientId, txt(contaMeta)) : FORA), QUEBROU);
}

export async function abrirCampanha(clientId: string, contaMeta: string, campanhaId: string): Promise<CampanhaParaAjustar> {
  return seguro(async () => ((await pode(clientId)) ? lerCampanhaParaAjustar(clientId, txt(contaMeta), txt(campanhaId)) : FORA), QUEBROU);
}

export type Ajuste =
  | { tipo: "mover"; anuncioId: string; paraConjuntoId: string }
  | { tipo: "renomear"; nivel: "anuncio" | "conjunto"; id: string; nome: string }
  | { tipo: "orcamento"; conjuntoId: string; centavosPorDia: number }
  | { tipo: "novo-conjunto"; modeloId: string; nome: string; centavosPorDia: number | null }
  | { tipo: "excluir"; anuncioId: string };

export async function ajustar(clientId: string, contaMeta: string, campanhaId: string, a: Ajuste): Promise<{ ok: true; msg: string } | { ok: false; erro: string }> {
  return seguro(async () => {
    const user = await pode(clientId);
    if (!user) return FORA;
    const base = { clientId, quemId: user.id, contaMeta: txt(contaMeta), campanhaId: txt(campanhaId) };
    switch (a?.tipo) {
      case "mover":
        return moverAnuncio({ ...base, anuncioId: txt(a.anuncioId), paraConjuntoId: txt(a.paraConjuntoId) });
      case "renomear":
        return renomear({ ...base, nivel: a.nivel === "conjunto" ? "conjunto" : "anuncio", id: txt(a.id), nome: txt(a.nome) });
      case "orcamento":
        return mudarOrcamentoDoConjunto({ ...base, conjuntoId: txt(a.conjuntoId), centavosPorDia: Number(a.centavosPorDia) });
      case "novo-conjunto":
        return criarConjuntoCopiando({ ...base, modeloId: txt(a.modeloId), nome: txt(a.nome), centavosPorDia: a.centavosPorDia ? Number(a.centavosPorDia) : null });
      case "excluir":
        return excluirAnuncio({ ...base, anuncioId: txt(a.anuncioId) });
      default:
        return { ok: false as const, erro: "Ajuste desconhecido." };
    }
  }, QUEBROU);
}
