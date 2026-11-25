"use server";

import { revalidatePath } from "next/cache";
import { atualizarFipe } from "@/lib/fipe/atualizar";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { escopoDaCarteira } from "@/lib/carteira";
import { lerEstoqueDaLoja, origemDoSite, urlDeSiteSegura } from "@/lib/estoque/ler-estoque";
import { lerLista, pareceAutoCerto } from "@/lib/estoque/autocerto";
import { lerCatalogo, pareceCatalogo } from "@/lib/estoque/site-catalogo";
import { lerApiDeVeiculos, pareceApiDeVeiculos } from "@/lib/estoque/site-api";
import { lerCarrosAutoconf, lerPaginaAutoconf } from "@/lib/estoque/site-autoconf";

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
 * Liga o site de uma loja: confere que é um site que sabemos ler (AutoCerto ou catálogo), grava e já faz a primeira leitura.
 * Só o administrador liga: é o endereço que o sistema vai visitar duas vezes por dia.
 */
export async function conectarSiteDaLoja(clientId: string, endereco: string): Promise<EstoqueState> {
  const { user, loja } = await lojaDaPessoa(clientId);
  if (user.role !== "ADMIN") return { erro: "Só o administrador liga o site de uma loja." };
  if (!loja) return { erro: "Não achei essa loja na sua carteira." };

  const origem = origemDoSite(endereco.trim());
  if (!origem || !urlDeSiteSegura(origem)) return { erro: "Esse endereço não parece um site válido. Cole algo como https://r2multimarcas.com.br." };

  // Confere ANTES de gravar: um endereço errado não pode ficar sendo visitado todo dia. Dois tipos de site sabem ser lidos:
  // AutoCerto (/Veiculos) e site de catálogo (/estoque com os carros embutidos, ex.: 7pointmotors.com).
  const abrir = async (caminho: string) => {
    try {
      const r = await fetch(`${origem}${caminho}`, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "LegacyOS-estoque/1.0" }, cache: "no-store" });
      return r.ok ? await r.text() : null;
    } catch {
      return null;
    }
  };
  let sistema: "autocerto" | "catalogo" | "api" | "autoconf" | null = null;
  const doAutoCerto = await abrir("/Veiculos");
  if (doAutoCerto && pareceAutoCerto(doAutoCerto)) {
    if (lerLista(doAutoCerto).itens.length === 0) return { erro: "Achei o AutoCerto, mas a lista de veículos veio vazia." };
    sistema = "autocerto";
  } else {
    const doCatalogo = await abrir("/estoque");
    if (doCatalogo && pareceCatalogo(doCatalogo)) {
      if (lerCatalogo(doCatalogo).length === 0) return { erro: "Achei a página de estoque, mas ela veio sem carros." };
      sistema = "catalogo";
    }
  }
  if (!sistema) {
    const daApi = await abrir("/api/vehicles");
    let dados: unknown = null;
    try {
      dados = daApi ? JSON.parse(daApi) : null;
    } catch {
      dados = null;
    }
    if (pareceApiDeVeiculos(dados)) {
      if (lerApiDeVeiculos(dados).length === 0) return { erro: "Achei a lista de veículos do site, mas ela veio vazia." };
      sistema = "api";
    }
  }
  if (!sistema) {
    const daAutoconf = await abrir("/api/stock?pagina=1&registros_por_pagina=5");
    let pagina = null;
    try {
      pagina = daAutoconf ? lerPaginaAutoconf(JSON.parse(daAutoconf)) : null;
    } catch {
      pagina = null;
    }
    if (pagina) {
      if (lerCarrosAutoconf(pagina.itens).length === 0) return { erro: "Achei o estoque da Autoconf no site, mas ele veio vazio." };
      sistema = "autoconf";
    }
  }
  if (!sistema) {
    return { erro: "Ainda não sei ler o estoque desse site (não é AutoCerto, Autoconf, catálogo, nem tem a lista de veículos aberta). Me manda o endereço que eu vejo qual sistema ele usa." };
  }

  await prisma.estoqueDaLoja.upsert({
    where: { clientId },
    create: { clientId, siteUrl: origem, sistema },
    update: { siteUrl: origem, sistema, ultimoErro: null },
  });
  const r = await lerEstoqueDaLoja(clientId);
  revalidatePath("/inteligencia-comercial/estoque");
  if (!r.ok) return { erro: `Liguei o site, mas a primeira leitura falhou: ${r.erro}` };
  return { ok: `${loja.companyName}: site ligado. Li ${r.total} carros${r.detalhesLidos ? ` (${r.detalhesLidos} páginas de carro)` : ""}. Daqui pra frente leio duas vezes por dia.` };
}

/** Lê agora o estoque de uma loja da carteira da pessoa. */
export async function lerEstoqueAgora(clientId: string): Promise<EstoqueState> {
  const { loja } = await lojaDaPessoa(clientId);
  if (!loja) return { erro: "Não achei essa loja na sua carteira." };
  const r = await lerEstoqueDaLoja(clientId);
  revalidatePath("/inteligencia-comercial/estoque");
  if (!r.ok) return { erro: r.erro ?? "A leitura falhou." };
  const partes = [`${r.total} carros no site`];
  if (r.novos) partes.push(`${r.novos} novo${r.novos > 1 ? "s" : ""}`);
  if (r.sairam) partes.push(`${r.sairam} saiu${r.sairam > 1 ? "ram" : ""} da lista`);
  // E a FIPE dos carros desta loja que ainda não têm (um pouco por vez: a cota da FIPE é diária).
  let fipe = "";
  try {
    const f = await atualizarFipe({ clientId, consultas: 40, ms: 50_000 });
    if (f.conferidos > 0) fipe = ` FIPE conferida em ${f.conferidos} carro${f.conferidos > 1 ? "s" : ""}${f.parouPorque ? " (o resto entra na próxima rodada)" : ""}.`;
  } catch (e) {
    console.error("[fipe] na leitura manual:", e instanceof Error ? e.message : e);
  }
  revalidatePath("/inteligencia-comercial/estoque");
  return { ok: partes.join(" · ") + (r.semMarcarSaidas ? ` — não marquei saídas: ${r.semMarcarSaidas}.` : ".") + fipe };
}

/** Desliga a leitura de uma loja (o histórico dos carros fica). */
export async function desligarSiteDaLoja(clientId: string): Promise<EstoqueState> {
  const { user, loja } = await lojaDaPessoa(clientId);
  if (user.role !== "ADMIN") return { erro: "Só o administrador desliga o site de uma loja." };
  if (!loja) return { erro: "Não achei essa loja na sua carteira." };
  await prisma.estoqueDaLoja.deleteMany({ where: { clientId } });
  revalidatePath("/inteligencia-comercial/estoque");
  return { ok: "Leitura desligada. O histórico dos carros fica guardado." };
}
