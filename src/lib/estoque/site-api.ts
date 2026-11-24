// Leitor dos sites de loja que têm uma API JSON pública de veículos (ex.: bomjesusautomoveis.com): GET /api/vehicles devolve a
// lista INTEIRA, cada carro com { id, slug, marca, modelo, versao, anoFabricacao, anoModelo, preco, quilometragem, cor, fotos[] },
// e GET /api/vehicles/<slug> devolve um carro (é de onde o "anunciar agora" tira as fotos: a página do carro é montada no
// navegador e não traz foto no HTML).
//
// Só a lista PÚBLICA de carros é lida — a mesma que o site mostra pra qualquer visitante. Nada de token nem de configuração.

import type { CarroLido } from "./autocerto";

export interface CarroDaApi extends CarroLido {
  codigo: string;
  caminho: string;
}

type Obj = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null);

/** O JSON parece a lista de veículos desse tipo de site? Pura. */
export function pareceApiDeVeiculos(dados: unknown): boolean {
  if (!Array.isArray(dados) || dados.length === 0) return false;
  const amostra = dados.slice(0, 5) as Obj[];
  return amostra.every((o) => o && typeof o === "object" && txt(o.marca) && txt(o.modelo) && ("preco" in o || "anoModelo" in o));
}

/** Os carros da lista (um por id). Pura. */
export function lerApiDeVeiculos(dados: unknown): CarroDaApi[] {
  if (!Array.isArray(dados)) return [];
  const vistos = new Set<string>();
  const carros: CarroDaApi[] = [];
  for (const o of dados as Obj[]) {
    if (!o || typeof o !== "object") continue;
    const marca = txt(o.marca);
    const modelo = txt(o.modelo);
    const id = o.id !== undefined && o.id !== null ? String(o.id) : null;
    if (!marca || !modelo || !id || vistos.has(id)) continue;
    if (o.vendido === true || o.ativo === false || o.disponivel === false) continue;
    vistos.add(id);
    const versao = txt(o.versao);
    const anoModelo = num(o.anoModelo);
    const preco = num(o.preco);
    const fotos = Array.isArray(o.fotos) ? o.fotos.filter((f): f is string => typeof f === "string" && f.startsWith("https://")) : [];
    const slug = txt(o.slug);
    carros.push({
      codigo: id,
      caminho: `/veiculo/${encodeURIComponent(slug ?? id)}`,
      titulo: [marca, modelo, versao, anoModelo].filter(Boolean).join(" "),
      marca,
      modelo,
      versao,
      anoModelo,
      anoFabricacao: num(o.anoFabricacao),
      cor: txt(o.cor),
      km: num(o.quilometragem),
      // Em reais (234900 = R$ 234.900,00).
      precoCents: preco !== null && preco > 0 ? Math.round(preco * 100) : null,
      foto: fotos[0] ?? null,
    });
  }
  return carros;
}

/** O endereço JSON de UM carro, a partir da página dele (/veiculo/<slug> → /api/vehicles/<slug>). Pura. */
export function apiDoCarro(paginaUrl: string): string | null {
  try {
    const u = new URL(paginaUrl);
    const m = u.pathname.match(/^\/veiculo\/([^/]+)\/?$/);
    return m ? `${u.origin}/api/vehicles/${m[1]}` : null;
  } catch {
    return null;
  }
}

/** As fotos do JSON de um carro. Pura. */
export function fotosDoJson(dados: unknown): string[] {
  const o = dados as Obj | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.fotos)) return [];
  return [...new Set(o.fotos.filter((f): f is string => typeof f === "string" && f.startsWith("https://")))];
}
