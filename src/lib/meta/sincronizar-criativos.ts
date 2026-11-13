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
  /** O formato novo: o texto mora aqui dentro. */
  object_story_spec?: {
    link_data?: { message?: string; name?: string; description?: string };
    video_data?: { message?: string; title?: string; link_description?: string };
  };
}

interface AnuncioCru {
  id?: string;
  name?: string;
  status?: string;
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
  "id,name,status,preview_shareable_link,creative{id,thumbnail_url,body,title," +
  "effective_object_story_id,object_story_id," +
  "object_story_spec{link_data{message,name,description},video_data{message,title,link_description}}}";

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
const CAMPOS_MINIMOS = "id,name,status,creative{thumbnail_url},preview_shareable_link";

/** Tira o texto de onde ele estiver neste criativo. */
function textoDoCriativo(c: CriativoCru | undefined) {
  const link = c?.object_story_spec?.link_data;
  const video = c?.object_story_spec?.video_data;
  return {
    legenda: link?.message ?? video?.message ?? c?.body ?? null,
    titulo: link?.name ?? video?.title ?? c?.title ?? null,
    descricao: link?.description ?? video?.link_description ?? null,
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

  // Começa pedindo tudo; se a Meta recusar, desce pro mínimo e segue.
  let campos = CAMPOS_RICOS;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    let resposta = await buscarNaGraph<RespostaAnuncios>(`${conta.metaAccountId}/ads`, {
      // creative{...} traz tudo sem uma segunda chamada por anúncio.
      fields: campos,
      limit: String(POR_PAGINA),
      ...(depois ? { after: depois } : {}),
    });

    if (!resposta.ok && campos === CAMPOS_RICOS) {
      console.warn(
        "[meta] a Graph recusou os campos ricos do criativo; seguindo sem o texto:",
        resposta.erro
      );
      campos = CAMPOS_MINIMOS;
      resposta = await buscarNaGraph<RespostaAnuncios>(`${conta.metaAccountId}/ads`, {
        fields: campos,
        limit: String(POR_PAGINA),
        ...(depois ? { after: depois } : {}),
      });
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
    { timeout: 20_000, maxWait: 10_000 }
  );

  return { ok: true, anuncios: anuncios.length };
}
