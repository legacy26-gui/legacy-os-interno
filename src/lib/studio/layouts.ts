// Os três desenhos da arte de veículo.
//
// Sem "server-only" de propósito: a tela de identidade das lojas monta o
// seletor a partir desta lista, e o desenho no servidor lê a mesma. Se cada
// lado tivesse a sua, um layout novo apareceria num e não no outro.

// // Três desenhos, e não um com muitas opções. A diferença importa: opção
// solta ("logo à esquerda?", "preço grande?") multiplica combinações que
// ninguém testou, e metade delas sai feia. Três desenhos inteiros, cada um
// pensado até o fim, é o que uma loja escolhe em dez segundos.

export const LAYOUTS = {
  degrade: {
    nome: "Degradê",
    descricao: "Foto sangrando na arte inteira, informação sobre um degradê no pé. O mais sóbrio.",
  },
  faixa: {
    nome: "Faixa",
    descricao: "Foto em cima, bloco de cor chapada embaixo. O mais legível, e o mais comum em loja de carro.",
  },
  etiqueta: {
    nome: "Etiqueta",
    descricao: "Foto inteira com o preço numa etiqueta grande no canto. O mais agressivo, pra oferta.",
  },
} as const;

export type Layout = keyof typeof LAYOUTS;

/**
 * Lê o layout guardado, caindo no padrão quando não reconhece.
 *
 * É por isso que a coluna é texto e não enum: no dia em que um desenho sair
 * de cena, as lojas que o usavam voltam pro padrão sozinhas em vez de ficar
 * com a arte quebrada até alguém rodar uma migração.
 */
export function layoutDaLoja(v: string | null | undefined): Layout {
  return v === "faixa" || v === "etiqueta" || v === "degrade" ? v : "degrade";
}
