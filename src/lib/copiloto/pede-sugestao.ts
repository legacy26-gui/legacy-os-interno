// A pergunta PEDIU recomendação? Regra do Guilherme: a IA responde o que foi perguntado e só recomenda quando pedem.
// "anúncio ativo é só anúncio ativo, não recomendação". Pura — usada pra cortar, em código, o que a IA acrescentou sem ser pedida.

const SEM_ACENTO = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function pedeSugestao(pergunta: string): boolean {
  const t = SEM_ACENTO(pergunta);
  return /\b(sugest\w*|sugir\w*|sugere|recomend\w*|dica\w*|o que (eu )?(fa(c|z)o|fazer|faria|mudar|mexer|otimizar|melhorar)|onde (eu )?(mexo|mexer|mudar|melhorar)|como melhor\w*|otimiz\w*|vale (a pena )?(pausar|aumentar|diminuir|subir|escalar)|devo (pausar|aumentar|diminuir|mudar|escalar)|deveria|o que acha|opiniao|analis\w*|diagnost\w*|pior(es)?|melhor(es)?)\b/.test(t);
}

/**
 * Tira da resposta os parágrafos/linhas de recomendação que a IA acrescentou sem ninguém pedir ("Sugestão: …", "Recomendo …",
 * "Pontos de atenção: …", "Onde mexer: …"). Deixa o resto. Pura.
 */
export function semRecomendacao(texto: string): string {
  const linhas = texto.split("\n");
  const fora = /^\s*[-•*·]?\s*\**\s*(sugest(ao|oes|ão|ões)|recomend\w*|dica\w*|pontos? de aten(c|ç)(a|ã)o|onde mexer|pr(o|ó)ximos? passos?|a(c|ç)(a|ã)o sugerida|vale (a pena )?(aumentar|pausar|escalar))\b/i;
  const ficam = linhas.filter((l) => !fora.test(l));
  // O título "… e onde mexer agora" vira só o título do que está performando.
  return ficam
    .join("\n")
    .replace(/\s*e onde mexer( agora)?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
