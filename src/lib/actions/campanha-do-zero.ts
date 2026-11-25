"use server";

import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira } from "@/lib/carteira";
import { prisma } from "@/lib/prisma";
import {
  criarAnuncioDoCarro,
  criarEstrutura,
  paginasDaConta,
  type Estrutura,
  type Orcamento,
  type ResultadoDaEstrutura,
  type ResultadoDoCarro,
} from "@/lib/meta/campanha-do-zero";
import { gerarLegendaDoCarro } from "@/lib/meta/legenda-do-rascunho";
import { dadosDoCarroEmTexto } from "@/lib/estoque/anunciar-agora";
import type { EdicaoDoPublico } from "@/lib/meta/publico-puro";

// Campanha do zero (ver src/lib/meta/campanha-do-zero.ts). Toda ação confere: módulo de clientes + loja da carteira de quem pede.
// Os ids vêm do navegador e nunca são confiados: a lib confere de novo que conta, carro e página são da loja.

async function pode(clientId: string) {
  const user = await requireModuleAccess("clientes");
  if (typeof clientId !== "string" || !clientId) return null;
  return (await clienteEDaCarteira(user, clientId)) ? user : null;
}

async function semQuebrar<T>(fazer: () => Promise<T>, falha: T): Promise<T> {
  try {
    return await fazer();
  } catch (erro) {
    const digest = (erro as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw erro;
    console.error("[campanha-do-zero]", erro);
    return falha;
  }
}

export interface CarroDoZero {
  id: string;
  titulo: string;
  anoModelo: number | null;
  km: number | null;
  cor: string | null;
  precoCents: number | null;
  foto: string | null;
  jaAnunciado: boolean;
  /** O id da arte do banco de artes (vai como 1ª foto). */
  arteId: string | null;
}

export async function prepararCampanhaDoZero(clientId: string): Promise<
  { ok: true; loja: string; cidade: string | null; contas: { id: string; nome: string; metaAccountId: string }[]; carros: CarroDoZero[] } | { ok: false; erro: string }
> {
  return semQuebrar(async () => {
    if (!(await pode(clientId))) return { ok: false as const, erro: "Esta loja não está na sua carteira." };
    const loja = await prisma.client.findUnique({ where: { id: clientId }, select: { companyName: true, city: true } });
    const contas = await prisma.metaAdAccount.findMany({ where: { clientId, active: true }, select: { id: true, name: true, metaAccountId: true } });
    const carros = await prisma.estoqueCarro.findMany({
      where: { clientId, sumiuEm: null },
      orderBy: { titulo: "asc" },
      select: { id: true, titulo: true, anoModelo: true, km: true, cor: true, precoCents: true, foto: true, rascunhoAdId: true, arte: { select: { id: true } } },
    });
    return {
      ok: true as const,
      loja: loja?.companyName ?? "",
      cidade: loja?.city ?? null,
      contas: contas.map((c) => ({ id: c.id, nome: c.name ?? c.metaAccountId, metaAccountId: c.metaAccountId })),
      carros: carros.map(({ arte, rascunhoAdId, ...c }) => ({ ...c, jaAnunciado: !!rascunhoAdId && rascunhoAdId !== "pendente", arteId: arte?.id ?? null })),
    };
  }, { ok: false as const, erro: "Deu erro no servidor. Tenta de novo." });
}

export async function listarPaginas(clientId: string, contaId: string) {
  return semQuebrar(async () => {
    if (!(await pode(clientId))) return { ok: false as const, erro: "Esta loja não está na sua carteira." };
    return paginasDaConta(clientId, String(contaId ?? ""));
  }, { ok: false as const, erro: "Deu erro no servidor. Tenta de novo." });
}

export async function legendaDoZero(clientId: string, carroId: string): Promise<{ ok: true; legenda: string } | { ok: false; erro: string }> {
  return semQuebrar(async () => {
    if (!(await pode(clientId))) return { ok: false as const, erro: "Esta loja não está na sua carteira." };
    const carro = await prisma.estoqueCarro.findFirst({ where: { id: String(carroId ?? ""), clientId }, select: { titulo: true, anoModelo: true, km: true, cor: true, precoCents: true } });
    if (!carro) return { ok: false as const, erro: "Carro não é desta loja." };
    const r = await gerarLegendaDoCarro({ clientId, dadosDoCarro: dadosDoCarroEmTexto(carro), legendaDoBase: "" });
    return r.ok ? { ok: true as const, legenda: r.dados.legenda } : { ok: false as const, erro: r.erro };
  }, { ok: false as const, erro: "Deu erro no servidor. Tenta de novo." });
}

export async function criarEstruturaDoZero(p: {
  clientId: string;
  objetivo?: "leads" | "engajamento";
  contaId: string;
  paginaId: string;
  nome: string;
  estrutura: Estrutura;
  orcamento: Orcamento;
  publico: EdicaoDoPublico;
  carros: { carroId: string; nome: string; conjunto?: string }[];
  conjuntos?: { chave: string; nome: string; centavosPorDia?: number | null }[];
}): Promise<ResultadoDaEstrutura> {
  return semQuebrar(async () => {
    if (!(await pode(p.clientId))) return { ok: false as const, erro: "Esta loja não está na sua carteira." };
    const ids = new Set((await prisma.estoqueCarro.findMany({ where: { clientId: p.clientId, id: { in: (p.carros ?? []).map((c) => String(c.carroId)) } }, select: { id: true } })).map((c) => c.id));
    const carros = (p.carros ?? [])
      .filter((c) => ids.has(String(c.carroId)))
      .map((c) => ({ carroId: String(c.carroId), nome: String(c.nome ?? "").slice(0, 200), conjunto: c.conjunto ? String(c.conjunto).slice(0, 40) : undefined }));
    const conjuntos = (p.conjuntos ?? []).slice(0, 50).map((c) => ({
      chave: String(c.chave).slice(0, 40),
      nome: String(c.nome ?? "").slice(0, 200),
      centavosPorDia: typeof c.centavosPorDia === "number" && Number.isFinite(c.centavosPorDia) ? Math.round(c.centavosPorDia) : null,
    }));
    const estrutura = p.estrutura === "um-conjunto" || p.estrutura === "montada" ? p.estrutura : "por-carro";
    return criarEstrutura({ ...p, carros, conjuntos, estrutura, objetivo: p.objetivo === "engajamento" ? "engajamento" : "leads" });
  }, { ok: false as const, erro: "Deu erro no servidor. Tenta de novo." });
}

export async function criarAnuncioNoZero(p: {
  clientId: string;
  contaMeta: string;
  paginaId: string;
  adsetId: string;
  carroId: string;
  nomeDoAnuncio: string;
  legenda: string;
  maxFotos: number;
  boasVindas?: string;
  mensagemPronta?: string;
}): Promise<ResultadoDoCarro> {
  return semQuebrar(async () => {
    if (!(await pode(p.clientId))) return { ok: false as const, erro: "Esta loja não está na sua carteira." };
    return criarAnuncioDoCarro({
      ...p,
      maxFotos: Number(p.maxFotos) || 6,
      boasVindas: String(p.boasVindas ?? "").slice(0, 300),
      mensagemPronta: String(p.mensagemPronta ?? "").slice(0, 300),
    });
  }, { ok: false as const, erro: "Deu erro no servidor. Tenta de novo." });
}
