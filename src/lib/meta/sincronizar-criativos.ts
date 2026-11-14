import "server-only";

import { prisma } from "@/lib/prisma";
import { buscarNaGraph } from "./cliente-graph";

// A arte de cada anúncio: miniatura e link de pré-visualização.
//
// Uma chamada só por conta, listando os anúncios. Barato porque não é
// insight: não tem período, não tem soma, é só o cadastro.
//
// ── O que NÃO se guarda aqui ──────────────────────────────────────────────
//
// A imagem. Só o endereço dela na CDN da Meta. Baixar e guardar a imagem
// seria passar a hospedar arte de cliente — espaço, custo e uma cópia que
// envelhece sozinha quando alguém troca o criativo lá.
//
// O preço disso é que o endereço expira. A tela trata: miniatura que não
// carrega vira um quadrinho neutro, e o link de pré-visualização continua
// funcionando.

/** Quantos anúncios por página. */
const POR_PAGINA = 200;

/** Teto de páginas: conta grande tem centenas de anúncios, não milhares. */
const MAX_PAGINAS = 15;

interface CriativoCru {
  id?: string;
  thumbnail_url?: string;
  /** Os campos planos. Existem em criativo antigo e em alguns formatos. */
  body?: string;
  title?: string;
  /** O post onde moram curtidas e comentários. */
  effective_object_story_id?: string;
  object_story_id?: string;
  /** O formato de uma variação só: o texto mora aqui dentro. */
  object_story_spec?: {
    link_data?: { message?: string; name?: string; description?: string };
    video_data?: {
      message?: string;
      title?: string;
      link_description?: string;
    };
  };
  /**
   * O formato dos anúncios Advantage+ e dinâmicos: listas de variações que a
   * Meta combina sozinha. Guarda-se a primeira de cada, que é a que a Meta
   * mostra como principal no Gerenciador.
   */
  asset_feed_spec?: {
    bodies?: { text?: string }[];
    titles?: { text?: string }[];
    descriptions?: { text?: string }[];
  };
}

interface AnuncioCru {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  adset_id?: string;
  campaign_id?: string;
  creative?: CriativoCru;
  preview_shareable_link?: string;
}

/**
 * Os campos que a gente quer do criativo.
 *
 * `object_story_spec` é onde mora o texto dos anúncios de hoje; `body` e
 * `title` são os campos planos, que ainda aparecem em criativo antigo. Pedir
 * os dois é o que faz a legenda aparecer independente de como o anúncio foi
 * criado.
 */
const CAMPOS_RICOS =
  // ── Os três campos do próprio anúncio que faltavam ──────────────────
  //
  // `effective_status` é o estado DE VERDADE, já contando a campanha e o
  // conjunto acima: sem ele a coluna Veiculação só tinha o status próprio do
  // anúncio, e um anúncio ligado dentro de um conjunto parado aparecia como
  // "Ativo" sem estar entregando nada.
  //
  // `adset_id` e `campaign_id` são a ligação do anúncio com o que está acima
  // dele. Sem eles o cadastro de anúncios ficava solto: clicar numa campanha
  // pra ver os anúncios dela não trazia nada, e a contagem da linha dizia
  // "0 anúncios" numa campanha com doze.
  "id,name,status,effective_status,adset_id,campaign_id,preview_shareable_link," +
  "creative{id,thumbnail_url,body,title," +
  "effective_object_story_id,object_story_id," +
  "object_story_spec{link_data{message,name,description},video_data{message,title,link_description}}," +
  // ── Onde o texto mora nos anúncios de hoje ──────────────────────────
  //
  // `object_story_spec` é o formato de um criativo com uma variação só. Os
  // anúncios Advantage+ / dinâmicos guardam o texto em `asset_feed_spec`,
  // em listas: várias legendas e vários títulos que a Meta combina sozinha.
  //
  // Como o código só lia o primeiro formato, esses anúncios chegavam aqui
  // sem legenda nenhuma — e a tela de editar abria em branco, como se o
  // anúncio não dissesse nada.
  "asset_feed_spec{bodies,titles,descriptions}}";

/**
 * O conjunto mínimo, usado quando a Meta recusa o rico.
 *
 * Existe porque esta varredura roda de quinze em quinze minutos em
 * produção. No dia em que a Meta renomear ou restringir um subcampo, o
 * pedido inteiro passa a falhar — e aí não seria só a legenda que sumiria:
 * as miniaturas e o cadastro de anúncios parariam de atualizar junto.
 *
 * Com a volta atrás, o pior caso é perder o texto e manter o resto
 * funcionando, que é muito melhor do que o contrário.
 */
/**
 * O degrau do meio: tudo menos o `asset_feed_spec`.
 *
 * Existe pra que a recusa do pedaço mais novo não leve junto o texto dos
 * anúncios que usam o formato antigo — que são a maioria.
 */
const CAMPOS_SEM_FEED =
  "id,name,status,effective_status,adset_id,campaign_id,preview_shareable_link," +
  "creative{id,thumbnail_url,body,title," +
  "effective_object_story_id,object_story_id," +
  "object_story_spec{link_data{message,name,description},video_data{message,title,link_description}}}";

const CAMPOS_MINIMOS =
  // Os campos planos do anúncio entram no mínimo também: são baratos, não
  // são subcampo de nada, e são justamente o que faz a tela saber se o
  // anúncio está entregando e a que campanha ele pertence. O que a volta
  // atrás abre mão é do TEXTO, que mora dentro de `creative{}`.
  "id,name,status,effective_status,adset_id,campaign_id," +
  "creative{thumbnail_url},preview_shareable_link";

/** A primeira variação da lista, que é a que a Meta trata como principal. */
function primeira(lista: { text?: string }[] | undefined): string | null {
  const t = lista?.find((x) => (x.text ?? "").trim() !== "")?.text;
  return t?.trim() || null;
}

/**
 * Tira o texto de onde ele estiver neste criativo.
 *
 * São TRÊS formatos, e um anúncio usa um deles:
 *
 *   object_story_spec  — uma variação só, link ou vídeo. O mais comum ainda.
 *   asset_feed_spec    — Advantage+ e dinâmicos: listas de legendas e
 *                        títulos que a Meta combina. Era o que faltava, e é
 *                        por isso que alguns anúncios chegavam sem texto.
 *   body / title       — campos planos, de criativo antigo.
 *
 * A ordem importa: o story spec primeiro porque quando ele existe é o texto
 * exato que foi publicado; a lista do asset feed tem várias opções e aqui se
 * guarda a primeira.
 */
function textoDoCriativo(c: CriativoCru | undefined) {
  const link = c?.object_story_spec?.link_data;
  const video = c?.object_story_spec?.video_data;
  const feed = c?.asset_feed_spec;
  return {
    legenda:
      link?.message ??
      video?.message ??
      primeira(feed?.bodies) ??
      c?.body ??
      null,
    titulo:
      link?.name ?? video?.title ?? primeira(feed?.titles) ?? c?.title ?? null,
    descricao:
      link?.description ??
      video?.link_description ??
      primeira(feed?.descriptions) ??
      null,
    postId: c?.effective_object_story_id ?? c?.object_story_id ?? null,
  };
}

interface RespostaAnuncios {
  data?: AnuncioCru[];
  paging?: { cursors?: { after?: string }; next?: string };
}

export type ResultadoDosCriativos =
  | { ok: true; anuncios: number }
  | { ok: false; erro: string };

/**
 * Busca os anúncios de uma conta e guarda a arte de cada um.
 *
 * Não escreve `lastSyncError` quando falha, de propósito: aquele campo é a
 * saúde da leitura de NÚMEROS, que é o que para a loja. Criativo é enfeite
 * útil — não ter a miniatura não pode pintar a linha da loja de amarelo como
 * se o gasto estivesse desatualizado.
 */
export async function sincronizarCriativos(conta: {
  id: string;
  metaAccountId: string;
}): Promise<ResultadoDosCriativos> {
  const todos: AnuncioCru[] = [];
  let depois: string | undefined;

  // ── A escada de volta atrás ────────────────────────────────────────────
  //
  // Antes eram dois degraus: tudo, ou o mínimo sem texto nenhum. Um subcampo
  // recusado — e basta a Meta mudar o nome de um — jogava fora a legenda de
  // TODOS os anúncios da conta, calado, com um aviso que só aparece no log
  // do servidor.
  //
  // Agora tem um degrau no meio, sem o `asset_feed_spec`, que é o pedaço mais
  // novo e o candidato mais provável a ser recusado. Assim, a recusa dele
  // custa o texto só dos anúncios Advantage+, e não o de todo mundo.
  const ESCADA = [CAMPOS_RICOS, CAMPOS_SEM_FEED, CAMPOS_MINIMOS];
  let degrau = 0;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    let resposta = await buscarNaGraph<RespostaAnuncios>(
      `${conta.metaAccountId}/ads`,
      {
        // creative{...} traz tudo sem uma segunda chamada por anúncio.
        fields: ESCADA[degrau],
        limit: String(POR_PAGINA),
        ...(depois ? { after: depois } : {}),
      },
    );

    while (!resposta.ok && degrau < ESCADA.length - 1) {
      degrau++;
      console.warn(
        `[meta] a Graph recusou os campos do criativo; descendo pro degrau ${degrau}:`,
        resposta.erro,
      );
      resposta = await buscarNaGraph<RespostaAnuncios>(
        `${conta.metaAccountId}/ads`,
        {
          fields: ESCADA[degrau],
          limit: String(POR_PAGINA),
          ...(depois ? { after: depois } : {}),
        },
      );
    }

    if (!resposta.ok) return { ok: false, erro: resposta.erro };

    const lote = resposta.dados.data ?? [];
    todos.push(...lote);
    depois = resposta.dados.paging?.cursors?.after;
    if (!resposta.dados.paging?.next || lote.length === 0) break;
  }

  const porId = new Map<string, AnuncioCru>();
  for (const a of todos) if (a.id) porId.set(a.id, a);
  const anuncios = [...porId.values()];

  await prisma.$transaction(
    async (tx) => {
      // Apaga e regrava: anúncio que sumiu da Meta não tem arte pra mostrar.
      await tx.metaAdCreative.deleteMany({ where: { adAccountId: conta.id } });
      for (let i = 0; i < anuncios.length; i += 200) {
        await tx.metaAdCreative.createMany({
          data: anuncios.slice(i, i + 200).map((a) => {
            const t = textoDoCriativo(a.creative);
            return {
              adAccountId: conta.id,
              adId: a.id!,
              adName: a.name ?? a.id!,
              status: a.status ?? null,
              effectiveStatus: a.effective_status ?? null,
              adsetId: a.adset_id ?? null,
              campaignId: a.campaign_id ?? null,
              thumbnailUrl: a.creative?.thumbnail_url ?? null,
              previewUrl: a.preview_shareable_link ?? null,
              creativeId: a.creative?.id ?? null,
              legenda: t.legenda,
              titulo: t.titulo,
              descricao: t.descricao,
              postId: t.postId,
            };
          }),
        });
      }
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  return { ok: true, anuncios: anuncios.length };
}
