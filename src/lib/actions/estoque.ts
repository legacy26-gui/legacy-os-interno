"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { escopoDaCarteira } from "@/lib/carteira";
import { lerEstoqueDaLoja, origemDoSite, urlDeSiteSegura } from "@/lib/estoque/ler-estoque";
import { lerLista, pareceAutoCerto } from "@/lib/estoque/autocerto";

export type EstoqueState = { ok?: string; erro?: string };

async function lojaDaPessoa(clientId: string) {
  const user = await requireModuleAccess("gestao-contas");
  // A mesma régua das telas: a pessoa só mexe em loja que é da carteira dela.
  const loja = await prisma.client.findFirst({
    where: { id: clientId, ...escopoDaCarteira(user) },
    select: { id: true, companyName: true },
  });
  return { user, loja };
}

/**
 * Liga o site de uma loja: confere que é AutoCerto, grava e já faz a primeira leitura.
 * Só o administrador liga: é o endereço que o sistema vai visitar duas vezes por dia.
 */
export async function conectarSiteDaLoja(clientId: string, endereco: string): Promise<EstoqueState> {
  const { user, loja } = await lojaDaPessoa(clientId);
  if (user.role !== "ADMIN") return { erro: "Só o administrador liga o site de uma loja." };
  if (!loja) return { erro: "Não achei essa loja na sua carteira." };

  const origem = origemDoSite(endereco.trim());
  if (!origem || !urlDeSiteSegura(origem)) return { erro: "Esse endereço não parece um site válido. Cole algo como https://r2multimarcas.com.br." };

  // Confere ANTES de gravar: um endereço errado não pode ficar sendo visitado todo dia.
  let html: string;
  try {
    const r = await fetch(`${origem}/Veiculos`, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "LegacyOS-estoque/1.0" }, cache: "no-store" });
    if (!r.ok) return { erro: `O site respondeu ${r.status}. Confere o endereço.` };
    html = await r.text();
  } catch {
    return { erro: "Não consegui abrir esse site. Confere o endereço." };
  }
  if (!pareceAutoCerto(html)) {
    return { erro: "Esse site não é do AutoCerto. Por enquanto só leio sites desse sistema — me manda o endereço que eu vejo qual sistema ele usa." };
  }
  const lista = lerLista(html);
  if (lista.itens.length === 0) return { erro: "Achei o AutoCerto, mas a lista de veículos veio vazia." };

  await prisma.estoqueDaLoja.upsert({
    where: { clientId },
    create: { clientId, siteUrl: origem, sistema: "autocerto" },
    update: { siteUrl: origem, sistema: "autocerto", ultimoErro: null },
  });
  const r = await lerEstoqueDaLoja(clientId);
  revalidatePath("/estoque");
  if (!r.ok) return { erro: `Liguei o site, mas a primeira leitura falhou: ${r.erro}` };
  return { ok: `${loja.companyName}: site ligado. Li ${r.total} carros${r.detalhesLidos ? ` (${r.detalhesLidos} páginas de carro)` : ""}. Daqui pra frente leio duas vezes por dia.` };
}

/** Lê agora o estoque de uma loja da carteira da pessoa. */
export async function lerEstoqueAgora(clientId: string): Promise<EstoqueState> {
  const { loja } = await lojaDaPessoa(clientId);
  if (!loja) return { erro: "Não achei essa loja na sua carteira." };
  const r = await lerEstoqueDaLoja(clientId);
  revalidatePath("/estoque");
  if (!r.ok) return { erro: r.erro ?? "A leitura falhou." };
  const partes = [`${r.total} carros no site`];
  if (r.novos) partes.push(`${r.novos} novo${r.novos > 1 ? "s" : ""}`);
  if (r.sairam) partes.push(`${r.sairam} saiu${r.sairam > 1 ? "ram" : ""} da lista`);
  return { ok: partes.join(" · ") + (r.semMarcarSaidas ? ` — não marquei saídas: ${r.semMarcarSaidas}.` : ".") };
}

/** Desliga a leitura de uma loja (o histórico dos carros fica). */
export async function desligarSiteDaLoja(clientId: string): Promise<EstoqueState> {
  const { user, loja } = await lojaDaPessoa(clientId);
  if (user.role !== "ADMIN") return { erro: "Só o administrador desliga o site de uma loja." };
  if (!loja) return { erro: "Não achei essa loja na sua carteira." };
  await prisma.estoqueDaLoja.deleteMany({ where: { clientId } });
  revalidatePath("/estoque");
  return { ok: "Leitura desligada. O histórico dos carros fica guardado." };
}
