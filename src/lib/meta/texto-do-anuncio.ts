import "server-only";

import { prisma } from "@/lib/prisma";
import { buscarNaGraph } from "./cliente-graph";

// Ler o texto de um anúncio, e medir o que uma edição custaria.
//
// ── Por que isto é um arquivo separado de quem escreve ───────────────────
//
// Pela mesma razão que a leitura e a escrita da Graph são separadas: aqui só
// se lê, e com o token de leitura. A tela de edição abre, mostra o texto e
// mostra o aviso ANTES de qualquer botão ser apertado — e nada disso pode
// chegar perto do token que troca criativo.

/** Os três campos de texto que dá pra mexer. */
export const CAMPOS_DE_TEXTO = ["legenda", "titulo", "descricao"] as const;
export type CampoDeTexto = (typeof CAMPOS_DE_TEXTO)[number];

export const NOME_DO_CAMPO: Record<CampoDeTexto, string> = {
  legenda: "Legenda",
  titulo: "Título",
  descricao: "Descrição",
};

/**
 * Tetos de tamanho.
 *
 * Não são os limites da Meta — ela tem os dela, que mudam por formato e por
 * posicionamento, e recusa com mensagem clara quando passa. Estes tetos
 * pegam outra coisa: o texto colado sem querer, de dez mil caracteres, que
 * viraria um POST gigante e um erro feio no meio do caminho.
 */
export const TETO_DO_CAMPO: Record<CampoDeTexto, number> = {
  legenda: 2200,
  titulo: 255,
  descricao: 1000,
};

export interface TextoDoAnuncio {
  adId: string;
  nome: string;
  creativeId: string | null;
  postId: string | null;
  legenda: string | null;
  titulo: string | null;
  descricao: string | null;
  /** A conta de anúncio no formato da Meta (act_...), pra criar criativo. */
  contaMeta: string;
}

/**
 * O texto atual, do nosso cadastro, dentro das contas DESTA loja.
 *
 * Do cadastro e não da Meta: é o mesmo texto que a tela já mostra, trazido
 * pela varredura de quinze em quinze minutos. E a busca é sempre por dentro
 * das contas da loja — id trocado no navegador não alcança anúncio de outro
 * cliente, que é a mesma trava do ligar/desligar e da verba.
 */
export async function textoDoAnuncio(
  clientId: string,
  adId: string
): Promise<TextoDoAnuncio | null> {
  const contas = await prisma.metaAdAccount.findMany({
    where: { clientId, active: true },
    select: { id: true, metaAccountId: true },
  });
  if (contas.length === 0) return null;

  const linha = await prisma.metaAdCreative.findFirst({
    where: { adId, adAccountId: { in: contas.map((c) => c.id) } },
    select: {
      adId: true,
      adName: true,
      adAccountId: true,
      creativeId: true,
      postId: true,
      legenda: true,
      titulo: true,
      descricao: true,
    },
  });
  if (!linha) return null;

  const conta = contas.find((c) => c.id === linha.adAccountId);
  if (!conta) return null;

  return {
    adId: linha.adId,
    nome: linha.adName,
    creativeId: linha.creativeId,
    postId: linha.postId,
    legenda: linha.legenda,
    titulo: linha.titulo,
    descricao: linha.descricao,
    contaMeta: conta.metaAccountId,
  };
}

export interface ProvaSocial {
  curtidas: number | null;
  comentarios: number | null;
  /** Deu pra perguntar à Meta? Falso quando o post não é alcançável. */
  conferido: boolean;
}

/**
 * Quantas curtidas e comentários o post do anúncio tem hoje.
 *
 * ── Por que vale uma chamada extra ───────────────────────────────────────
 *
 * Porque é o número que decide se a edição vale a pena, e ninguém tem ele na
 * cabeça. Trocar o texto de um anúncio parado há dois dias não custa nada;
 * trocar o de um que juntou 180 comentários joga fora meses de prova social,
 * e o Gerenciador deixa fazer isso sem dizer uma palavra.
 *
 * Falhar aqui não impede nada: alguns posts não respondem a esta pergunta
 * (anúncio sem post orgânico, post de conta que o token não alcança). Nesse
 * caso o aviso vira genérico em vez de numérico — é menos útil, mas não é
 * motivo pra travar a edição.
 */
export async function provaSocialDoPost(postId: string | null): Promise<ProvaSocial> {
  const vazio: ProvaSocial = { curtidas: null, comentarios: null, conferido: false };
  if (!postId) return vazio;

  const r = await buscarNaGraph<{
    likes?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
  }>(postId, { fields: "likes.summary(true).limit(0),comments.summary(true).limit(0)" });

  if (!r.ok) return vazio;

  return {
    curtidas: r.dados.likes?.summary?.total_count ?? null,
    comentarios: r.dados.comments?.summary?.total_count ?? null,
    conferido: true,
  };
}

/** A frase do aviso, pronta pra tela. */
export function avisoDaProvaSocial(p: ProvaSocial): string {
  // "Pode" e não "vai": a Meta aceita trocar o texto no criativo que já
  // existe em alguns formatos, e aí o post continua o mesmo. Prometer a
  // perda que não aconteceu assusta à toa e ensina a ignorar o aviso — que
  // é pior do que não ter aviso, porque no dia em que a perda for real
  // ninguém vai ler.
  const base =
    "A Meta pode não deixar trocar o texto neste anúncio sem refazê-lo. " +
    "Quando isso acontece, nasce um post novo e o anúncio deixa de apontar pro de agora.";

  if (!p.conferido) {
    return `${base} Nesse caso, as curtidas e os comentários que ele tiver ficam para trás.`;
  }

  const c = p.curtidas ?? 0;
  const m = p.comentarios ?? 0;
  if (c === 0 && m === 0) {
    return "Este post ainda não tem curtida nem comentário, então trocar o texto não custa prova social nenhuma.";
  }

  const pedacos = [
    c > 0 ? `${c} ${c === 1 ? "curtida" : "curtidas"}` : null,
    m > 0 ? `${m} ${m === 1 ? "comentário" : "comentários"}` : null,
  ].filter(Boolean);

  return `${base} Aí as ${pedacos.join(" e ")} deste post ficam para trás. O sistema tenta primeiro o jeito que não perde nada, e só pede confirmação se a Meta recusar.`;
}
