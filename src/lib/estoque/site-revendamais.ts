// Leitor dos sites feitos pela RevendaMais (ex.: autopgveiculos.com.br).
//
// A página de estoque (/multipla) tem verificação anti-robô, mas o SITEMAP (/sitemap.xml, público, feito pra buscadores) lista
// todos os carros: /carros/<Marca>/<Modelo>/<Versao>/<...>-<codigo>.html. A página de cada carro traz os dados em atributos
// (data-price, data-km, data-year) e num quadro (Ano Fab., Ano Mod., Km, Cor), e as fotos (s3.carro57.com.br) na galeria.
// Puro (testável): quem baixa é ler-estoque.ts.

import type { CarroLido, ItemDaLista, ListaLida } from "./autocerto";

/** O sitemap é de um site RevendaMais? (O próprio arquivo assina "Desenvolvido por RevendaMais".) */
export function pareceRevendaMais(sitemap: string): boolean {
  return /RevendaMais/i.test(sitemap) && /<urlset/i.test(sitemap);
}

/** Os carros do sitemap (um por código), na ordem em que aparecem. */
export function listaDoSitemap(sitemap: string): ListaLida {
  const itens: ItemDaLista[] = [];
  const vistos = new Set<string>();
  for (const m of sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    let u: URL;
    try {
      u = new URL(m[1].replace(/&amp;/g, "&"));
    } catch {
      continue;
    }
    const c = u.pathname.match(/^\/(?:carros|motos|caminhoes|caminhonetes|utilitarios)\/.+-(\d{4,})\.html$/i);
    if (!c || vistos.has(c[1])) continue;
    vistos.add(c[1]);
    itens.push({ codigo: c[1], caminho: u.pathname });
  }
  return { itens, totalDito: null, ehAutoCerto: pareceRevendaMais(sitemap) };
}

const numero = (v: string | null | undefined) => {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  return d ? Number(d) : null;
};
const decodificar = (t: string) =>
  t
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim();

/** Um valor do quadro de dados ("Cor" → "PRATA"). */
function doQuadro(html: string, rotulo: string): string | null {
  const m = html.match(new RegExp(`<span[^>]*>\\s*${rotulo}\\s*<\\/span>\\s*<strong[^>]*>([^<]*)<\\/strong>`, "i"));
  const v = m ? decodificar(m[1]) : "";
  return v && v !== "---" ? v : null;
}

/** "Chevrolet" / "10mt-Lt2" do endereço → "Chevrolet" / "10mt Lt2". */
const doCaminho = (s: string | undefined) => (s ? decodeURIComponent(s).replace(/-/g, " ").trim() : null);

/** As fotos da galeria do carro (tamanho grande, _W_), em ordem. */
export function fotosRevendaMais(html: string): string[] {
  const urls: string[] = [];
  for (const m of html.matchAll(/<img[^>]+data-src=["'](https:\/\/[^"']+)["'][^>]*class=["'][^"']*lazy-slide/gi)) if (!urls.includes(m[1])) urls.push(m[1]);
  if (urls.length === 0) for (const m of html.matchAll(/<img[^>]+class=["'][^"']*lazy-slide[^"']*["'][^>]*data-src=["'](https:\/\/[^"']+)["']/gi)) if (!urls.includes(m[1])) urls.push(m[1]);
  return urls;
}

/** Os dados do carro na página dele. `codigo` é o do endereço (a página também lista outros carros, "veja também"). */
export function lerCarroRevendaMais(html: string, codigo: string, caminho: string): CarroLido | null {
  // O bloco de favorito DESTE carro traz descrição, preço, km e ano.
  const bloco = html.match(new RegExp(`<a[^>]+id=["']add-favorite-${codigo}["'][^>]*>`, "i"))?.[0] ?? "";
  const attr = (n: string) => bloco.match(new RegExp(`data-${n}=["']([^"']*)["']`, "i"))?.[1] ?? null;
  const descricao = attr("description") ? decodificar(attr("description") as string) : null;
  const titulo = html.match(/<title>([^<]+)<\/title>/i)?.[1];
  const partes = caminho.split("/").filter(Boolean); // carros, Marca, Modelo, Versao, arquivo
  const marca = doCaminho(partes[1]);
  const modelo = doCaminho(partes[2]);
  const versao = doCaminho(partes[3]);
  const anoModelo = numero(doQuadro(html, "Ano Mod\\.")) ?? numero(attr("year"));
  const nome = descricao ?? (titulo ? decodificar(titulo).replace(/\s+em\s+.+$/i, "") : null) ?? [marca, modelo, versao].filter(Boolean).join(" ");
  if (!nome) return null;
  const preco = attr("price") ?? html.match(/R\$\s*([\d.]+,\d{2})/)?.[1] ?? null;
  const precoCents = preco ? numero(preco) : null; // "72.900,00" → 7290000
  const fotos = fotosRevendaMais(html);
  return {
    titulo: anoModelo && !nome.includes(String(anoModelo)) ? `${nome} ${anoModelo}` : nome,
    marca,
    modelo,
    versao,
    anoModelo,
    anoFabricacao: numero(doQuadro(html, "Ano Fab\\.")),
    cor: doQuadro(html, "Cor"),
    km: numero(attr("km")) ?? numero(doQuadro(html, "Km")),
    precoCents: precoCents && precoCents > 0 ? precoCents : null,
    foto: fotos[0] ?? attr("imglink"),
  };
}
