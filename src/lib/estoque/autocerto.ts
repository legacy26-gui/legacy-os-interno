// O leitor do AutoCerto. Arquivo puro: recebe o HTML, devolve dados. Sem rede, sem banco.
//
// ── Por que dá pra ler com segurança ─────────────────────────────────────
//
// Todo site feito no AutoCerto tem o mesmo molde, e cada carro traz seus dados num bloco
// estruturado (JSON-LD, o formato que o Google lê pra mostrar o carro na busca). Esse
// bloco é feito pra ser lido por máquina: não quebra quando a loja muda cor ou layout,
// que é o que quebraria uma leitura "do que aparece na tela".
//
//   /Veiculos                          a lista, com o link de cada carro e o total
//   /Veiculo/<slug>/<codigo>/detalhes  o carro: marca, modelo, ano, km, cor, preço

export interface ItemDaLista {
  codigo: string;
  /** Caminho relativo, como está no site. */
  caminho: string;
}

export interface ListaLida {
  itens: ItemDaLista[];
  /** O total que a PÁGINA diz ter ("55 veículos"), quando diz. Serve pra desconfiar de lista cortada. */
  totalDito: number | null;
  /** O HTML parece de fato ser de um site AutoCerto? */
  ehAutoCerto: boolean;
}

export interface CarroLido {
  titulo: string;
  marca: string | null;
  modelo: string | null;
  versao: string | null;
  anoModelo: number | null;
  anoFabricacao: number | null;
  cor: string | null;
  km: number | null;
  precoCents: number | null;
  foto: string | null;
}

/** O site é de um AutoCerto? Pelo rodapé/arquivos que todo site deles carrega. */
export function pareceAutoCerto(html: string): boolean {
  return /static\.autocerto\.com\/sitecliente|autocerto\.com\/fotos\//i.test(html);
}

/** A lista: os carros (únicos, na ordem em que aparecem) e o total que a página anuncia. */
export function lerLista(html: string): ListaLida {
  const visto = new Set<string>();
  const itens: ItemDaLista[] = [];
  for (const m of html.matchAll(/href="(\/Veiculo\/[^"]+?\/(\d+)\/detalhes)"/g)) {
    if (visto.has(m[2])) continue;
    visto.add(m[2]);
    itens.push({ codigo: m[2], caminho: m[1] });
  }
  // "55 veículos", "55 resultados", "55 carros": o maior número colado numa dessas palavras.
  const totais = [...html.matchAll(/(\d{1,4})\s*(?:ve[ií]culos|ve&iacute;culos|resultados?|carros)/gi)].map((m) => Number(m[1]));
  return { itens, totalDito: totais.length ? Math.max(...totais) : null, ehAutoCerto: pareceAutoCerto(html) };
}

function numero(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
}
function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Procura o bloco "Car" entre os JSON-LD da página. */
function blocoDoCarro(html: string): Record<string, unknown> | null {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]) as unknown;
      const lista = Array.isArray(j) ? j : [j];
      for (const x of lista) {
        const o = x as Record<string, unknown>;
        const tipo = o["@type"];
        if (tipo === "Car" || (Array.isArray(tipo) && tipo.includes("Car")) || tipo === "Vehicle") return o;
      }
    } catch {
      // um bloco torto não impede de achar o outro
    }
  }
  return null;
}

/** O carro, da página dele. `null` quando a página não traz os dados (não inventa). */
export function lerCarro(html: string): CarroLido | null {
  const c = blocoDoCarro(html);
  if (!c) return null;
  const titulo = texto(c.name);
  if (!titulo) return null;

  const marca = texto((c.brand as { name?: unknown } | undefined)?.name);
  const km = numero((c.mileageFromOdometer as { value?: unknown } | undefined)?.value);

  // O preço pode vir como oferta única ou lista de ofertas.
  const oferta = (Array.isArray(c.offers) ? c.offers[0] : c.offers) as { price?: unknown } | undefined;
  const preco = numero(oferta?.price);

  const imagem = Array.isArray(c.image) ? c.image[0] : c.image;
  const ano = (v: unknown) => {
    const n = numero(v);
    return n !== null && n >= 1950 && n <= 2100 ? Math.round(n) : null;
  };

  return {
    titulo,
    marca,
    modelo: texto(c.model),
    versao: texto(c.vehicleConfiguration),
    anoModelo: ano(c.vehicleModelDate),
    anoFabricacao: ano(c.productionDate),
    cor: texto(c.color),
    km: km !== null && km >= 0 ? Math.round(km) : null,
    precoCents: preco !== null && preco > 0 ? Math.round(preco * 100) : null,
    foto: texto(imagem),
  };
}
