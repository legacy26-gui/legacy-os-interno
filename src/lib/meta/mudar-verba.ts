import "server-only";

import { prisma } from "@/lib/prisma";
import { escreverNaGraph, escritaLiberada } from "./escrever-na-graph";
import { acharObjetoDaLoja, type NivelDoObjeto } from "./mudar-status";

// Mudar o orçamento de uma campanha ou conjunto, de verdade, na Meta.
//
// ── Primeiro: "gasto" não se edita ───────────────────────────────────────
//
// O Guilherme pediu pra editar "verba, gasto e tal". Verba sim; gasto não —
// e a diferença não é implicância de nome.
//
// Verba (orçamento) é o que você MANDA a Meta gastar. Gasto é o que ela
// gastou. Um é instrução, o outro é resultado. Não existe campo de gasto pra
// escrever, na nossa API nem na da Meta: seria o mesmo que editar quantos
// carros a loja vendeu no mês passado.
//
// Quando alguém diz "quero mexer no gasto", o que quer dizer é a verba. É
// isso que esta função faz.
//
// ── Por que anúncio não entra ────────────────────────────────────────────
//
// Porque anúncio não tem orçamento na Meta. Quem tem é a campanha (quando
// está no modo CBO, com o orçamento no nível dela) ou o conjunto. O anúncio
// só gasta o que o conjunto dele libera.
//
// ── A trava é a mesma do ligar/desligar ──────────────────────────────────
//
// `acharObjetoDaLoja` procura o objeto no NOSSO cadastro, dentro das contas
// daquela loja. Nada é mandado pra Meta sem passar por ali. Id trocado no
// navegador não vira orçamento de outra pessoa alterado.

/** Só campanha e conjunto têm orçamento. */
export type NivelComVerba = Extract<NivelDoObjeto, "campanha" | "conjunto">;

export function nivelTemVerba(n: NivelDoObjeto): n is NivelComVerba {
  return n === "campanha" || n === "conjunto";
}

/**
 * Diário ou total.
 *
 * São excludentes na Meta: um objeto tem um ou o outro, nunca os dois. E
 * trocar de um pro outro num objeto que já está rodando a Meta recusa — por
 * isso esta função só muda o VALOR do tipo que o objeto já usa, e avisa
 * quando não dá pra saber qual é.
 */
export type TipoDeVerba = "diaria" | "total";

export const CAMPO_DA_VERBA: Record<TipoDeVerba, string> = {
  diaria: "daily_budget",
  total: "lifetime_budget",
};

/**
 * O menor orçamento que vale a pena mandar.
 *
 * A Meta tem um mínimo próprio, que muda com a moeda e com o tipo de
 * otimização, e ela recusa com uma mensagem clara quando o valor é baixo
 * demais — então não cabe a nós adivinhar qual é. O que a trava daqui pega é
 * outra coisa: o campo vazio ou o zero digitado sem querer, que pararia a
 * campanha sem ninguém pedir pra parar.
 */
export const VERBA_MINIMA_CENTS = 100;

/**
 * Acima disto, a mudança pede confirmação na tela.
 *
 * Não é uma trava, é um pedágio. O erro que importa aqui é o decimal: quem
 * quer R$ 50,00 e digita "5000" multiplica a verba por cem, e a Meta obedece
 * na hora. O dinheiro vai embora antes de alguém abrir o sistema de novo.
 */
export const SUBIDA_QUE_ASSUSTA = 2;

export interface VerbaAtual {
  objetoId: string;
  nome: string;
  tipo: TipoDeVerba | null;
  atualCents: number | null;
}

/**
 * Lê o orçamento que temos guardado deste objeto.
 *
 * Do nosso cadastro e não da Meta: é o mesmo número que a tela mostra, e
 * perguntar à Meta de novo aqui dobraria a chamada pra confirmar algo que a
 * varredura traz de quinze em quinze minutos.
 *
 * `tipo` vem null quando o objeto não tem orçamento nenhum guardado — o caso
 * do conjunto dentro de uma campanha CBO, onde quem manda é a campanha.
 */
export async function verbaDoObjeto(
  clientId: string,
  nivel: NivelComVerba,
  objetoId: string
): Promise<VerbaAtual | null> {
  const achado = await acharObjetoDaLoja(clientId, nivel, objetoId);
  if (!achado) return null;

  const contas = await prisma.metaAdAccount.findMany({
    where: { clientId, active: true },
    select: { id: true },
  });
  const ids = contas.map((c) => c.id);

  const linha =
    nivel === "campanha"
      ? await prisma.metaCampaign.findFirst({
          where: { campaignId: objetoId, adAccountId: { in: ids } },
          select: { dailyBudgetCents: true, lifetimeBudgetCents: true },
        })
      : await prisma.metaAdset.findFirst({
          where: { adsetId: objetoId, adAccountId: { in: ids } },
          select: { dailyBudgetCents: true, lifetimeBudgetCents: true },
        });

  const diaria = linha?.dailyBudgetCents ?? null;
  const total = linha?.lifetimeBudgetCents ?? null;

  return {
    objetoId: achado.objetoId,
    nome: achado.nome,
    tipo: diaria !== null ? "diaria" : total !== null ? "total" : null,
    atualCents: diaria ?? total,
  };
}

export type ResultadoDaVerba =
  | { ok: true; nome: string; tipo: TipoDeVerba; valorCents: number }
  | { ok: false; erro: string };

/**
 * Muda o orçamento na Meta e grava o que aconteceu.
 *
 * Grava nos DOIS casos, sucesso e falha. Um registro só dos acertos conta
 * metade da história: quando alguém perguntar "por que a verba desta loja
 * está estranha", a tentativa que a Meta recusou é tão informativa quanto a
 * que passou.
 */
export async function mudarVerba(opts: {
  clientId: string;
  quemId: string;
  nivel: NivelComVerba;
  objetoId: string;
  /** O valor novo, em centavos. */
  valorCents: number;
}): Promise<ResultadoDaVerba> {
  const { clientId, quemId, nivel, objetoId, valorCents } = opts;

  if (!escritaLiberada()) {
    return { ok: false, erro: "A chave de escrita da Meta não está configurada no sistema." };
  }
  if (!Number.isInteger(valorCents) || valorCents < VERBA_MINIMA_CENTS) {
    return { ok: false, erro: "Valor de verba inválido." };
  }

  const atual = await verbaDoObjeto(clientId, nivel, objetoId);
  if (!atual) {
    return { ok: false, erro: "Este item não está no cadastro desta loja." };
  }
  if (!atual.tipo) {
    // Sem saber se é diária ou total, mandar qualquer um dos dois campos
    // pode trocar o modo da campanha — e trocar modo de campanha rodando é
    // coisa que a Meta recusa ou aceita de um jeito que ninguém esperava.
    return {
      ok: false,
      erro:
        nivel === "conjunto"
          ? "Este conjunto não tem orçamento próprio — quem manda é a campanha (orçamento no nível da campanha). Mude na campanha."
          : "Esta campanha não tem orçamento próprio guardado. Atualize a loja e tente de novo.",
    };
  }

  const resposta = await escreverNaGraph(objetoId, {
    [CAMPO_DA_VERBA[atual.tipo]]: String(valorCents),
  });

  await prisma.metaAcao.create({
    data: {
      clientId,
      quemId,
      tipo: "verba",
      nivel,
      objetoId,
      nome: atual.nome,
      // A tabela nasceu pro ligar/desligar e `statusPedido` é obrigatório.
      // Numa linha de verba ele guarda o campo que foi escrito, que é a
      // informação equivalente: o que se pediu à Meta.
      statusPedido: CAMPO_DA_VERBA[atual.tipo],
      statusAntes: null,
      valorPedidoCents: valorCents,
      valorAntesCents: atual.atualCents,
      ok: resposta.ok,
      erro: resposta.ok ? null : resposta.erro,
    },
  });

  if (!resposta.ok) return { ok: false, erro: resposta.erro };

  // Grava no nosso cadastro na hora, sem esperar a varredura.
  //
  // A próxima passada é daqui a quinze minutos. Sem isto, quem acabou de
  // mudar a verba recarregaria a tela e veria o valor velho — e mudaria de
  // novo, achando que não pegou.
  const campo =
    atual.tipo === "diaria" ? { dailyBudgetCents: valorCents } : { lifetimeBudgetCents: valorCents };

  if (nivel === "campanha") {
    await prisma.metaCampaign.updateMany({ where: { campaignId: objetoId }, data: campo });
  } else {
    await prisma.metaAdset.updateMany({ where: { adsetId: objetoId }, data: campo });
  }

  return { ok: true, nome: atual.nome, tipo: atual.tipo, valorCents };
}
