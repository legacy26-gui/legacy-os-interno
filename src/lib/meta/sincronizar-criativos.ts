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

interface AnuncioCru {
  id?: string;
  name?: string;
  status?: string;
  creative?: { thumbnail_url?: string };
  preview_shareable_link?: string;
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

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const resposta = await buscarNaGraph<RespostaAnuncios>(`${conta.metaAccountId}/ads`, {
      // creative{...} traz a miniatura sem uma segunda chamada por anúncio.
      fields: "id,name,status,creative{thumbnail_url},preview_shareable_link",
      limit: String(POR_PAGINA),
      ...(depois ? { after: depois } : {}),
    });

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
          data: anuncios.slice(i, i + 200).map((a) => ({
            adAccountId: conta.id,
            adId: a.id!,
            adName: a.name ?? a.id!,
            status: a.status ?? null,
            thumbnailUrl: a.creative?.thumbnail_url ?? null,
            previewUrl: a.preview_shareable_link ?? null,
          })),
        });
      }
    },
    { timeout: 20_000, maxWait: 10_000 }
  );

  return { ok: true, anuncios: anuncios.length };
}
