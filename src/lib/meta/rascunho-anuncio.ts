import "server-only";

import { prisma } from "@/lib/prisma";
import { acharObjetoDaLoja } from "./mudar-status";
import { buscarNaGraph } from "./cliente-graph";
import { escreverNaGraph, escritaLiberada } from "./escrever-na-graph";

// Sobe um anúncio como RASCUNHO, duplicando um anúncio que a loja já tem.
//
// ── Como o gestor trabalha (e por que é duplicar) ────────────────────────
//
// O gestor escolhe a campanha e o conjunto, aponta UM anúncio que a loja já roda (o "base") e
// manda as fotos do carro novo. O sistema copia do anúncio-base tudo que não muda de carro pra
// carro — página que assina, botão, rastreamento, configuração do criativo — e troca só o que
// é do carro: fotos, legenda, título e (se o gestor quiser) o link. O anúncio nasce PAUSADO; o
// gestor confere no Gerenciador e publica. Criar um anúncio do zero continua sendo no Gerenciador.
//
// ── Regras que não mudam ─────────────────────────────────────────────────
//
//  1. O anúncio sempre nasce PAUSADO. Este arquivo não tem nenhum caminho que ative anúncio.
//  2. Conjunto e anúncio-base têm que ser da loja, pelo cadastro local (acharObjetoDaLoja). Mesma
//     trava de todas as escritas: um id trocado não vira anúncio em conta de outro cliente.
//  3. Orçamento e localização ficam no CONJUNTO, não no anúncio. Este arquivo nunca os altera: só
//     LÊ, pra avisar se o conjunto não bate com a loja, e sugere o orçamento ("sugere, eu decido").
//  4. Só duplica anúncio de FOTO ou CARROSSEL de imagem. Vídeo, Advantage+ (várias legendas) e anúncio
//     que usa um post já existente são recusados com o motivo: copiá-los seria adivinhar.
//  5. O link só muda se o gestor mudar. Anúncio que leva pro WhatsApp continua levando pro WhatsApp.

const DIAS_DO_MES = 30;
const MAX_FOTOS = 10;
const MAX_BYTES_POR_FOTO = 4 * 1024 * 1024;

// ───────────────────────────── Tipos ──────────────────────────────────────

export interface AvisoDoConjunto {
  tipo: "localizacao" | "orcamento" | "conjunto";
  texto: string;
}

/** O que se aprendeu do anúncio-base. */
export interface BaseLida {
  adId: string;
  nome: string;
  contaMeta: string | null;
  spec: Record<string, unknown>;
  urlTags: string | null;
  graus: unknown;
  tracking: unknown;
  formato: "foto" | "carrossel";
  legenda: string;
  titulo: string;
  link: string;
}

export type ResultadoDaBase = { ok: true; base: BaseLida } | { ok: false; erro: string };

export interface PedidoDeRascunho {
  clientId: string;
  /** O anúncio que a loja já tem e que será duplicado. */
  baseAdId: string;
  /** O conjunto onde o anúncio novo vai ficar. */
  adsetId: string;
  nome: string;
  /** O texto principal (a legenda). */
  legenda: string;
  /** O título. `null` = tira o título do anúncio novo. */
  titulo: string | null;
  /** Para onde o anúncio leva. Em geral o mesmo do base. */
  link: string;
  /** Códigos das fotos já enviadas (subirFotoDoRascunho). Uma = foto única; duas ou mais = carrossel. */
  hashes: string[];
  /** O conjunto acabou de ser duplicado por aqui (o aviso de "conjunto pausado" muda). */
  conjuntoNovo?: boolean;
  pedidoPor: string | null;
  quemId: string | null;
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
  /** Link do anúncio no Gerenciador, pra o gestor conferir e publicar. */
  linkDoGerenciador?: string;
}

const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const reais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const texto = (v: unknown): string => (typeof v === "string" ? v : "");

/** O endereço do anúncio no Gerenciador da Meta. */
export function linkDoGerenciador(contaMeta: string, id: string, nivel: "anuncio" | "conjunto" = "anuncio"): string {
  const conta = contaMeta.replace(/^act_/, "");
  return nivel === "conjunto"
    ? `https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${conta}&selected_adset_ids=${encodeURIComponent(id)}`
    : `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${conta}&selected_ad_ids=${encodeURIComponent(id)}`;
}

// ───────────────────────── Sugestão e avisos (puros) ─────────────────────

/**
 * O orçamento sugerido pra loja: o investimento mensal previsto dividido por 30 dias.
 * É uma referência, não uma ordem: o gestor compara com o do conjunto e decide.
 */
export function orcamentoSugerido(gastoMensalPrevistoCents: number | null | undefined): number | null {
  if (!gastoMensalPrevistoCents || gastoMensalPrevistoCents <= 0) return null;
  return Math.round(gastoMensalPrevistoCents / DIAS_DO_MES);
}

interface GeoLido {
  cidades: string[];
  coordenadas: boolean;
}

/** O conjunto está segmentado na cidade da loja? Só conta cidade; sem cidade cadastrada, não há o que comparar. */
export function avisosDeLocalizacao(geo: GeoLido | null, cidadeDaLoja: string | null): AvisoDoConjunto[] {
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

/** Compara o orçamento do conjunto com o sugerido (só avisa quando a diferença passa de 50%). */
export function avisoDeOrcamento(doConjuntoCents: number | null, sugeridoCents: number | null): AvisoDoConjunto | null {
  if (!sugeridoCents || !doConjuntoCents) return null;
  if (Math.abs(doConjuntoCents - sugeridoCents) / sugeridoCents <= 0.5) return null;
  return {
    tipo: "orcamento",
    texto: `O orçamento desse conjunto é ${reais(doConjuntoCents)} por dia e o investimento previsto da loja sugere ${reais(sugeridoCents)}. Só pra conferir: não mudei nada.`,
  };
}

// ───────────────────────── Ler o anúncio-base ────────────────────────────

interface CriativoDaMeta {
  id?: string;
  object_story_spec?: Record<string, unknown>;
  url_tags?: string;
  degrees_of_freedom_spec?: unknown;
  asset_feed_spec?: unknown;
  object_story_id?: string;
}

/**
 * Lê na Meta o anúncio que vai servir de molde e confere se dá pra duplicar.
 *
 * Também serve pra tela: ao escolher o base, ela mostra a legenda, o título e o link dele (pra o
 * gestor trocar o que é do carro antigo) ou o motivo de não servir.
 */
export async function lerBaseDoAnuncio(clientId: string, baseAdId: string): Promise<ResultadoDaBase> {
  const achado = await acharObjetoDaLoja(clientId, "anuncio", baseAdId);
  if (!achado) return { ok: false, erro: "Esse anúncio não é de uma conta desta loja." };

  const r = await buscarNaGraph<{ name?: string; tracking_specs?: unknown; creative?: CriativoDaMeta }>(baseAdId, {
    fields: "name,tracking_specs,creative{id,object_story_spec,url_tags,degrees_of_freedom_spec,asset_feed_spec,object_story_id}",
  });
  if (!r.ok) return { ok: false, erro: `A Meta não me deixou ler o anúncio-base agora: ${r.erro}` };

  const c = r.dados.creative;
  const spec = objeto(c?.object_story_spec);
  if (!c || !spec) {
    return {
      ok: false,
      erro: "Esse anúncio usa um post que já existia, e não dá pra copiar. Escolhe como base um anúncio de foto criado direto no Gerenciador.",
    };
  }
  if (c.asset_feed_spec) {
    return { ok: false, erro: "Esse anúncio é Advantage+ (várias legendas combinadas pela Meta). Escolhe como base um anúncio de foto comum." };
  }
  const link = objeto(spec.link_data);
  if (!link) {
    return { ok: false, erro: "Esse anúncio é de vídeo (ou outro formato que não é foto). Escolhe como base um anúncio de foto ou carrossel." };
  }

  const cartoes = Array.isArray(link.child_attachments) ? (link.child_attachments as Record<string, unknown>[]) : [];
  const conta = await prisma.metaAdCreative.findFirst({
    where: { adId: baseAdId, adAccount: { clientId } },
    select: { adAccount: { select: { metaAccountId: true } } },
  });
  return {
    ok: true,
    base: {
      adId: baseAdId,
      nome: r.dados.name ?? achado.nome,
      contaMeta: conta?.adAccount.metaAccountId ?? null,
      spec,
      urlTags: c.url_tags ?? null,
      graus: c.degrees_of_freedom_spec ?? null,
      tracking: r.dados.tracking_specs ?? null,
      formato: cartoes.length > 0 ? "carrossel" : "foto",
      legenda: texto(link.message),
      titulo: texto(link.name) || texto(cartoes[0]?.name),
      link: texto(link.link) || texto(cartoes[0]?.link),
    },
  };
}

/**
 * O `object_story_spec` do anúncio novo, a partir do do base: copia tudo e troca fotos, legenda,
 * título e link. Pura (sem rede), pra poder ser testada sozinha.
 */
export function montarSpecDoRascunho(
  specDoBase: Record<string, unknown>,
  novo: { legenda: string; titulo: string | null; link: string; hashes: string[]; linkDoBase: string },
): Record<string, unknown> {
  const spec = JSON.parse(JSON.stringify(specDoBase)) as Record<string, unknown>;
  const antigo = objeto(spec.link_data) ?? {};
  const cartoesAntigos = Array.isArray(antigo.child_attachments) ? (antigo.child_attachments as Record<string, unknown>[]) : [];
  const ld: Record<string, unknown> = { ...antigo };

  // Fora tudo que é da mídia antiga.
  for (const k of ["image_hash", "picture", "image_crops", "child_attachments", "multi_share_end_card", "multi_share_optimized", "video_id"]) {
    delete ld[k];
  }

  ld.message = novo.legenda;
  ld.link = novo.link;
  if (novo.titulo === null || novo.titulo === "") delete ld.name;
  else ld.name = novo.titulo;

  // O botão (ex.: "Saiba mais"). O link do botão só muda se o link do anúncio mudou.
  const botao = objeto(antigo.call_to_action);
  const mudouLink = novo.link !== novo.linkDoBase;
  if (botao && mudouLink) {
    const valor = objeto(botao.value);
    if (valor && typeof valor.link === "string") valor.link = novo.link;
  }

  if (novo.hashes.length === 1) {
    ld.image_hash = novo.hashes[0];
  } else {
    const descricao = texto(antigo.description) || texto(cartoesAntigos[0]?.description);
    ld.child_attachments = novo.hashes.map((h) => ({
      link: novo.link,
      image_hash: h,
      ...(novo.titulo ? { name: novo.titulo } : {}),
      ...(descricao ? { description: descricao } : {}),
      ...(botao ? { call_to_action: botao } : {}),
    }));
    ld.multi_share_end_card = false;
    ld.multi_share_optimized = true;
  }

  spec.link_data = ld;
  return spec;
}

// ───────────────────────────── Subir foto ─────────────────────────────────

/** Confere pelos primeiros bytes que é mesmo JPEG ou PNG (o nome e o tipo do navegador não provam nada). */
export function tipoDeImagem(bytes: Buffer): "jpeg" | "png" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  return null;
}

/** Acha, no cadastro, o conjunto da loja e a conta Meta dele. `null` se não for da loja. */
async function contaDoConjunto(clientId: string, adsetId: string) {
  const conjunto = await acharObjetoDaLoja(clientId, "conjunto", adsetId);
  if (!conjunto) return null;
  const c = await prisma.metaAdset.findFirst({
    where: { adsetId, adAccount: { clientId } },
    select: {
      name: true, status: true, effectiveStatus: true, dailyBudgetCents: true, lifetimeBudgetCents: true, campaignId: true,
      adAccountId: true, adAccount: { select: { metaAccountId: true } },
    },
  });
  return c
    ? {
        nome: c.name, status: c.status, effectiveStatus: c.effectiveStatus, dailyBudgetCents: c.dailyBudgetCents,
        lifetimeBudgetCents: c.lifetimeBudgetCents, campaignId: c.campaignId, adAccountId: c.adAccountId, contaMeta: c.adAccount.metaAccountId,
      }
    : null;
}

// ─────────────────────────── Duplicar o conjunto ──────────────────────────
//
// Loja que trabalha "um carro por conjunto" (a Vilela): o anúncio novo não entra num conjunto que já existe —
// o conjunto escolhido serve de MOLDE (público, localização, otimização) e é duplicado pela própria Meta
// (`/copies`, só o conjunto, sem os anúncios de dentro). O conjunto novo nasce PAUSADO, ganha o nome do carro e,
// se o gestor disser, outro orçamento diário. O resto fica igual ao molde.

/** Orçamento diário aceito pra um conjunto novo (centavos): de R$ 1 a R$ 1.000 por dia, contra erro de digitação. */
export const ORCAMENTO_MINIMO_CENTS = 100;
export const ORCAMENTO_MAXIMO_CENTS = 100_000;

export type ResultadoDoConjunto =
  | { ok: true; adsetId: string; nome: string; orcamentoCents: number | null; avisos: AvisoDoConjunto[] }
  | { ok: false; erro: string };

export async function duplicarConjunto(p: {
  clientId: string;
  /** O conjunto que serve de molde. */
  adsetId: string;
  nome: string;
  /** Orçamento diário do conjunto novo (centavos). `null` = o mesmo do molde. */
  orcamentoCents: number | null;
  pedidoPor: string | null;
  quemId: string | null;
}): Promise<ResultadoDoConjunto> {
  if (!escritaLiberada()) return { ok: false, erro: "O acesso de escrita na Meta ainda não está configurado no sistema." };
  const nome = p.nome.trim().slice(0, 200);
  if (!nome) return { ok: false, erro: "Falta o nome do conjunto novo." };
  if (p.orcamentoCents !== null && (p.orcamentoCents < ORCAMENTO_MINIMO_CENTS || p.orcamentoCents > ORCAMENTO_MAXIMO_CENTS)) {
    return { ok: false, erro: "O orçamento diário precisa ficar entre R$ 1 e R$ 1.000." };
  }
  const molde = await contaDoConjunto(p.clientId, p.adsetId);
  if (!molde) return { ok: false, erro: "Esse conjunto não é de uma conta desta loja." };
  const avisos: AvisoDoConjunto[] = [];
  // Orçamento só dá pra trocar quando o molde tem orçamento DIÁRIO no próprio conjunto.
  let orcamento = p.orcamentoCents;
  if (orcamento !== null && !molde.dailyBudgetCents) {
    avisos.push({
      tipo: "orcamento",
      texto: molde.lifetimeBudgetCents
        ? "O conjunto molde usa orçamento total (não diário), então mantive o dele. Ajusta no Gerenciador se precisar."
        : "O orçamento dessa campanha fica na campanha (não no conjunto), então não mudei nada de orçamento.",
    });
    orcamento = null;
  }

  // 1. A cópia, pausada, só o conjunto.
  const copia = await escreverNaGraph<{ copied_adset_id?: string }>(`${p.adsetId}/copies`, {
    deep_copy: "false",
    status_option: "PAUSED",
    rename_options: JSON.stringify({ rename_strategy: "NO_RENAME" }),
  });
  if (!copia.ok || !copia.dados.copied_adset_id) {
    return { ok: false, erro: `A Meta não duplicou o conjunto: ${copia.ok ? "sem id" : copia.erro}` };
  }
  const novo = copia.dados.copied_adset_id;

  // 2. O nome do carro e o orçamento. Se falhar, o conjunto existe (pausado) com o nome do molde: diz isso.
  const campos: Record<string, string> = { name: nome };
  if (orcamento !== null) campos.daily_budget = String(orcamento);
  const ajuste = await escreverNaGraph(novo, campos);
  if (!ajuste.ok) {
    avisos.push({ tipo: "conjunto", texto: `O conjunto foi duplicado, mas a Meta não aceitou ${orcamento !== null ? "o nome/orçamento" : "o nome"} (${ajuste.erro}). Ele está pausado com o nome do molde: ajusta no Gerenciador.` });
  }
  const final = ajuste.ok ? orcamento ?? molde.dailyBudgetCents : molde.dailyBudgetCents;

  // 3. O cadastro local passa a conhecer o conjunto novo (é a trava de "conjunto da loja" que o anúncio usa).
  await prisma.metaAdset.upsert({
    where: { adAccountId_adsetId: { adAccountId: molde.adAccountId, adsetId: novo } },
    create: {
      adAccountId: molde.adAccountId, adsetId: novo, campaignId: molde.campaignId, name: ajuste.ok ? nome : molde.nome,
      status: "PAUSED", effectiveStatus: "PAUSED", dailyBudgetCents: final, lifetimeBudgetCents: molde.lifetimeBudgetCents,
    },
    update: { name: ajuste.ok ? nome : molde.nome, status: "PAUSED", effectiveStatus: "PAUSED", dailyBudgetCents: final },
  });
  await prisma.metaAcao.create({
    data: {
      clientId: p.clientId, quemId: p.quemId, nivel: "conjunto", objetoId: novo, nome: ajuste.ok ? nome : molde.nome,
      statusPedido: "PAUSED", statusAntes: null, ok: true, origem: "criacao-rascunho", pedidoPor: p.pedidoPor,
      pedidoTexto: `conjunto duplicado de ${molde.nome}${final ? ` · ${reais(final)}/dia` : ""} · conta ${molde.contaMeta}`.slice(0, 2000),
    },
  });
  return { ok: true, adsetId: novo, nome: ajuste.ok ? nome : molde.nome, orcamentoCents: final, avisos };
}

/**
 * Sobe UMA foto pra conta do conjunto e devolve o código dela na Meta.
 *
 * Uma por vez de propósito: cada chamada cabe no limite de corpo da hospedagem, e se a quinta foto
 * falhar, as quatro primeiras não precisam subir de novo. Foto solta na conta não anuncia nada.
 */
export async function subirFotoDoRascunho(p: {
  clientId: string;
  adsetId: string;
  nome: string;
  bytes: Buffer;
}): Promise<{ ok: true; hash: string } | { ok: false; erro: string }> {
  if (!escritaLiberada()) return { ok: false, erro: "O acesso de escrita na Meta ainda não está configurado no sistema." };
  if (p.bytes.length === 0) return { ok: false, erro: "A foto veio vazia." };
  if (p.bytes.length > MAX_BYTES_POR_FOTO) return { ok: false, erro: "A foto passou de 4 MB. Tenta uma menor." };
  if (!tipoDeImagem(p.bytes)) return { ok: false, erro: "Só aceito foto em JPEG ou PNG." };

  const conta = await contaDoConjunto(p.clientId, p.adsetId);
  if (!conta) return { ok: false, erro: "Esse conjunto não é de uma conta desta loja." };

  const r = await escreverNaGraph<{ images?: Record<string, { hash?: string }> }>(`${conta.contaMeta}/adimages`, {
    bytes: p.bytes.toString("base64"),
    name: p.nome.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "foto",
  });
  if (!r.ok) return { ok: false, erro: `A Meta não aceitou a foto ${p.nome}: ${r.erro}` };
  const hash = r.dados.images ? Object.values(r.dados.images)[0]?.hash : undefined;
  if (!hash) return { ok: false, erro: `A Meta não devolveu o código da foto ${p.nome}.` };
  return { ok: true, hash };
}

// ─────────────────────────── Criar o rascunho ─────────────────────────────

/** Lê do conjunto o que importa pra avisar: cidades da segmentação e orçamento. Falhar aqui não impede o rascunho. */
async function lerConjunto(adsetId: string) {
  const c = await buscarNaGraph<{
    daily_budget?: string;
    targeting?: { geo_locations?: { cities?: { name?: string }[]; custom_locations?: unknown[] } };
  }>(adsetId, { fields: "daily_budget,targeting{geo_locations}" });
  if (!c.ok) return null;
  const geo = c.dados.targeting?.geo_locations;
  return {
    dailyBudgetCents: c.dados.daily_budget ? Number(c.dados.daily_budget) : null,
    geo: geo
      ? { cidades: (geo.cities ?? []).map((x) => x.name ?? "").filter(Boolean), coordenadas: (geo.custom_locations ?? []).length > 0 }
      : null,
  };
}

function linkValido(link: string): boolean {
  try {
    const u = new URL(link);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Duplica o anúncio-base com as fotos e textos novos, PAUSADO, dentro do conjunto escolhido. */
export async function criarRascunhoDeAnuncio(p: PedidoDeRascunho): Promise<ResultadoDoRascunho> {
  const vazio = { avisos: [] as AvisoDoConjunto[], orcamentoSugeridoCents: null, orcamentoDoConjuntoCents: null };
  const recusa = (erro: string, extra: Partial<ResultadoDoRascunho> = {}): ResultadoDoRascunho => ({ ok: false, erro, ...vazio, ...extra });

  if (!escritaLiberada()) return recusa("O acesso de escrita na Meta ainda não está configurado no sistema.");
  if (p.hashes.length === 0) return recusa("Manda pelo menos uma foto.");
  if (p.hashes.length > MAX_FOTOS) return recusa(`O carrossel aceita no máximo ${MAX_FOTOS} fotos.`);
  if (!p.hashes.every((h) => /^[A-Za-z0-9_]{6,64}$/.test(h))) return recusa("Código de foto inválido. Sobe as fotos de novo.");
  const legenda = p.legenda.trim();
  if (!legenda) return recusa("Falta a legenda.");
  if (legenda.length > 2200) return recusa("A legenda passou de 2.200 caracteres.");
  const titulo = p.titulo === null ? null : p.titulo.trim().slice(0, 255);
  const nome = p.nome.trim();
  if (!nome) return recusa("Falta o nome do anúncio.");
  const link = p.link.trim();
  if (!linkValido(link)) return recusa("O endereço do anúncio não é um link válido (começa com https://).");

  // ── 1. O conjunto e o base são da loja? (trava de cadastro) ─────────
  const conta = await contaDoConjunto(p.clientId, p.adsetId);
  if (!conta) return recusa("Esse conjunto não é de uma conta desta loja.");

  const lido = await lerBaseDoAnuncio(p.clientId, p.baseAdId);
  if (!lido.ok) return recusa(lido.erro);
  const base = lido.base;

  const loja = await prisma.client.findUnique({
    where: { id: p.clientId },
    select: { companyName: true, city: true, gastoMensalPrevistoCents: true },
  });
  if (!loja) return recusa("Não achei a loja.");

  // ── 2. O que o conjunto tem (leitura, nada muda) ────────────────────
  const avisos: AvisoDoConjunto[] = [];
  if (conta.effectiveStatus && conta.effectiveStatus !== "ACTIVE") {
    avisos.push({
      tipo: "conjunto",
      texto: p.conjuntoNovo
        ? "O conjunto novo também nasceu pausado: na hora de publicar, ligue o conjunto e o anúncio."
        : "Esse conjunto está pausado. O anúncio só roda quando você ligar o conjunto também.",
    });
  }
  const conjunto = await lerConjunto(p.adsetId);
  const sugerido = orcamentoSugerido(loja.gastoMensalPrevistoCents);
  const orcamentoDoConjunto = conjunto?.dailyBudgetCents ?? conta.dailyBudgetCents ?? null;
  if (conjunto) avisos.push(...avisosDeLocalizacao(conjunto.geo, loja.city));
  else avisos.push({ tipo: "localizacao", texto: "Não consegui ler a localização desse conjunto agora. Confere na Meta antes de publicar." });
  const avisoOrcamento = avisoDeOrcamento(orcamentoDoConjunto, sugerido);
  // Num conjunto novo de "um carro por conjunto", o orçamento é pequeno de propósito: comparar com o da loja inteira confunde.
  if (avisoOrcamento && !p.conjuntoNovo) avisos.push(avisoOrcamento);

  // ── 3. O criativo: o do base, com o que é do carro trocado ──────────
  const formato: "foto" | "carrossel" = p.hashes.length === 1 ? "foto" : "carrossel";
  const spec = montarSpecDoRascunho(base.spec, { legenda, titulo, link, hashes: p.hashes, linkDoBase: base.link });
  const camposDoCriativo: Record<string, string> = {
    name: `${nome.slice(0, 80)} — rascunho ${new Date().toISOString().slice(0, 10)}`,
    object_story_spec: JSON.stringify(spec),
  };
  if (base.urlTags) camposDoCriativo.url_tags = base.urlTags;
  if (base.graus) camposDoCriativo.degrees_of_freedom_spec = JSON.stringify(base.graus);

  const criativo = await escreverNaGraph<{ id?: string }>(`${conta.contaMeta}/adcreatives`, camposDoCriativo);
  if (!criativo.ok || !criativo.dados.id) {
    return recusa(`A Meta não criou o criativo: ${criativo.ok ? "sem id" : criativo.erro}`, { avisos });
  }

  // ── 4. O anúncio, PAUSADO ───────────────────────────────────────────
  const camposDoAnuncio: Record<string, string> = {
    name: nome.slice(0, 200),
    adset_id: p.adsetId,
    creative: JSON.stringify({ creative_id: criativo.dados.id }),
    status: "PAUSED",
  };
  if (base.tracking) camposDoAnuncio.tracking_specs = JSON.stringify(base.tracking);
  const anuncio = await escreverNaGraph<{ id?: string }>(`${conta.contaMeta}/ads`, camposDoAnuncio);
  if (!anuncio.ok || !anuncio.dados.id) {
    return recusa(
      `O criativo foi criado, mas o anúncio não: ${anuncio.ok ? "sem id" : anuncio.erro}. O criativo ficou solto na conta e não gasta nada.`,
      { avisos },
    );
  }

  await prisma.metaAcao.create({
    data: {
      clientId: p.clientId,
      quemId: p.quemId,
      nivel: "anuncio",
      objetoId: anuncio.dados.id,
      nome: nome.slice(0, 200),
      statusPedido: "PAUSED",
      statusAntes: null,
      ok: true,
      origem: "criacao-rascunho",
      pedidoPor: p.pedidoPor,
      pedidoTexto: `${formato} · ${p.hashes.length} foto(s) · conjunto ${conta.nome} · base ${base.nome} · conta ${conta.contaMeta}`.slice(0, 2000),
    },
  });

  return {
    ok: true,
    adId: anuncio.dados.id,
    creativeId: criativo.dados.id,
    formato,
    avisos,
    orcamentoSugeridoCents: sugerido,
    orcamentoDoConjuntoCents: orcamentoDoConjunto,
    linkDoGerenciador: linkDoGerenciador(conta.contaMeta, anuncio.dados.id),
  };
}

// ─────────────────── Tudo junto: (conjunto novo +) anúncio + padrão ───────────────────

export interface PedidoCompleto extends Omit<PedidoDeRascunho, "conjuntoNovo"> {
  /** Duplicar o conjunto `adsetId` (o molde) e subir o anúncio no novo. */
  conjuntoNovo?: { nome: string; orcamentoCents: number | null; jaCriadoId?: string | null } | null;
}

export interface ResultadoCompleto extends ResultadoDoRascunho {
  /** O conjunto criado nesta tentativa, mesmo se o anúncio falhou: a próxima tentativa sobe nele (não cria outro). */
  adsetCriado?: { adsetId: string; nome: string } | null;
}

/**
 * O que a tela e o WhatsApp chamam. Duplica o conjunto (se pedido), cria o anúncio PAUSADO e guarda o "mesmo de
 * sempre" da loja (conjunto/molde, anúncio-base, se é um carro por conjunto e o orçamento).
 */
export async function subirRascunho(p: PedidoCompleto): Promise<ResultadoCompleto> {
  let adsetId = p.adsetId;
  const avisos: AvisoDoConjunto[] = [];
  let adsetCriado: { adsetId: string; nome: string } | null = null;

  // Uma tentativa anterior já criou o conjunto (e o anúncio falhou depois): sobe nele, se ainda é da loja.
  const jaCriado = p.conjuntoNovo?.jaCriadoId ? await contaDoConjunto(p.clientId, p.conjuntoNovo.jaCriadoId) : null;
  if (p.conjuntoNovo && jaCriado && p.conjuntoNovo.jaCriadoId) {
    adsetId = p.conjuntoNovo.jaCriadoId;
    adsetCriado = { adsetId, nome: jaCriado.nome };
  } else if (p.conjuntoNovo) {
    // Antes de criar qualquer coisa na Meta: o anúncio-base serve? (Senão sobraria um conjunto vazio.)
    const base = await lerBaseDoAnuncio(p.clientId, p.baseAdId);
    if (!base.ok) return { ok: false, erro: base.erro, avisos: [], orcamentoSugeridoCents: null, orcamentoDoConjuntoCents: null };
    const c = await duplicarConjunto({
      clientId: p.clientId,
      adsetId: p.adsetId,
      nome: p.conjuntoNovo.nome,
      orcamentoCents: p.conjuntoNovo.orcamentoCents,
      pedidoPor: p.pedidoPor,
      quemId: p.quemId,
    });
    if (!c.ok) return { ok: false, erro: c.erro, avisos: [], orcamentoSugeridoCents: null, orcamentoDoConjuntoCents: null };
    adsetId = c.adsetId;
    adsetCriado = { adsetId: c.adsetId, nome: c.nome };
    avisos.push(...c.avisos);
  }

  const r = await criarRascunhoDeAnuncio({ ...p, adsetId, conjuntoNovo: !!p.conjuntoNovo });
  if (!r.ok) {
    return {
      ...r,
      avisos: [...avisos, ...r.avisos],
      erro: adsetCriado ? `${r.erro} O conjunto novo "${adsetCriado.nome}" já foi criado (pausado, vazio): tentando de novo, eu subo nele.` : r.erro,
      adsetCriado,
    };
  }

  await prisma.padraoDeRascunho.upsert({
    where: { clientId: p.clientId },
    create: { clientId: p.clientId, adsetId: p.adsetId, baseAdId: p.baseAdId, duplicarConjunto: !!p.conjuntoNovo, orcamentoCents: p.conjuntoNovo?.orcamentoCents ?? null },
    update: { adsetId: p.adsetId, baseAdId: p.baseAdId, duplicarConjunto: !!p.conjuntoNovo, orcamentoCents: p.conjuntoNovo?.orcamentoCents ?? null },
  });
  return { ...r, avisos: [...avisos, ...r.avisos], adsetCriado };
}
