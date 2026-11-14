import "server-only";

import { prisma } from "@/lib/prisma";
import { escreverNaGraph, escritaLiberada } from "./escrever-na-graph";
import {
  acharObjetoDaLoja,
  ROTULO_DO_NIVEL,
  type NivelDoObjeto,
} from "./mudar-status";

// Mexer em vários de uma vez: desligar, arquivar ou excluir.
//
// ── Por que isto existe ──────────────────────────────────────────────────
//
// Porque o trabalho real é em lote. Um carro vende e a loja tem quatro
// anúncios dele espalhados em duas campanhas; hoje são quatro idas e voltas,
// e na terceira alguém se distrai e deixa um no ar gastando por um carro que
// já saiu do pátio.
//
// ── As três ações, e por que não são a mesma coisa ───────────────────────
//
// DESLIGAR para a entrega e deixa tudo no lugar. Reversível com um clique. É
// o certo quando o carro pode voltar, quando é teste, quando é fim de mês.
//
// ARQUIVAR tira da lista e guarda o histórico. A Meta deixa mudar `name` e
// `status` de um arquivado — então dá pra desarquivar. É o certo pro carro
// que vendeu: some da frente sem perder o que ele gastou e rendeu.
//
// EXCLUIR não volta. A Meta diz, com todas as letras, que num item excluído
// só o `name` pode mudar — não existe caminho de volta pro ar, nem por aqui
// nem pelo Gerenciador.
//
// O Guilherme pediu excluir porque a lista entope de carro vendido. Arquivar
// resolve isso igual e sem risco, e por isso é o padrão sugerido na tela.
// Excluir fica disponível, porque é escolha dele, atrás de uma confirmação
// que obriga a ler.

export type AcaoEmLote = "desligar" | "arquivar" | "excluir";

export const ROTULO_DA_ACAO: Record<AcaoEmLote, string> = {
  desligar: "Desligar",
  arquivar: "Arquivar",
  excluir: "Excluir",
};

/** O status que vai pra Meta. Excluir não usa: é outro verbo HTTP. */
const STATUS_DA_ACAO: Record<Exclude<AcaoEmLote, "excluir">, string> = {
  desligar: "PAUSED",
  arquivar: "ARCHIVED",
};

/** Só esta não tem volta. */
export function naoTemVolta(acao: AcaoEmLote): boolean {
  return acao === "excluir";
}

/**
 * Teto de itens por lote.
 *
 * Não é limite da Meta: é limite de arrependimento. Selecionar tudo sem
 * querer e mandar excluir oitenta anúncios é o acidente que esta tela
 * possibilita e que não existia antes dela. Acima disto o sistema recusa e
 * manda fazer em partes — o que custa dois minutos e dá duas chances a mais
 * de alguém olhar pra lista.
 */
export const MAXIMO_POR_LOTE = 25;

export interface ItemDoLote {
  objetoId: string;
  nome: string;
  ok: boolean;
  erro: string | null;
}

export interface ResultadoDoLote {
  feitos: ItemDoLote[];
  falhos: ItemDoLote[];
}

/**
 * Executa a ação em cada item, um por um.
 *
 * ── Por que um por um, e não tudo de uma vez ─────────────────────────────
 *
 * A Meta tem chamada em lote, e seria mais rápido. Mas aí uma recusa no meio
 * deixa metade feito sem dizer qual metade, e a pessoa fica sem saber o que
 * olhar. Um por um, cada item tem seu resultado e seu registro — e a tela
 * consegue dizer "sete foram, este aqui não foi, e por quê".
 *
 * Nada para a fila: se o terceiro falhar, o quarto continua. Parar no erro
 * deixaria o lote pela metade por causa de um anúncio que já estava excluído
 * na Meta, que é o erro mais comum aqui.
 */
export async function acaoEmLote(opts: {
  clientId: string;
  quemId: string;
  nivel: NivelDoObjeto;
  ids: string[];
  acao: AcaoEmLote;
}): Promise<ResultadoDoLote | { erro: string }> {
  const { clientId, quemId, nivel, ids, acao } = opts;

  if (!escritaLiberada()) {
    return {
      erro: "O acesso de escrita na Meta ainda não está configurado no sistema.",
    };
  }
  if (ids.length === 0) return { erro: "Nenhum item selecionado." };
  if (ids.length > MAXIMO_POR_LOTE) {
    return {
      erro: `São ${ids.length} itens de uma vez. O máximo é ${MAXIMO_POR_LOTE} — faça em partes.`,
    };
  }

  const feitos: ItemDoLote[] = [];
  const falhos: ItemDoLote[] = [];

  for (const id of ids) {
    // A trava de sempre: o objeto é procurado DENTRO das contas desta loja.
    // Id trocado no navegador não alcança anúncio de outro cliente — e numa
    // ação que exclui, isso deixa de ser detalhe.
    const objeto = await acharObjetoDaLoja(clientId, nivel, id);
    if (!objeto) {
      falhos.push({
        objetoId: id,
        nome: id,
        ok: false,
        erro: `Este ${ROTULO_DO_NIVEL[nivel]} não está no cadastro desta loja.`,
      });
      continue;
    }

    const r =
      acao === "excluir"
        ? await escreverNaGraph(objeto.objetoId, { status: "DELETED" })
        : await escreverNaGraph(objeto.objetoId, {
            status: STATUS_DA_ACAO[acao],
          });

    await prisma.metaAcao.create({
      data: {
        clientId,
        quemId,
        tipo: "status",
        nivel,
        objetoId: objeto.objetoId,
        nome: objeto.nome,
        statusPedido: acao === "excluir" ? "DELETED" : STATUS_DA_ACAO[acao],
        statusAntes: objeto.statusAntes,
        ok: r.ok,
        erro: r.ok ? null : r.erro.slice(0, 500),
      },
    });

    const item: ItemDoLote = {
      objetoId: objeto.objetoId,
      nome: objeto.nome,
      ok: r.ok,
      erro: r.ok ? null : r.erro,
    };
    (r.ok ? feitos : falhos).push(item);

    // Grava no cadastro na hora, pra tela não voltar mostrando o estado
    // velho. A varredura só passa daqui a quinze minutos, e quem acabou de
    // arquivar oito anúncios não pode vê-los todos de volta ao recarregar.
    if (r.ok) await refletirNoCadastro(nivel, objeto.objetoId, acao);
  }

  return { feitos, falhos };
}

async function refletirNoCadastro(
  nivel: NivelDoObjeto,
  id: string,
  acao: AcaoEmLote,
) {
  const status = acao === "excluir" ? "DELETED" : STATUS_DA_ACAO[acao];
  const dados = { status, effectiveStatus: status };

  if (nivel === "campanha") {
    await prisma.metaCampaign.updateMany({
      where: { campaignId: id },
      data: dados,
    });
  } else if (nivel === "conjunto") {
    await prisma.metaAdset.updateMany({ where: { adsetId: id }, data: dados });
  } else {
    await prisma.metaAdCreative.updateMany({
      where: { adId: id },
      data: dados,
    });
  }
}
