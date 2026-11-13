// O avaliador.
//
// Ele olha a arte pronta ao lado da foto original e dá nota. Não é opinião
// solta: são sete categorias com régua escrita, e a nota baixa tem que vir
// acompanhada do que fazer.
//
// ── Por que não é o mesmo modelo que dirigiu ─────────────────────────────
//
// Porque um avaliador que compartilha os vieses do gerador aprova o próprio
// erro. Se o diretor acha que texto vermelho sobre preto lê bem, ele vai
// achar de novo na hora de conferir. Quem dirige é o gpt-4.1; quem avalia é o
// gpt-4o.
//
// É uma separação de verdade, mas não é completa: os dois são da mesma casa e
// comem do mesmo treino. Um avaliador de outra empresa pegaria mais coisa.
// Isso está anotado no relatório e não escondido.
//
// ── Por que a foto original vai junto ────────────────────────────────────
//
// A nota de fidelidade é a única que não dá pra dar olhando só a arte. A cena
// é gerada: o veículo é redesenhado, não colado. Sem a foto do lado, "é o
// mesmo carro?" vira chute. Com ela, é conferência de placa, roda, adesivo e
// emblema.

import { perguntar } from "./openai.mjs";

/** O modelo que avalia. Diferente do que dirige, de propósito. */
export const MODELO_AVALIADOR = "gpt-4o";

/**
 * A régua. Fica escrita porque sem ela a nota vira humor do dia: a mesma peça
 * tira 6 e 9 em duas chamadas, e aí o ciclo de correção persegue ruído.
 */
const CATEGORIAS = {
  qualidadeEstetica:
    "A peça parece feita por designer profissional de agência, ou parece template automático? Olhe acabamento, equilíbrio e se o conjunto tem intenção.",
  hierarquiaVisual:
    "Em um segundo de rolagem, o olho bate primeiro no veículo, depois no preço, depois no resto? Se dois elementos brigam pela atenção, é nota baixa.",
  proporcoes:
    "Tamanhos e espaçamentos estão coerentes? Texto espremido, margem desigual, bloco gigante ou elemento perdido no vazio derrubam a nota.",
  legibilidade:
    "Todo texto lê no celular, em tela pequena e no claro? Contraste fraco entre texto e fundo, texto sobre região ocupada da foto, ou fonte pequena demais derrubam a nota. LEIA CADA PALAVRA EM VOZ ALTA: palavra cortada no meio ou que termina sem sentido ('TRABALH', 'IMPERDÍ') é nota 3 ou menos, por mais bonita que esteja a peça. Texto da mesma cor do bloco atrás dele, que some, também é nota 3 ou menos.",
  enquadramento:
    "O veículo aparece INTEIRO e bem posicionado? Para-choque, roda ou caçamba cortados pela borda ou cobertos por algum bloco é nota 4 ou menos. Veículo minúsculo no meio do vazio também.",
  identidadeVisual:
    "A peça parece desta loja? Cores coerentes com a marca, logo presente, legível e bem posicionada, nada de logotipo inventado ou de terceiro.",
  fidelidadeFotografia:
    "Comparando com a FOTO ORIGINAL (a primeira imagem): é o mesmo veículo? Mesma cor, mesma carroceria, mesmas rodas, mesmos adesivos, mesma placa, mesmo ângulo? Qualquer detalhe inventado, emblema trocado, roda diferente ou carroceria redesenhada é nota 3 ou menos. Mudar o CENÁRIO em volta é esperado e não conta como infidelidade.",
};

/** Média mínima e piso por categoria. Os dois têm que passar. */
export const MEDIA_MINIMA = 7.5;
export const PISO_POR_CATEGORIA = 6;

export function aprovada(notas) {
  const vs = Object.values(notas);
  const media = vs.reduce((s, n) => s + n, 0) / vs.length;
  return { media, passou: media >= MEDIA_MINIMA && vs.every((n) => n >= PISO_POR_CATEGORIA) };
}

export async function avaliar({ fotoOriginal, arte, dados, tentativa }) {
  const r = await perguntar({
    modelo: MODELO_AVALIADOR,
    etapa: `avaliação ${tentativa}`,
    sistema:
      "Você é diretor de criação revisando peças de uma agência que atende revendas de veículos. Você é exigente: aprova o que publicaria com o nome da agência junto. Responde só JSON.",
    usuario: `Duas imagens: a PRIMEIRA é a foto original do veículo, como ela chegou. A SEGUNDA é a arte pronta que vai ser publicada.

O QUE A ARTE DEVERIA DIZER (veio do cadastro, confira se bate com o que está escrito nela)
loja: ${dados.loja}
modelo: ${dados.modelo}
preço: R$ ${dados.preco}
ficha: ${dados.ficha.join(" · ")}

Dê nota de 0 a 10 em cada categoria, usando esta régua:
${Object.entries(CATEGORIAS)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

Seja duro. Nota 8 significa "publicaria sem mexer". Nota 10 é raro.

Liste um problema para CADA categoria que ficou abaixo de ${PISO_POR_CATEGORIA + 1}. Em "comoCorrigir", diga o ajuste concreto (qual elemento, pra onde, maior ou menor, que cor) — não escreva "melhorar o equilíbrio".

"dadosErrados" é SÓ para número ou nome que contradiz o cadastro: preço diferente, ano diferente, quilometragem diferente, modelo ou loja com nome errado. Um preço de R$ 74.900 escrito como 74.990 é dado errado e reprova a peça na hora.
NÃO coloque em "dadosErrados" as frases de vitrine ("SEM ENROLAÇÃO", "ÚNICO DONO", "REVISADA", "IPVA PAGO"): são texto de criação, não existem no cadastro, e é normal que não estejam lá. Se uma delas estiver ilegível ou cortada, isso é problema de legibilidade, não dado errado.
Quando houver dado errado de verdade, dê no máximo 3 em qualidadeEstetica.

Responda:
{"notas":{${Object.keys(CATEGORIAS).map((k) => `"${k}":n`).join(",")}},
 "problemas":[{"categoria":"nome da categoria","oque":"o defeito, concreto","comoCorrigir":"o ajuste, concreto"}],
 "dadosErrados":["texto da arte que não bate com o cadastro"],
 "parecer":"duas ou três frases de leitura geral"}`,
    imagens: [fotoOriginal, arte],
    teto: 1600,
  });

  const notas = {};
  for (const k of Object.keys(CATEGORIAS)) {
    const n = Number(r.notas?.[k]);
    if (!Number.isFinite(n)) throw new Error(`o avaliador não deu nota em ${k}`);
    notas[k] = Math.min(10, Math.max(0, n));
  }

  const { media, passou } = aprovada(notas);
  return {
    notas,
    media,
    // Dado errado reprova direto, por mais bonita que esteja: é o único
    // defeito que chega no cliente como mentira, e não como peça feia.
    passou: passou && (r.dadosErrados ?? []).length === 0,
    problemas: Array.isArray(r.problemas) ? r.problemas : [],
    dadosErrados: r.dadosErrados ?? [],
    parecer: String(r.parecer ?? ""),
  };
}
