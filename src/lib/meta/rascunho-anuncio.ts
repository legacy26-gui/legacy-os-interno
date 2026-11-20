import "server-only";

import { prisma } from "@/lib/prisma";
import { acharObjetoDaLoja } from "./mudar-status";
import { buscarNaGraph } from "./cliente-graph";
import { escreverNaGraph } from "./escrever-na-graph";

// Sobe um anúncio NOVO como rascunho, dentro de um conjunto que já existe.
//
// ── Regras que não mudam ─────────────────────────────────────────────────
//
//  1. O anúncio sempre nasce PAUSADO. Quem publica é o gestor, no Gerenciador, depois de
//     conferir. Este arquivo não tem nenhum caminho que ative anúncio.
//  2. O conjunto tem que ser da loja, pelo cadastro local (acharObjetoDaLoja). Mesma trava
//     de todas as escritas: um id trocado não vira anúncio em conta de outro cliente.
//  3. Orçamento e localização ficam no CONJUNTO, não no anúncio. Este arquivo nunca os
//     altera: só LÊ, pra avisar se o conjunto não bate com a loja, e sugere o orçamento.
//  4. A página do Facebook que assina o anúncio vem de um anúncio que já existe nesse
//     conjunto. Sem nenhum anúncio ali, não há de onde tirar: o rascunho é recusado.

const DIAS_DO_MES = 30;

export interface PedidoDeRascunho {
  clientId: string;
  adsetId: string;
  nome: string;
  /** O texto principal (a legenda). */
  legenda: string;
  /** Endereço para onde o anúncio leva. Se não vier, usa o site de estoque da loja. */
  link?: string | null;
  /** Uma imagem = foto única. Duas ou mais = carrossel. A ordem é a ordem do carrossel. */
  imagens: { nome: string; bytes: Buffer }[];
  pedidoPor: string | null;
}

export interface AvisoDoConjunto {
  tipo: "localizacao" | "orcamento";
  texto: string;
}

export interface ResultadoDoRascunho {
  ok: boolean;
  erro?: string;
  adId?: string;
  creativeId?: string;
  formato?: "foto" | "carrossel";
  /** Coisas que o gestor precisa ver antes de publicar (conjunto fora do combinado etc.). */
  avisos: AvisoDoConjunto[];
  /** Sugestão de orçamento diário pra loja, pra comparar com o do conjunto. Nunca aplicada. */
  orcamentoSugeridoCents: number | null;
  orcamentoDoConjuntoCents: number | null;
}

interface ConjuntoLido {
  contaMeta: string;
  nome: string;
  dailyBudgetCents: number | null;
  geo: { cidades: string[]; coordenadas: boolean } | null;
  pageId: string | null;
}

const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Lê o conjunto na Meta: orçamento, cidades da segmentação e a página que assina os anúncios dele. */
async function lerConjunto(adsetId: string, contaMeta: string): Promise<ConjuntoLido | null> {
  const c = await buscarNaGraph<{
    name?: string;
    daily_budget?: string;
    targeting?: { geo_locations?: { cities?: { name?: string }[]; custom_locations?: unknown[] } };
  }>(adsetId, { fields: "name,daily_budget,targeting{geo_locations}" });
  if (!c.ok) return null;

  // A página: de um anúncio que já existe no conjunto. Não é cadastrada em lugar nenhum.
  const ads = await buscarNaGraph<{ data?: { creative?: { object_story_spec?: { page_id?: string } } }[] }>(
    `${adsetId}/ads`,
    { fields: "creative{object_story_spec}", limit: "5" },
  );
  const pageId = ads.ok
    ? (ads.dados.data ?? []).map((a) => a.creative?.object_story_spec?.page_id).find((p): p is string => !!p) ?? null
    : null;

  const geo = c.dados.targeting?.geo_locations;
  return {
    contaMeta,
    nome: c.dados.name ?? adsetId,
    dailyBudgetCents: c.dados.daily_budget ? Number(c.dados.daily_budget) : null,
    geo: geo
      ? { cidades: (geo.cities ?? []).map((x) => x.name ?? "").filter(Boolean), coordenadas: (geo.custom_locations ?? []).length > 0 }
      : null,
    pageId,
  };
}

/**
 * O orçamento sugerido pra loja: o investimento mensal previsto dividido por 30 dias.
 * É uma referência, não uma ordem: o gestor compara com o do conjunto e decide.
 */
export function orcamentoSugerido(gastoMensalPrevistoCents: number | null | undefined): number | null {
  if (!gastoMensalPrevistoCents || gastoMensalPrevistoCents <= 0) return null;
  return Math.round(gastoMensalPrevistoCents / DIAS_DO_MES);
}

/** O conjunto está segmentado na cidade da loja? Só conta cidade; sem cidade cadastrada, não há o que comparar. */
export function avisosDeLocalizacao(geo: ConjuntoLido["geo"], cidadeDaLoja: string | null): AvisoDoConjunto[] {
  if (!cidadeDaLoja) return [];
  if (!geo) {
    return [{ tipo: "localizacao", texto: "Não consegui ler a localização desse conjunto. Confere na Meta antes de publicar." }];
  }
  if (geo.cidades.length === 0) {
    return geo.coordenadas
      ? []
      : [{ tipo: "localizacao", texto: "Esse conjunto não tem cidade na segmentação. Confere o raio antes de publicar." }];
  }
  const alvo = semAcento(cidadeDaLoja);
  const bate = geo.cidades.some((c) => semAcento(c).includes(alvo) || alvo.includes(semAcento(c)));
  return bate
    ? []
    : [{
        tipo: "localizacao",
        texto: `Esse conjunto anuncia em ${geo.cidades.slice(0, 3).join(", ")}, e a loja é em ${cidadeDaLoja}. Confere antes de publicar.`,
      }];
}

/** Anúncio que o gestor mandou subir: confere a loja, sobe as fotos e cria o anúncio pausado. */
export async function criarRascunhoDeAnuncio(p: PedidoDeRascunho): Promise<ResultadoDoRascunho> {
  const vazio = { avisos: [], orcamentoSugeridoCents: null, orcamentoDoConjuntoCents: null };

  if (p.imagens.length === 0) return { ok: false, erro: "Manda pelo menos uma foto.", ...vazio };
  if (p.imagens.length > 10) return { ok: false, erro: "O carrossel aceita no máximo 10 fotos.", ...vazio };
  if (!p.legenda.trim()) return { ok: false, erro: "Falta a legenda.", ...vazio };

  // ── 1. O conjunto é da loja? (trava de cadastro) ────────────────────
  const conjunto = await acharObjetoDaLoja(p.clientId, "conjunto", p.adsetId);
  if (!conjunto) return { ok: false, erro: "Esse conjunto não é de uma conta desta loja.", ...vazio };

  const loja = await prisma.client.findUnique({
    where: { id: p.clientId },
    select: { companyName: true, city: true, gastoMensalPrevistoCents: true, estoqueDaLoja: { select: { siteUrl: true } } },
  });
  const conta = await prisma.metaAdset.findFirst({
    where: { adsetId: p.adsetId },
    select: { adAccount: { select: { metaAccountId: true } } },
  });
  if (!loja || !conta) return { ok: false, erro: "Não achei a conta de anúncio desse conjunto.", ...vazio };
  const contaMeta = conta.adAccount.metaAccountId;

  // ── 2. O que o conjunto já tem (leitura, nada muda) ─────────────────
  const lido = await lerConjunto(p.adsetId, contaMeta);
  if (!lido) return { ok: false, erro: "A Meta não me deixou ler esse conjunto agora. Tenta de novo daqui a pouco.", ...vazio };
  if (!lido.pageId) {
    return {
      ok: false,
      erro: "Esse conjunto ainda não tem nenhum anúncio, então não sei qual página do Facebook assina. Cria o primeiro anúncio pelo Gerenciador.",
      ...vazio,
    };
  }

  const link = p.link?.trim() || loja.estoqueDaLoja?.siteUrl || null;
  if (!link) return { ok: false, erro: "Falta o endereço para onde o anúncio leva (o site da loja).", ...vazio };

  const avisos = avisosDeLocalizacao(lido.geo, loja.city);
  const sugerido = orcamentoSugerido(loja.gastoMensalPrevistoCents);
  if (sugerido && lido.dailyBudgetCents && Math.abs(lido.dailyBudgetCents - sugerido) / sugerido > 0.5) {
    avisos.push({
      tipo: "orcamento",
      texto: `O orçamento desse conjunto é ${reais(lido.dailyBudgetCents)} por dia e o investimento previsto da loja sugere ${reais(sugerido)}. Só pra conferir: não mudei nada.`,
    });
  }

  // ── 3. As fotos (uma: foto única; mais: carrossel) ──────────────────
  const hashes: string[] = [];
  for (const img of p.imagens) {
    const r = await escreverNaGraph<{ images?: Record<string, { hash?: string }> }>(`${contaMeta}/adimages`, {
      bytes: img.bytes.toString("base64"),
      name: img.nome.slice(0, 120),
    });
    if (!r.ok) return { ok: false, erro: `A Meta não aceitou a foto ${img.nome}: ${r.erro}`, ...vazio, avisos };
    const hash = r.dados.images ? Object.values(r.dados.images)[0]?.hash : undefined;
    if (!hash) return { ok: false, erro: `A Meta não devolveu o código da foto ${img.nome}.`, ...vazio, avisos };
    hashes.push(hash);
  }

  // ── 4. O criativo (foto única ou carrossel) ─────────────────────────
  const formato: "foto" | "carrossel" = hashes.length === 1 ? "foto" : "carrossel";
  const linkData: Record<string, unknown> =
    formato === "foto"
      ? { link, message: p.legenda, image_hash: hashes[0] }
      : {
          link,
          message: p.legenda,
          child_attachments: hashes.map((h) => ({ link, image_hash: h })),
        };
  const criativo = await escreverNaGraph<{ id?: string }>(`${contaMeta}/adcreatives`, {
    name: `${p.nome.slice(0, 80)} — rascunho ${new Date().toISOString().slice(0, 10)}`,
    object_story_spec: JSON.stringify({ page_id: lido.pageId, link_data: linkData }),
  });
  if (!criativo.ok || !criativo.dados.id) {
    return { ok: false, erro: `A Meta não criou o criativo: ${criativo.ok ? "sem id" : criativo.erro}`, ...vazio, avisos };
  }

  // ── 5. O anúncio, PAUSADO ───────────────────────────────────────────
  const anuncio = await escreverNaGraph<{ id?: string }>(`${contaMeta}/ads`, {
    name: p.nome.slice(0, 200),
    adset_id: p.adsetId,
    creative: JSON.stringify({ creative_id: criativo.dados.id }),
    status: "PAUSED",
  });
  if (!anuncio.ok || !anuncio.dados.id) {
    return {
      ok: false,
      erro: `O criativo foi criado, mas o anúncio não: ${anuncio.ok ? "sem id" : anuncio.erro}. O criativo ficou solto na conta e não gasta nada.`,
      ...vazio,
      avisos,
    };
  }

  await prisma.metaAcao.create({
    data: {
      clientId: p.clientId,
      quemId: null,
      nivel: "anuncio",
      objetoId: anuncio.dados.id,
      nome: p.nome.slice(0, 200),
      statusPedido: "PAUSED",
      statusAntes: null,
      ok: true,
      origem: "criacao-rascunho",
      pedidoPor: p.pedidoPor,
      pedidoTexto: `${formato} · ${hashes.length} foto(s) · conjunto ${conjunto.nome}`.slice(0, 2000),
    },
  });

  return {
    ok: true,
    adId: anuncio.dados.id,
    creativeId: criativo.dados.id,
    formato,
    avisos,
    orcamentoSugeridoCents: sugerido,
    orcamentoDoConjuntoCents: lido.dailyBudgetCents,
  };
}

const reais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
