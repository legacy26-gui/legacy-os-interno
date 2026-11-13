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
  vitrine: {
    nome: "Vitrine",
    descricao:
      "O padrão das artes da casa: marca e modelo no canto, ficha com ícones numa faixa escura e o preço numa caixa de cor. É o mais parecido com o que a equipe já faz à mão.",
  },
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
  return v === "faixa" || v === "etiqueta" || v === "degrade" || v === "vitrine"
    ? v
    : "vitrine";
}

// ───────────────────────── A ficha, item por item ───────────────────────
//
// Nas artes reais a ficha aparece como quatro blocos com um ícone redondo e
// duas linhas de texto, separados por divisórias finas. O texto vem digitado
// pela loja, separado por "|", porque cada uma destaca o que quer — teto
// solar numa, "apenas 92.000 km" noutra. Uma lista fixa de campos faria a
// equipe deixar metade em branco.

export type IconeDaFicha = "km" | "cambio" | "motor" | "ano" | "ok";

/**
 * Qual ícone combina com este texto.
 *
 * Por palavra-chave e não por campo: a loja escreve livre, e adivinhar pelo
 * conteúdo acerta quase sempre. O que não casa com nada cai no "ok", que é
 * um visto — neutro e nunca errado.
 */
export function iconeDoItem(texto: string): IconeDaFicha {
  const t = texto.toLowerCase();
  if (/\bkm\b|quil[oô]met/.test(t)) return "km";
  if (/autom[aá]tic|manual|c[aâ]mbio|cvt|dualog/.test(t)) return "cambio";
  if (/turbo|flex|diesel|v6|v8|\d\.\d|aspirad|h[ií]brid|el[eé]tric/.test(t)) return "motor";
  if (/^(19|20)\d\d(\s*\/\s*(19|20)?\d\d)?$/.test(texto.trim())) return "ano";
  return "ok";
}

/** Quantos itens cabem na faixa sem apertar. */
export const ITENS_DA_FICHA = 4;

/**
 * Quebra o texto livre em itens, e cada item em até duas linhas.
 *
 * Duas linhas porque é assim na arte real ("APENAS / 92.000 KM"). A quebra
 * é no espaço mais perto do meio: partir no primeiro espaço deixaria "1.4 /
 * TURBO AUTOMÁTICO", que fica torto.
 */
export function itensDaFicha(
  detalhes: string | null | undefined,
  ano: string | null | undefined,
  km: string | null | undefined
): { linhas: string[]; icone: IconeDaFicha }[] {
  const brutos = [
    ...(km?.trim() ? [km.trim()] : []),
    ...(ano?.trim() ? [ano.trim()] : []),
    ...(detalhes ?? "").split("|").map((p) => p.trim()),
  ].filter((p) => p !== "");

  return brutos.slice(0, ITENS_DA_FICHA).map((texto) => ({
    linhas: emDuasLinhas(texto),
    icone: iconeDoItem(texto),
  }));
}

function emDuasLinhas(texto: string): string[] {
  const t = texto.trim();
  if (t.length <= 12 || !t.includes(" ")) return [t];
  const meio = t.length / 2;
  let melhor = -1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === " " && (melhor === -1 || Math.abs(i - meio) < Math.abs(melhor - meio))) {
      melhor = i;
    }
  }
  return melhor === -1 ? [t] : [t.slice(0, melhor), t.slice(melhor + 1)];
}
