import "server-only";

import { prisma } from "@/lib/prisma";
import { buscarNaGraph } from "./cliente-graph";

// O CADASTRO da conta: campanhas e conjuntos, com status e orçamento.
//
// Separado da busca de números porque responde outra pergunta. Número diz "o
// que aconteceu"; isto diz "o que existe e está ligado". E são ritmos
// diferentes: número muda sozinho todo dia, cadastro muda quando alguém mexe.
//
// Tem um motivo prático também: campanha que existe mas não gastou nada no
// período NÃO APARECE nos insights. Sem este cadastro, uma campanha pausada
// há duas semanas simplesmente sumia da tela — e sumir é a pior forma de
// mostrar que algo está desligado, porque ninguém procura o que não vê.

const POR_PAGINA = 200;
const MAX_PAGINAS = 15;

interface CampanhaCrua {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

interface ConjuntoCru extends CampanhaCrua {
  campaign_id?: string;
}

interface Resposta<T> {
  data?: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}

export type ResultadoDaEstrutura =
  | { ok: true; campanhas: number; conjuntos: number }
  | { ok: false; erro: string };

/** Orçamento vem como string de centavos. Campo ausente é "não tem". */
function centavos(texto: string | undefined): number | null {
  if (!texto) return null;
  const n = Number(texto);
  return Number.isFinite(n) ? Math.round(n) : null;
}

async function tudoDe<T>(caminho: string, campos: string): Promise<T[] | string> {
  const todos: T[] = [];
  let depois: string | undefined;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const resposta = await buscarNaGraph<Resposta<T>>(caminho, {
      fields: campos,
      limit: String(POR_PAGINA),
      // Sem filtro de status: a tela precisa mostrar o que está PAUSADO
      // também — é metade do motivo de existir uma coluna de status.
      ...(depois ? { after: depois } : {}),
    });
    if (!resposta.ok) return resposta.erro;

    const lote = resposta.dados.data ?? [];
    todos.push(...lote);
    depois = resposta.dados.paging?.cursors?.after;
    if (!resposta.dados.paging?.next || lote.length === 0) break;
  }
  return todos;
}

/**
 * Lê campanhas e conjuntos de uma conta e guarda.
 *
 * Como a busca da arte, não escreve `lastSyncError` quando falha: aquele
 * campo é a saúde da leitura de NÚMEROS, que é o que para a loja. Cadastro
 * desatualizado é chato; não é motivo pra pintar a linha de amarelo como se
 * o gasto estivesse velho.
 */
export async function sincronizarEstrutura(conta: {
  id: string;
  metaAccountId: string;
}): Promise<ResultadoDaEstrutura> {
  const campanhas = await tudoDe<CampanhaCrua>(
    `${conta.metaAccountId}/campaigns`,
    "id,name,status,effective_status,objective,daily_budget,lifetime_budget"
  );
  if (typeof campanhas === "string") return { ok: false, erro: campanhas };

  const conjuntos = await tudoDe<ConjuntoCru>(
    `${conta.metaAccountId}/adsets`,
    "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget"
  );
  if (typeof conjuntos === "string") return { ok: false, erro: conjuntos };

  const porCampanha = new Map<string, CampanhaCrua>();
  for (const c of campanhas) if (c.id) porCampanha.set(c.id, c);
  const porConjunto = new Map<string, ConjuntoCru>();
  for (const c of conjuntos) if (c.id) porConjunto.set(c.id, c);

  await prisma.$transaction(
    async (tx) => {
      // Apaga e regrava: campanha que sumiu da Meta não existe mais, e
      // deixá-la na tela mostraria uma chave de liga/desliga pra algo que
      // não dá pra ligar.
      await tx.metaCampaign.deleteMany({ where: { adAccountId: conta.id } });
      await tx.metaAdset.deleteMany({ where: { adAccountId: conta.id } });

      const lotes = <T,>(xs: T[], n: number) =>
        Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

      for (const lote of lotes([...porCampanha.values()], 200)) {
        await tx.metaCampaign.createMany({
          data: lote.map((c) => ({
            adAccountId: conta.id,
            campaignId: c.id!,
            name: c.name ?? c.id!,
            status: c.status ?? null,
            effectiveStatus: c.effective_status ?? null,
            objective: c.objective ?? null,
            dailyBudgetCents: centavos(c.daily_budget),
            lifetimeBudgetCents: centavos(c.lifetime_budget),
          })),
        });
      }

      for (const lote of lotes([...porConjunto.values()], 200)) {
        await tx.metaAdset.createMany({
          data: lote.map((c) => ({
            adAccountId: conta.id,
            adsetId: c.id!,
            campaignId: c.campaign_id ?? null,
            name: c.name ?? c.id!,
            status: c.status ?? null,
            effectiveStatus: c.effective_status ?? null,
            dailyBudgetCents: centavos(c.daily_budget),
            lifetimeBudgetCents: centavos(c.lifetime_budget),
          })),
        });
      }
    },
    { timeout: 20_000, maxWait: 10_000 }
  );

  return { ok: true, campanhas: porCampanha.size, conjuntos: porConjunto.size };
}
