import "server-only";

import { tipoDeImagem } from "@/lib/meta/rascunho-anuncio";
import sharp from "sharp";
import { urlDeSiteSegura } from "./ler-estoque";
import { fotosDaPaginaDoCatalogo } from "./site-catalogo";

// As fotos de um carro do estoque, lidas da página dele no site da loja.
//
// ── De onde vêm ─────────────────────────────────────────────────────────
// Do mesmo bloco estruturado (JSON-LD "Car") de onde o sistema já lê os dados do carro: o campo `image`, que no AutoCerto
// traz as fotos do carro. Se a página não traz, cai na imagem de compartilhamento (og:image). Nada é adivinhado.
//
// ── O que se baixa (SSRF) ───────────────────────────────────────────────
// O endereço da página vem do estoque (já validado na leitura) e o das fotos vem DENTRO da página, ou seja, de fora:
// só https público (nada de IP, "localhost", nome interno), no máximo MAX_FOTOS, até 4 MB cada, só JPEG/PNG (conferido pelos
// primeiros bytes), tempo máximo por foto. Foto que não passa é pulada e contada, nunca estoura.

export const MAX_FOTOS = 6;
const MAX_BYTES = 4 * 1024 * 1024;
/** WebP ou foto grande (ex.: PNG de 3,4 MB num site de catálogo) é convertida pra JPEG menor: aceita até 8 MB na entrada. */
const MAX_BYTES_WEBP = 8 * 1024 * 1024;
const ehWebp = (b: Buffer) => b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP";
const PRAZO_MS = 15_000;
const USER_AGENT = "Mozilla/5.0 (compatible; LegacyOS/1.0; +estoque)";

/** As URLs de foto da página do carro, em ordem, sem repetir, absolutas. Pura. */
export function lerFotosDaPagina(html: string, paginaUrl: string): string[] {
  const achadas: string[] = [];
  const pega = (v: unknown) => {
    if (typeof v === "string") achadas.push(v);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.url === "string") achadas.push(o.url);
      else if (typeof o.contentUrl === "string") achadas.push(o.contentUrl);
    }
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]) as unknown;
      for (const x of Array.isArray(j) ? j : [j]) {
        const o = x as Record<string, unknown>;
        const tipo = o["@type"];
        if (tipo === "Car" || tipo === "Vehicle" || (Array.isArray(tipo) && tipo.includes("Car"))) {
          if (Array.isArray(o.image)) o.image.forEach(pega);
          else pega(o.image);
        }
      }
    } catch {
      // um bloco torto não impede de achar o outro
    }
  }
  // Site de catálogo (ex.: 7pointmotors): as fotos estão embutidas na página, na pasta do carro.
  if (achadas.length === 0) achadas.push(...fotosDaPaginaDoCatalogo(html, paginaUrl));
  if (achadas.length === 0) {
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (og) achadas.push(og[1]);
  }
  const unicas: string[] = [];
  for (const bruta of achadas) {
    try {
      const u = new URL(bruta.trim().replace(/&amp;/g, "&"), paginaUrl).toString();
      if (!unicas.includes(u)) unicas.push(u);
    } catch {
      // endereço inválido: pula
    }
  }
  return unicas;
}

export interface FotoBaixada {
  url: string;
  bytes: Buffer;
}

export interface FotosDoCarro {
  ok: boolean;
  erro?: string;
  fotos: FotoBaixada[];
  /** Quantas fotos da página ficaram de fora (endereço inseguro, grande demais, formato que a Meta não aceita, falha). */
  puladas: number;
}

async function baixarFoto(url: string): Promise<Buffer | null> {
  if (!urlDeSiteSegura(url)) return null;
  try {
    const r = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "image/jpeg,image/png,image/webp" }, signal: AbortSignal.timeout(PRAZO_MS), cache: "no-store", redirect: "error" });
    if (!r.ok) return null;
    const dito = Number(r.headers.get("content-length") ?? 0);
    if (dito > MAX_BYTES_WEBP) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES_WEBP) return null;
    if (tipoDeImagem(bytes) && bytes.length <= MAX_BYTES) return bytes;
    // WebP, ou JPEG/PNG grande demais (sites de catálogo mandam PNG de vários MB): converte pra JPEG menor, que a Meta aceita.
    if (ehWebp(bytes) || tipoDeImagem(bytes)) {
      const jpeg = await sharp(bytes).rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      return jpeg.length <= MAX_BYTES ? jpeg : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Só os ENDEREÇOS das fotos da página do carro (sem baixar): é o que a tela mostra pra pessoa escolher. */
export async function enderecosDasFotos(paginaUrl: string): Promise<{ ok: true; urls: string[] } | { ok: false; erro: string }> {
  if (!urlDeSiteSegura(paginaUrl)) return { ok: false, erro: "o endereço do carro não é seguro de abrir" };
  let html: string;
  try {
    const r = await fetch(paginaUrl, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, signal: AbortSignal.timeout(PRAZO_MS), cache: "no-store" });
    if (!r.ok) return { ok: false, erro: `o site respondeu ${r.status}` };
    html = await r.text();
    if (html.length > 3_000_000) return { ok: false, erro: "a página do carro veio grande demais" };
  } catch {
    return { ok: false, erro: "o site da loja não respondeu" };
  }
  const urls = lerFotosDaPagina(html, paginaUrl).filter(urlDeSiteSegura);
  return urls.length === 0 ? { ok: false, erro: "a página do carro não mostra foto" } : { ok: true, urls };
}

/**
 * Baixa as fotos do carro (até MAX_FOTOS). `escolhidas`: só estas (a tela deixa tirar fotos); elas só valem se estiverem
 * mesmo na página do carro — endereço que o navegador mandar e a página não tem é ignorado.
 */
export async function baixarFotosDoCarro(paginaUrl: string, escolhidas?: string[]): Promise<FotosDoCarro> {
  const lidas = await enderecosDasFotos(paginaUrl);
  if (!lidas.ok) return { ok: false, erro: lidas.erro, fotos: [], puladas: 0 };
  // A foto escolhida é comparada SEM a parte depois do "?": site de catálogo gera um link assinado novo a cada visita (o
  // código muda, o arquivo não). Baixa-se sempre o link da leitura de AGORA, que é o que ainda vale.
  const semAssinatura = (u: string) => u.split("?")[0];
  const agora = new Map(lidas.urls.map((u) => [semAssinatura(u), u]));
  const urls = escolhidas
    ? [...new Set(escolhidas.map(semAssinatura))].map((k) => agora.get(k)).filter((u): u is string => !!u)
    : lidas.urls;
  if (urls.length === 0) return { ok: false, erro: "nenhuma das fotos escolhidas está na página do carro", fotos: [], puladas: 0 };
  const fotos: FotoBaixada[] = [];
  let puladas = 0;
  for (const u of urls) {
    if (fotos.length >= MAX_FOTOS) break;
    const bytes = await baixarFoto(u);
    if (bytes) fotos.push({ url: u, bytes });
    else puladas++;
  }
  if (fotos.length === 0) return { ok: false, erro: "nenhuma foto do site pôde ser usada (formato ou tamanho que a Meta não aceita)", fotos: [], puladas };
  return { ok: true, fotos, puladas };
}
