// Leitor dos sites de loja feitos na AUTOCONF (ex.: dsmultimarcaspg.com.br). O site tem a lista pública de estoque em
// GET /api/stock?pagina=N&registros_por_pagina=M → { data: [...], total, pagina, total_paginas }, cada carro com
// { id, marca_nome, marca_slug, modelo_nome, modelo_slug, anofabricacao, anomodelo, km, cor_nome, valorvenda, valorpromocao,
// foto, fotos: [{ url }] }. A página do carro é /carros/<marca>/<modelo>/<ano>/<id>/ e não traz as fotos todas: o "anunciar
// agora" pega as fotos da lista (fotosAutoconf). Só a lista PÚBLICA é lida — a mesma que o site mostra.

import type { CarroLido } from "./autocerto";

export interface CarroDaAutoconf extends CarroLido {
  codigo: string;
  caminho: string;
}

type Obj = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
};

export interface PaginaDaAutoconf {
  itens: Obj[];
  total: number | null;
  totalPaginas: number | null;
}

/** O JSON é uma página do estoque da Autoconf? Pura. */
export function lerPaginaAutoconf(dados: unknown): PaginaDaAutoconf | null {
  const o = dados as Obj | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.data)) return null;
  const itens = (o.data as unknown[]).filter((x): x is Obj => !!x && typeof x === "object");
  if (itens.length > 0 && !itens.slice(0, 5).every((x) => txt(x.marca_nome) && txt(x.modelo_nome) && x.id !== undefined)) return null;
  return { itens, total: num(o.total), totalPaginas: num(o.total_paginas) };
}

function fotosDoItem(o: Obj): string[] {
  const lista = Array.isArray(o.fotos) ? o.fotos : [];
  const urls = lista
    .map((f) => (typeof f === "string" ? f : f && typeof f === "object" ? (f as Obj).url : null))
    .filter((u): u is string => typeof u === "string" && u.startsWith("https://"));
  const capa = txt(o.foto);
  return [...new Set([...(capa && capa.startsWith("https://") ? [capa] : []), ...urls])];
}

/** Os carros de uma ou mais páginas (um por id). Pura. */
export function lerCarrosAutoconf(itens: Obj[]): CarroDaAutoconf[] {
  const vistos = new Set<string>();
  const carros: CarroDaAutoconf[] = [];
  for (const o of itens) {
    const marca = txt(o.marca_nome);
    const modelo = txt(o.modelo_nome);
    const id = o.id !== undefined && o.id !== null ? String(o.id) : null;
    if (!marca || !modelo || !id || vistos.has(id)) continue;
    vistos.add(id);
    const anoModelo = num(o.anomodelo);
    const promo = num(o.valorpromocao);
    const venda = num(o.valorvenda);
    const preco = promo && promo > 0 ? promo : venda;
    const slugMarca = txt(o.marca_slug) ?? "carro";
    const slugModelo = txt(o.modelo_slug) ?? "modelo";
    const tipo = txt(o.tipo_slug) ?? "carros";
    carros.push({
      codigo: id,
      caminho: `/${tipo}/${slugMarca}/${slugModelo}/${anoModelo ?? 0}/${id}/`,
      titulo: [txt(o.marca_apelido) ?? marca, modelo, anoModelo].filter(Boolean).join(" "),
      marca,
      modelo,
      versao: null,
      anoModelo,
      anoFabricacao: num(o.anofabricacao),
      cor: txt(o.cor_nome),
      km: num(o.km),
      // Em reais, com centavos ("345900.00").
      precoCents: preco !== null && preco > 0 ? Math.round(preco * 100) : null,
      foto: fotosDoItem(o)[0] ?? null,
    });
  }
  return carros;
}

/** O id do carro a partir da página dele (/carros/<marca>/<modelo>/<ano>/<id>/). Pura. */
export function idDaPaginaAutoconf(paginaUrl: string): string | null {
  try {
    const m = new URL(paginaUrl).pathname.match(/^\/[a-z-]+\/[^/]+\/[^/]+\/\d{4}\/(\d+)\/?$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** As fotos de um carro, procurando o id dele nas páginas da lista. Pura (recebe os itens já baixados). */
export function fotosDoCarroAutoconf(itens: Obj[], id: string): string[] {
  const o = itens.find((x) => String(x.id) === id);
  return o ? fotosDoItem(o) : [];
}
