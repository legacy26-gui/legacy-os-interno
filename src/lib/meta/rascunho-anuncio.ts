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
  /** "Anúncios com vários anunciantes" do criativo base (a Meta liga por padrão se ninguém disser). */
  multiAnunciantes: unknown;
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
  /**
   * Em vez de criar um anúncio novo, aponta ESTE anúncio (o que veio junto na duplicação do conjunto) pro criativo
   * novo. Assim o anúncio mantém tudo do molde (configurações, rastreamento) e só troca o carro.
   */
  substituirAnuncioId?: string | null;
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
  contextual_multi_ads?: unknown;
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
    fields: "name,tracking_specs,creative{id,object_story_spec,url_tags,degrees_of_freedom_spec,asset_feed_spec,object_story_id,contextual_multi_ads}",
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
      multiAnunciantes: c.contextual_multi_ads ?? null,
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

// ─────────────────── Duplicação EXATA: nada de Advantage+ a mais ───────────────────
//
// Regra do Guilherme: "precisa duplicar exatamente igual, não dá pra ativar nada do Advantage a mais".
//
// O risco é real: criativo criado pela API pode ganhar da Meta, por padrão, os "aprimoramentos" do Advantage+
// (retoque de imagem, variações de texto, música…) e os "anúncios com vários anunciantes" — tudo que o gestor
// desligou no anúncio original. Então:
//   1. o criativo novo leva as MESMAS escolhas do base (degrees_of_freedom_spec e contextual_multi_ads);
//   2. depois de criado, o sistema RELÊ na Meta o que ela gravou e compara com o base;
//   3. se ela ligou algo a mais, cria de novo dizendo explicitamente "desligado" pra cada um;
//   4. se ainda assim vier ligado, NÃO sobe o anúncio (o criativo solto não gasta nada) e diz o que foi.
// No conjunto duplicado vale o mesmo: público (inclusive o Advantage+ público), otimização, lance, objeto promovido
// e atribuição são relidos e comparados com o molde; diferença que não dá pra corrigir = anúncio não sobe.

const NOME_DO_RECURSO: Record<string, string> = {
  standard_enhancements: "aprimoramentos padrão do Advantage+",
  image_touchups: "retoque de imagem",
  image_enhancement: "melhoria de imagem",
  image_templates: "modelos/molduras na imagem",
  image_uncrop: "expandir imagem",
  image_background_gen: "gerar fundo da imagem",
  image_brightness_and_contrast: "brilho e contraste",
  text_optimizations: "variações de texto",
  text_translation: "tradução do texto",
  inline_comment: "comentário em destaque",
  enhance_cta: "realce do botão",
  adapt_to_placement: "adaptar ao posicionamento",
  add_text_overlay: "texto sobre a imagem",
  description_automation: "descrição automática",
  site_extensions: "links do site",
  product_extensions: "produtos do catálogo",
  music: "música",
  video_auto_crop: "corte automático de vídeo",
  contextual_multi_ads: "anúncios com vários anunciantes",
};
export const nomeDoRecurso = (k: string) => NOME_DO_RECURSO[k] ?? k.replace(/_/g, " ");

function statusDosRecursos(graus: unknown, multi: unknown): Map<string, string> {
  const m = new Map<string, string>();
  const spec = objeto(objeto(graus)?.creative_features_spec);
  for (const [k, v] of Object.entries(spec ?? {})) {
    const st = objeto(v)?.enroll_status;
    if (typeof st === "string") m.set(k, st);
  }
  const cm = objeto(multi)?.enroll_status;
  if (typeof cm === "string") m.set("contextual_multi_ads", cm);
  return m;
}

/** Os recursos automáticos que estão LIGADOS no criativo novo e não estavam ligados no base. Pura. */
export function recursosAMais(base: { graus: unknown; multi: unknown }, novo: { graus: unknown; multi: unknown }): string[] {
  const b = statusDosRecursos(base.graus, base.multi);
  const n = statusDosRecursos(novo.graus, novo.multi);
  return [...n].filter(([k, st]) => st === "OPT_IN" && b.get(k) !== "OPT_IN").map(([k]) => k);
}

/** JSON com chaves e listas em ordem fixa: pra comparar o que a Meta devolve sem cair em diferença de ordem. */
export function normalizado(v: unknown): string {
  const n = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(n).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : x && typeof x === "object"
        ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, n((x as Record<string, unknown>)[k])]))
        : x;
  return JSON.stringify(n(v ?? null));
}

/** O que precisa ser igual entre o conjunto molde e a cópia (o nome e o orçamento mudam de propósito). */
export const CAMPOS_DO_CONJUNTO = [
  "targeting",
  "optimization_goal",
  "billing_event",
  "bid_strategy",
  "bid_amount",
  "promoted_object",
  "destination_type",
  "attribution_spec",
  "is_dynamic_creative",
] as const;

/** Os campos em que a cópia ficou diferente do molde. Pura. */
export function diferencasDoConjunto(molde: Record<string, unknown>, copia: Record<string, unknown>): string[] {
  return CAMPOS_DO_CONJUNTO.filter((k) => normalizado(molde[k]) !== normalizado(copia[k]));
}

const NOME_DO_CAMPO_DO_CONJUNTO: Record<string, string> = {
  targeting: "público/segmentação",
  optimization_goal: "otimização",
  billing_event: "cobrança",
  bid_strategy: "estratégia de lance",
  bid_amount: "valor do lance",
  promoted_object: "objeto promovido",
  destination_type: "destino",
  attribution_spec: "atribuição",
  is_dynamic_creative: "criativo dinâmico",
};

async function lerRecursosDoCriativo(id: string): Promise<{ graus: unknown; multi: unknown } | null> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await buscarNaGraph<{ degrees_of_freedom_spec?: unknown; contextual_multi_ads?: unknown }>(id, {
      fields: "degrees_of_freedom_spec,contextual_multi_ads",
    });
    if (r.ok) return { graus: r.dados.degrees_of_freedom_spec ?? null, multi: r.dados.contextual_multi_ads ?? null };
  }
  return null;
}

/**
 * Os recursos que a Meta DESCONTINUOU no criativo: mandar o campo faz ela recusar ("O recurso de inclusão do campo
 * de aprimoramentos padrão no criativo foi descontinuado. Defina recursos individuais."). Anúncio antigo ainda tem
 * esse campo gravado; o criativo novo vai sem ele, e a conferência abaixo pega o que a Meta ligar a mais.
 */
const RECURSOS_DESCONTINUADOS = ["standard_enhancements"];

/** As escolhas do base, sem os recursos descontinuados. Pura. */
export function grausParaEnviar(graus: unknown, desligar: string[] = []): Record<string, unknown> {
  const g = JSON.parse(JSON.stringify(objeto(graus) ?? {})) as Record<string, unknown>;
  const spec = { ...((objeto(g.creative_features_spec) ?? {}) as Record<string, unknown>) };
  for (const k of RECURSOS_DESCONTINUADOS) delete spec[k];
  for (const k of desligar) if (k !== "contextual_multi_ads" && !RECURSOS_DESCONTINUADOS.includes(k)) spec[k] = { enroll_status: "OPT_OUT" };
  if (Object.keys(spec).length > 0) g.creative_features_spec = spec;
  else delete g.creative_features_spec;
  return g;
}

/**
 * Cria o criativo com as mesmas escolhas do base e confere o que a Meta gravou. Ver o comentário acima.
 * Devolve o id, ou o motivo de não ter dado (e aí o anúncio não deve ser criado).
 */
async function criarCriativoIgualAoBase(
  contaMeta: string,
  campos: Record<string, string>,
  base: BaseLida,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const desligar: string[] = [];
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const graus = grausParaEnviar(base.graus, desligar);
    const enviar = { ...campos };
    if (Object.keys(graus).length > 0) enviar.degrees_of_freedom_spec = JSON.stringify(graus);
    // Anúncios com vários anunciantes: o do base; sem nada no base, DESLIGADO (a Meta liga se ninguém disser).
    const multiDoBase = objeto(base.multiAnunciantes);
    enviar.contextual_multi_ads = JSON.stringify(
      multiDoBase && !desligar.includes("contextual_multi_ads") ? multiDoBase : { enroll_status: "OPT_OUT" },
    );

    const criado = await escreverNaGraph<{ id?: string }>(`${contaMeta}/adcreatives`, enviar);
    if (!criado.ok || !criado.dados.id) return { ok: false, erro: `A Meta não criou o criativo: ${criado.ok ? "sem id" : criado.erro}` };

    const gravado = await lerRecursosDoCriativo(criado.dados.id);
    if (!gravado) {
      return {
        ok: false,
        erro: "Criei o criativo, mas não consegui conferir na Meta se ela ligou algum recurso automático (Advantage+). Por segurança não subi o anúncio. Tenta de novo daqui a pouco.",
      };
    }
    const aMais = recursosAMais({ graus: base.graus, multi: base.multiAnunciantes }, gravado);
    if (aMais.length === 0) return { ok: true, id: criado.dados.id };
    if (tentativa === 2) {
      return {
        ok: false,
        erro: `A Meta ligou sozinha ${aMais.map(nomeDoRecurso).join(", ")} e não aceitou desligar. Por segurança não subi o anúncio (o criativo solto não gasta nada). Sobe pelo Gerenciador e desliga esses itens lá.`,
      };
    }
    desligar.push(...aMais);
  }
  return { ok: false, erro: "Não consegui criar o criativo igual ao base." };
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
// se o gestor disser, outro orçamento diário. O resto fica igual ao molde (e é conferido campo a campo). O anúncio do
// carro novo é criado nele a partir do anúncio-base, com a mesma conferência de Advantage+ do modo normal.
//
// Não é cópia completa (com os anúncios) porque a Meta recusa copiar anúncio que tem os "aprimoramentos padrão"
// antigos do Advantage+. E assim o conjunto novo já nasce só com o anúncio do carro novo, tenha o molde quantos
// anúncios tiver. Se a Meta trouxer algum anúncio junto, ele é apagado na cópia (nunca um id do molde).

/** Orçamento diário aceito pra um conjunto novo (centavos): de R$ 1 a R$ 1.000 por dia, contra erro de digitação. */
export const ORCAMENTO_MINIMO_CENTS = 100;
export const ORCAMENTO_MAXIMO_CENTS = 100_000;

export type ResultadoDoConjunto =
  | { ok: true; adsetId: string; nome: string; orcamentoCents: number | null; avisos: AvisoDoConjunto[]; anuncioCopiadoId: string | null }
  | { ok: false; erro: string };

export interface AnuncioNaMeta {
  id: string;
  nome: string;
  criativoId: string | null;
}

/** Os anúncios de um conjunto na Meta (null se a Meta não respondeu). Anúncio já apagado não volta. */
export async function anunciosDoConjuntoNaMeta(adsetId: string): Promise<AnuncioNaMeta[] | null> {
  const r = await buscarNaGraph<{ data?: { id?: string; name?: string; creative?: { id?: string } }[] }>(`${adsetId}/ads`, {
    fields: "id,name,creative{id}",
    limit: "50",
  });
  if (!r.ok) return null;
  return (r.dados.data ?? [])
    .filter((a): a is { id: string; name?: string; creative?: { id?: string } } => !!a.id)
    .map((a) => ({ id: a.id, nome: a.name ?? "", criativoId: a.creative?.id ?? null }));
}

/**
 * Na cópia do conjunto, qual anúncio é a cópia do anúncio-base. A Meta copia sem renomear (NO_RENAME), então vale o
 * nome; se o nome se repete, desempata pelo criativo. Se a cópia tem um anúncio só, é ele. `null` = não dá pra saber.
 */
export function copiaDoBase(copia: AnuncioNaMeta[], base: AnuncioNaMeta | null): AnuncioNaMeta | null {
  if (copia.length === 1) return copia[0];
  if (!base) return null;
  const peloNome = copia.filter((a) => a.nome === base.nome);
  if (peloNome.length === 1) return peloNome[0];
  const pool = peloNome.length ? peloNome : copia;
  const peloCriativo = base.criativoId ? pool.filter((a) => a.criativoId === base.criativoId) : [];
  return peloCriativo.length === 1 ? peloCriativo[0] : null;
}

/**
 * Apaga, NA CÓPIA, os anúncios que não são o do anúncio-base. Trava: só apaga id que a Meta listou dentro da cópia
 * E que não é id de nenhum anúncio do molde (o conjunto original nunca é mexido). Falha de exclusão não bloqueia:
 * vira aviso (os anúncios ficam pausados, não gastam).
 */
async function apagarSobrasDaCopia(p: {
  clientId: string;
  copiaId: string;
  manter: string;
  anunciosDaCopia: AnuncioNaMeta[];
  idsDoMolde: Set<string>;
  pedidoPor: string | null;
  quemId: string | null;
}): Promise<{ apagados: number; falhas: string[] }> {
  let apagados = 0;
  const falhas: string[] = [];
  for (const a of p.anunciosDaCopia) {
    if (a.id === p.manter || p.idsDoMolde.has(a.id) || a.id === p.copiaId) continue;
    const r = await escreverNaGraph(a.id, { status: "DELETED" });
    if (r.ok) apagados++;
    else falhas.push(a.nome || a.id);
    await prisma.metaAcao.create({
      data: {
        clientId: p.clientId, quemId: p.quemId, nivel: "anuncio", objetoId: a.id, nome: a.nome || a.id,
        statusPedido: "DELETED", statusAntes: "PAUSED", ok: r.ok, origem: "criacao-rascunho", pedidoPor: p.pedidoPor,
        pedidoTexto: `anúncio a mais na cópia do conjunto ${p.copiaId} (só fica o do anúncio-base)${r.ok ? "" : ` · erro: ${r.erro}`}`.slice(0, 2000),
      },
    });
  }
  return { apagados, falhas };
}

export async function duplicarConjunto(p: {
  clientId: string;
  /** O conjunto que serve de molde. Só o conjunto é copiado; os anúncios dele não vão junto. */
  adsetId: string;
  /** O anúncio-base (de onde o anúncio do carro novo herda página, botão e rastreamento). */
  baseAdId: string;
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
  // O anúncio-base tem que estar dentro do molde: a cópia dele é o que vira o anúncio do carro novo.
  const anunciosDoMolde = await anunciosDoConjuntoNaMeta(p.adsetId);
  if (!anunciosDoMolde) return { ok: false, erro: "A Meta não me deixou ler os anúncios desse conjunto. Tenta de novo daqui a pouco." };
  const idsDoMolde = new Set(anunciosDoMolde.map((a) => a.id));
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

  // 1. A cópia do CONJUNTO, pausada, sem os anúncios de dentro. (A cópia completa a Meta recusa quando o anúncio do
  // molde tem os "aprimoramentos padrão" antigos do Advantage+: "foi descontinuado. Defina recursos individuais".)
  // O anúncio do carro novo é criado no conjunto novo a partir do anúncio-base, igual ao modo normal.
  const copia = await escreverNaGraph<{ copied_adset_id?: string }>(`${p.adsetId}/copies`, {
    deep_copy: "false",
    status_option: "PAUSED",
    rename_options: JSON.stringify({ rename_strategy: "NO_RENAME" }),
  });
  let novo: string;
  let ajuste: { ok: true } | { ok: false; erro: string };
  const ignorarNaConferencia: string[] = [];
  const janelas = copia.ok ? null : janelasCompativeis(copia.erro);
  if (copia.ok && copia.dados.copied_adset_id) {
    novo = copia.dados.copied_adset_id;
    // 2. O nome do carro e o orçamento. Se falhar, o conjunto existe (pausado) com o nome do molde: diz isso.
    const campos: Record<string, string> = { name: nome };
    if (orcamento !== null) campos.daily_budget = String(orcamento);
    ajuste = await escreverNaGraph(novo, campos);
  } else if (janelas) {
    // A Meta não copia o molde porque a janela de atribuição dele não vale mais pro objetivo ("use uma destas
    // janelas compatíveis: 1 dia"). A cópia não deixa trocar campo nenhum, então o conjunto é CRIADO com os campos
    // lidos do molde, só com a janela trocada pela que a Meta aceita. A conferência abaixo prova que o resto é igual.
    const criado = await criarConjuntoComoOMolde({ moldeId: p.adsetId, contaMeta: molde.contaMeta, nome, orcamentoCents: orcamento, janelas });
    if (!criado.ok) return { ok: false, erro: `A Meta não duplicou o conjunto: ${copia.ok ? "" : copia.erro} ${criado.erro}` };
    novo = criado.id;
    ajuste = { ok: true };
    ignorarNaConferencia.push("attribution_spec");
    avisos.push({ tipo: "conjunto", texto: criado.aviso });
  } else {
    return { ok: false, erro: `A Meta não duplicou o conjunto: ${copia.ok ? "sem id" : copia.erro}` };
  }
  if (!ajuste.ok) {
    avisos.push({ tipo: "conjunto", texto: `O conjunto foi duplicado, mas a Meta não aceitou ${orcamento !== null ? "o nome/orçamento" : "o nome"} (${ajuste.erro}). Ele está pausado com o nome do molde: ajusta no Gerenciador.` });
  }
  const final = ajuste.ok ? orcamento ?? molde.dailyBudgetCents : molde.dailyBudgetCents;

  // 2b. A cópia ficou IGUAL ao molde? (público, Advantage+ público, otimização, lance…) Corrige o que der; o que não
  // der, o anúncio não sobe.
  const conferencia = await conferirCopiaDoConjunto(p.adsetId, novo, ignorarNaConferencia);

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
  if (!conferencia.ok) {
    return {
      ok: false,
      erro: `${conferencia.erro} O conjunto "${ajuste.ok ? nome : molde.nome}" ficou criado, pausado: apaga no Gerenciador. Não subi o anúncio.`,
    };
  }

  // 2c. A cópia é SÓ do conjunto: o anúncio do carro novo é criado nele depois. Se por acaso a Meta trouxe anúncio
  // junto, ele é apagado aqui, na cópia (nunca um id do molde), pra o conjunto novo ter só o do carro novo.
  const nomeFinal = ajuste.ok ? nome : molde.nome;
  const anunciosDaCopia = await anunciosDoConjuntoNaMeta(novo);
  if (!anunciosDaCopia) {
    return { ok: false, erro: `O conjunto foi duplicado, mas não consegui ler os anúncios dele. Não subi o anúncio: apaga o conjunto "${nomeFinal}" no Gerenciador.` };
  }
  if (anunciosDaCopia.length > 0) {
    const { falhas } = await apagarSobrasDaCopia({
      clientId: p.clientId, copiaId: novo, manter: "", anunciosDaCopia, idsDoMolde, pedidoPor: p.pedidoPor, quemId: p.quemId,
    });
    if (falhas.length) {
      avisos.push({ tipo: "conjunto", texto: `Vieram anúncios do molde junto na cópia e a Meta não deixou apagar (${falhas.join(", ").slice(0, 200)}): estão pausados no conjunto novo, apaga no Gerenciador.` });
    }
  }
  if (anunciosDoMolde.length > 1) {
    avisos.push({
      tipo: "conjunto",
      texto: `O conjunto molde tem ${anunciosDoMolde.length} anúncios: o conjunto novo ficou só com o do carro novo. O conjunto original não foi mexido.`,
    });
  }
  return { ok: true, adsetId: novo, nome: nomeFinal, orcamentoCents: final, avisos, anuncioCopiadoId: null };
}

// ─────────── Quando a Meta não copia: criar o conjunto com os campos do molde ───────────

/**
 * As janelas de atribuição que a Meta diz aceitar, lidas do erro ("use uma destas janelas compatíveis: 1 dias",
 * "use one of these compatible windows: 1, 7 days"). `null` = o erro não é de atribuição. Pura.
 */
export function janelasCompativeis(erro: string): number[] | null {
  if (!/atribui|attribution/i.test(erro)) return null;
  const m = erro.match(/(?:compat[ií]veis|compatible(?: windows?)?)\s*:?\s*([\d\s,e]+(?:and\s*\d+)?)/i);
  if (!m) return [];
  return [...new Set([...m[1].matchAll(/\d+/g)].map((x) => Number(x[0])).filter((n) => n > 0 && n <= 90))].sort((a, b) => a - b);
}

/**
 * A atribuição do molde com a janela de CLIQUE trocada pela compatível mais próxima (a maior que não passa da
 * dele). Visualização e o resto ficam. `null` = não dá pra montar (aí vai sem, e a Meta usa a padrão). Pura.
 */
export function atribuicaoCompativel(spec: unknown, janelas: number[]): Record<string, unknown>[] | null {
  if (!Array.isArray(spec) || janelas.length === 0) return null;
  return spec.map((e) => {
    const o = objeto(e) ?? {};
    if (o.event_type !== "CLICK_THROUGH") return o;
    const dias = Number(o.window_days) || janelas[0];
    const cabe = janelas.filter((j) => j <= dias);
    return { ...o, window_days: cabe.length ? cabe[cabe.length - 1] : janelas[0] };
  });
}

const dizerAtribuicao = (spec: unknown): string => {
  if (!Array.isArray(spec) || spec.length === 0) return "a padrão da Meta";
  const nome: Record<string, string> = { CLICK_THROUGH: "clique", VIEW_THROUGH: "visualização", ENGAGED_VIDEO_VIEW: "visualização engajada" };
  return spec
    .map((e) => objeto(e) ?? {})
    .map((o) => `${o.window_days} ${Number(o.window_days) === 1 ? "dia" : "dias"} após ${nome[String(o.event_type)] ?? String(o.event_type).toLowerCase()}`)
    .join(" + ");
};

/** Os campos do molde que entram no conjunto criado (além do que é conferido: CAMPOS_DO_CONJUNTO). */
const CAMPOS_EXTRAS_DO_MOLDE = ["campaign_id", "daily_budget", "lifetime_budget", "end_time", "pacing_type", "frequency_control_specs", "dsa_beneficiary", "dsa_payor"];

/**
 * Cria, PAUSADO, um conjunto com os campos lidos do molde: público (com o Advantage+ público do jeito que está),
 * otimização, cobrança, lance, objeto promovido, destino. Só a janela de atribuição muda, pra a que a Meta aceita.
 */
async function criarConjuntoComoOMolde(p: {
  moldeId: string;
  contaMeta: string;
  nome: string;
  orcamentoCents: number | null;
  janelas: number[];
}): Promise<{ ok: true; id: string; aviso: string } | { ok: false; erro: string }> {
  const lido = await buscarNaGraph<Record<string, unknown>>(p.moldeId, { fields: [...CAMPOS_DO_CONJUNTO, ...CAMPOS_EXTRAS_DO_MOLDE].join(",") });
  if (!lido.ok) return { ok: false, erro: "E não consegui ler o molde pra criar um igual." };
  const m = lido.dados;
  const base: Record<string, string> = { name: p.nome.slice(0, 200), status: "PAUSED" };
  for (const k of [...CAMPOS_DO_CONJUNTO, ...CAMPOS_EXTRAS_DO_MOLDE]) {
    if (k === "attribution_spec" || k === "end_time") continue;
    const v = m[k];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    base[k] = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
  }
  if (m.lifetime_budget && m.end_time) base.end_time = String(m.end_time);
  if (p.orcamentoCents !== null && base.daily_budget) base.daily_budget = String(p.orcamentoCents);

  const ajustada = atribuicaoCompativel(m.attribution_spec, p.janelas);
  const tentativas: (Record<string, unknown>[] | null)[] = ajustada ? [ajustada, null] : [null];
  let ultimoErro = "";
  for (const atrib of tentativas) {
    const campos = { ...base };
    if (atrib) campos.attribution_spec = JSON.stringify(atrib);
    const r = await escreverNaGraph<{ id?: string }>(`${p.contaMeta}/adsets`, campos);
    if (r.ok && r.dados.id) {
      return {
        ok: true,
        id: r.dados.id,
        aviso:
          `A Meta não aceita mais a janela de atribuição do molde (${dizerAtribuicao(m.attribution_spec)}) pra esse objetivo, e por isso não deixou copiar. ` +
          `Criei o conjunto com tudo igual ao molde, só com a janela que ela aceita: ${atrib ? dizerAtribuicao(atrib) : "a padrão da Meta"}.`,
      };
    }
    ultimoErro = r.ok ? "sem id" : r.erro;
  }
  return { ok: false, erro: `Tentei criar um conjunto igual ao molde com a janela aceita, e ela recusou: ${ultimoErro}` };
}

/** Lê molde e cópia na Meta e compara os campos que precisam ser iguais; tenta corrigir uma vez. */
async function conferirCopiaDoConjunto(moldeId: string, copiaId: string, ignorar: string[] = []): Promise<{ ok: true } | { ok: false; erro: string }> {
  const ler = (id: string) => buscarNaGraph<Record<string, unknown>>(id, { fields: CAMPOS_DO_CONJUNTO.join(",") });
  const m = await ler(moldeId);
  let c = await ler(copiaId);
  if (!m.ok || !c.ok) {
    return { ok: false, erro: "A Meta não me deixou conferir se o conjunto duplicado ficou igual ao molde." };
  }
  const difs = (a: Record<string, unknown>, b: Record<string, unknown>) => diferencasDoConjunto(a, b).filter((k) => !ignorar.includes(k));
  let dif = difs(m.dados, c.dados);
  if (dif.length === 0) return { ok: true };

  // Corrige escrevendo na cópia o valor do molde, campo por campo.
  const campos: Record<string, string> = {};
  for (const k of dif) {
    const v = m.dados[k];
    if (v === undefined || v === null) continue;
    campos[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  if (Object.keys(campos).length > 0) await escreverNaGraph(copiaId, campos);
  c = await ler(copiaId);
  dif = c.ok ? difs(m.dados, c.dados) : dif;
  if (dif.length === 0) return { ok: true };
  return {
    ok: false,
    erro: `A Meta duplicou o conjunto mas mudou ${dif.map((k) => NOME_DO_CAMPO_DO_CONJUNTO[k] ?? k).join(", ")} em relação ao molde, e não aceitou voltar.`,
  };
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

  // Igual ao base, sem nenhum recurso automático a mais (ver criarCriativoIgualAoBase).
  const feito = await criarCriativoIgualAoBase(conta.contaMeta, camposDoCriativo, base);
  if (!feito.ok) return recusa(feito.erro, { avisos });
  const criativo = { dados: { id: feito.id } };

  // ── 4. O anúncio, PAUSADO ───────────────────────────────────────────
  let anuncioId: string;
  if (p.substituirAnuncioId) {
    // Conjunto duplicado: o anúncio copiado recebe o criativo novo (configurações do molde preservadas).
    const troca = await escreverNaGraph(p.substituirAnuncioId, {
      name: nome.slice(0, 200),
      creative: JSON.stringify({ creative_id: criativo.dados.id }),
      status: "PAUSED",
    });
    if (!troca.ok) {
      return recusa(
        `O criativo foi criado, mas a Meta não aceitou trocar o anúncio copiado: ${troca.erro}. O criativo ficou solto na conta e não gasta nada.`,
        { avisos },
      );
    }
    anuncioId = p.substituirAnuncioId;
  } else {
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
    anuncioId = anuncio.dados.id;
  }

  await prisma.metaAcao.create({
    data: {
      clientId: p.clientId,
      quemId: p.quemId,
      nivel: "anuncio",
      objetoId: anuncioId,
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
    adId: anuncioId,
    creativeId: criativo.dados.id,
    formato,
    avisos,
    orcamentoSugeridoCents: sugerido,
    orcamentoDoConjuntoCents: orcamentoDoConjunto,
    linkDoGerenciador: linkDoGerenciador(conta.contaMeta, anuncioId),
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
  let substituirAnuncioId: string | null = null;
  const semAvisos = { avisos: [], orcamentoSugeridoCents: null, orcamentoDoConjuntoCents: null };

  if (p.conjuntoNovo) {
    // Antes de criar qualquer coisa na Meta: o anúncio-base serve? (Senão sobraria um conjunto sem anúncio útil.)
    const base = await lerBaseDoAnuncio(p.clientId, p.baseAdId);
    if (!base.ok) return { ok: false, erro: base.erro, ...semAvisos };

    const jaCriadoId = p.conjuntoNovo.jaCriadoId ?? null;
    const jaCriado = jaCriadoId ? await contaDoConjunto(p.clientId, jaCriadoId) : null;
    if (jaCriadoId && jaCriado) {
      // Uma tentativa anterior já criou o conjunto (e o anúncio falhou depois): reaproveita o conjunto e o anúncio que veio nele.
      const [daCopia, doMolde] = await Promise.all([anunciosDoConjuntoNaMeta(jaCriadoId), anunciosDoConjuntoNaMeta(p.adsetId)]);
      const idsDoMolde = new Set((doMolde ?? []).map((a) => a.id));
      // Conjunto vazio (cópia só do conjunto): o anúncio é criado nele. Com anúncio dentro (cópia completa, de antes):
      // fica a cópia do base, trocada pelo carro novo.
      const manter = daCopia && doMolde && daCopia.length > 0 ? copiaDoBase(daCopia, doMolde.find((a) => a.id === p.baseAdId) ?? null) : null;
      if (!daCopia || !doMolde || idsDoMolde.has(jaCriadoId) || (daCopia.length > 0 && (!manter || idsDoMolde.has(manter.id)))) {
        return { ok: false, erro: `O conjunto "${jaCriado.nome}" da tentativa anterior não está com o anúncio esperado. Apaga ele no Gerenciador e tenta de novo.`, ...semAvisos };
      }
      if (manter && daCopia.length > 1) {
        const { falhas } = await apagarSobrasDaCopia({
          clientId: p.clientId, copiaId: jaCriadoId, manter: manter.id, anunciosDaCopia: daCopia, idsDoMolde, pedidoPor: p.pedidoPor, quemId: p.quemId,
        });
        if (falhas.length) avisos.push({ tipo: "conjunto", texto: `Ficaram anúncios a mais pausados no conjunto novo (${falhas.join(", ").slice(0, 200)}): apaga no Gerenciador.` });
      }
      adsetId = jaCriadoId;
      adsetCriado = { adsetId, nome: jaCriado.nome };
      substituirAnuncioId = manter?.id ?? null;
    } else {
      const c = await duplicarConjunto({
        clientId: p.clientId,
        adsetId: p.adsetId,
        baseAdId: p.baseAdId,
        nome: p.conjuntoNovo.nome,
        orcamentoCents: p.conjuntoNovo.orcamentoCents,
        pedidoPor: p.pedidoPor,
        quemId: p.quemId,
      });
      if (!c.ok) return { ok: false, erro: c.erro, ...semAvisos };
      adsetId = c.adsetId;
      adsetCriado = { adsetId: c.adsetId, nome: c.nome };
      substituirAnuncioId = c.anuncioCopiadoId;
      avisos.push(...c.avisos);
    }
  }

  const r = await criarRascunhoDeAnuncio({
    ...p,
    adsetId,
    conjuntoNovo: !!p.conjuntoNovo,
    substituirAnuncioId,
  });
  if (!r.ok) {
    return {
      ...r,
      avisos: [...avisos, ...r.avisos],
      erro: adsetCriado ? `${r.erro} O conjunto novo "${adsetCriado.nome}" já foi criado (pausado): tentando de novo, eu subo nele.` : r.erro,
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
