import "server-only";

import { prisma } from "@/lib/prisma";
import { buscarNaGraph } from "./cliente-graph";

// Quais contas de anúncio o token enxerga.
//
// Em vez de pedir ao Guilherme que exporte uma lista e cole quarenta e um
// `act_...` à mão, pergunta-se à Meta. Ela sabe — é a mesma lista que aparece
// no Gerenciador de Negócios dele.
//
// Isso também responde de graça uma pergunta que ele precisa fazer: QUAIS
// lojas ainda não estão na BM. Loja que não aparece aqui não é erro do
// sistema; é acesso que ainda não foi concedido lá.

/** Teto de páginas. Uma BM de agência tem dezenas de contas, não milhares. */
const MAX_PAGINAS = 10;

interface ContaCrua {
  id?: string;
  account_id?: string;
  name?: string;
  account_status?: number;
  currency?: string;
}

interface Resposta {
  data?: ContaCrua[];
  paging?: { cursors?: { after?: string }; next?: string };
}

export interface ContaDisponivel {
  /** "act_123..." — como a Meta identifica e como o sistema guarda. */
  metaAccountId: string;
  nome: string;
  moeda: string | null;
  /** A Meta devolve número; 1 é ativa. O resto é desativada, pendente etc. */
  ativa: boolean;
  /** A loja a que já está vinculada, se estiver — com o id do vínculo. */
  jaVinculadaA: { contaId: string; clientId: string; loja: string } | null;
}

export type ResultadoDasContas =
  | { ok: true; contas: ContaDisponivel[] }
  | { ok: false; erro: string };

/**
 * Lê as contas e marca quais já estão vinculadas.
 *
 * `/me/adaccounts` e não a lista da BM: é o que o TOKEN alcança, que é
 * exatamente o que o sistema vai conseguir ler depois. Perguntar pela BM
 * mostraria contas que o token não abre, e aí a tela prometeria algo que a
 * busca não entrega.
 */
export async function contasDisponiveis(): Promise<ResultadoDasContas> {
  const todas: ContaCrua[] = [];
  let depois: string | undefined;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const resposta = await buscarNaGraph<Resposta>("me/adaccounts", {
      fields: "id,account_id,name,account_status,currency",
      limit: "200",
      ...(depois ? { after: depois } : {}),
    });

    if (!resposta.ok) return { ok: false, erro: resposta.erro };

    const lote = resposta.dados.data ?? [];
    todas.push(...lote);
    depois = resposta.dados.paging?.cursors?.after;
    if (!resposta.dados.paging?.next || lote.length === 0) break;
  }

  const vinculadas = await prisma.metaAdAccount.findMany({
    select: {
      id: true,
      metaAccountId: true,
      clientId: true,
      client: { select: { companyName: true } },
    },
  });
  const porConta = new Map(
    vinculadas.map((v) => [
      v.metaAccountId,
      { contaId: v.id, clientId: v.clientId, loja: v.client.companyName },
    ])
  );

  const contas: ContaDisponivel[] = todas
    .filter((c) => c.id)
    .map((c) => ({
      metaAccountId: c.id!,
      nome: c.name?.trim() || c.id!,
      moeda: c.currency ?? null,
      ativa: c.account_status === 1,
      jaVinculadaA: porConta.get(c.id!) ?? null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return { ok: true, contas };
}

// ───────────────────── Casar conta com loja pelo nome ──────────────────────
//
// A sugestão é um PALPITE e a tela diz isso. Vincular conta errada manda o
// gasto de uma loja pra ficha de outra, e ninguém desconfia de um número que
// chegou sozinho — então quem confirma é gente, uma por uma.

/** Tira acento, pontuação e palavra que toda loja tem. */
function simplificar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(ltda|me|eireli|sa|s\/a|automoveis|automotores|veiculos|multimarcas|motors|car|cars|seminovos|auto|comercio|de|da|do|e)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Quantas palavras as duas têm em comum, sobre o total da menor. */
function parecenca(a: string, b: string): number {
  const pa = new Set(simplificar(a).split(" ").filter((p) => p.length > 2));
  const pb = new Set(simplificar(b).split(" ").filter((p) => p.length > 2));
  if (pa.size === 0 || pb.size === 0) return 0;
  let juntas = 0;
  for (const p of pa) if (pb.has(p)) juntas++;
  return juntas / Math.min(pa.size, pb.size);
}

/** Abaixo disso não vale sugerir: palpite fraco atrapalha mais que ajuda. */
const PARECENCA_MINIMA = 0.5;

export interface Sugestao {
  clientId: string;
  loja: string;
  /** 0 a 1. Serve pra tela dizer o quanto é chute. */
  confianca: number;
}

/** A loja que mais parece com o nome da conta. */
export function sugerirLoja(
  nomeDaConta: string,
  lojas: { id: string; companyName: string }[]
): Sugestao | null {
  let melhor: Sugestao | null = null;
  for (const l of lojas) {
    const c = parecenca(nomeDaConta, l.companyName);
    if (c >= PARECENCA_MINIMA && (!melhor || c > melhor.confianca)) {
      melhor = { clientId: l.id, loja: l.companyName, confianca: c };
    }
  }
  return melhor;
}
