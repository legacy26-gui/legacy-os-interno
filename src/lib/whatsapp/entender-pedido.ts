// "Vendeu o Onix, pode tirar do ar."
//
// Este arquivo lê uma frase de grupo de WhatsApp e decide se ela é um pedido
// pra desligar um anúncio — e, se for, QUAL anúncio.
//
// ── Por que sem IA ───────────────────────────────────────────────────────
//
// Não por economia: chamada de texto é barata. É por duas coisas melhores.
//
// A primeira é que isto se testa. Uma regra escrita erra sempre do mesmo
// jeito, e erro que se repete é erro que se conserta. Um modelo que decide
// desligar anúncio erra de um jeito diferente a cada vez, e aí não há teste
// que segure.
//
// A segunda é que o problema é pequeno. A loja não fala de qualquer carro:
// fala dos que ESTÃO ANUNCIADOS, e essa lista o sistema tem na mão. Casar
// uma frase contra trinta nomes conhecidos não precisa de modelo nenhum.
//
// Se um dia a frase vier torta demais pra regra, o lugar de colocar o modelo
// é aqui dentro, e os testes continuam valendo.
//
// ── A regra que importa mais que todas ───────────────────────────────────
//
// Na dúvida, NÃO DESLIGA. Desligar o anúncio errado é a loja perdendo lead
// do carro que ainda está no pátio, calada, até alguém reparar. Perguntar
// "qual deles?" no grupo custa trinta segundos de quem já estava ali.

/** Um anúncio da loja, do jeito que este arquivo precisa dele. */
export interface AnuncioConhecido {
  adId: string;
  nome: string;
  /** Título e legenda entram na busca: o modelo às vezes só aparece neles. */
  textos: string[];
}

export type Intencao =
  /** A frase pede pra tirar um carro do ar. */
  | "desligar"
  /** Qualquer outra coisa — e aí o robô não faz nada. */
  | "nenhuma";

export interface Pedido {
  intencao: Intencao;
  /** Os anúncios que a frase pode estar citando, do mais provável ao menos. */
  candidatos: AnuncioConhecido[];
  /**
   * `true` só quando há UM candidato e ele ganhou com folga. É esta bandeira,
   * e nada mais, que autoriza desligar sem perguntar.
   */
  semDuvida: boolean;
}

// ── O vocabulário ────────────────────────────────────────────────────────

/**
 * As formas de pedir pra tirar do ar, como se fala de verdade num grupo.
 *
 * Levantadas do jeito que dono de loja escreve: sem pontuação, sem maiúscula,
 * com o verbo às vezes sozinho ("vendeu") e às vezes pedindo ("pode tirar").
 */
const PEDIDOS_DE_DESLIGAR = [
  "vendeu",
  "vendido",
  "vendida",
  "ja foi",
  "saiu",
  "pode tirar",
  "pode parar",
  "pode pausar",
  "pode desligar",
  "pode desativar",
  "tirar do ar",
  "tira do ar",
  "sai do ar",
  "fora do ar",
  "desliga",
  "desligar",
  "desativa",
  "desativar",
  "pausa",
  "pausar",
  "para de anunciar",
  "parar de anunciar",
  "nao anuncia mais",
  "cancela",
  // ── O imperativo, que é como as pessoas mandam de verdade ──────────────
  //
  // O primeiro pedido real do Guilherme no grupo foi "Pause o Virtus das
  // campanhas", e o robô ficou mudo: a lista tinha "pausa" e "pausar", não
  // "pause". O mesmo valia pra "tira o Onix" — só "tira do ar" era
  // reconhecido, e ninguém fala assim quando está com pressa.
  //
  // Abrir a lista é seguro porque nada aqui age sozinho: o robô só chega a
  // ler a frase depois de ter sido MARCADO com @ por uma pessoa. O custo de
  // um verbo a mais é uma pergunta "qual desses?"; o custo de um verbo a
  // menos é o robô ignorar um pedido legítimo em silêncio, que foi o que
  // aconteceu.
  //
  // "para" e "pare" ficam DE FORA de propósito: "para" é preposição e
  // apareceria em quase toda frase ("manda para mim", "foto para o
  // anúncio"). A forma com complemento, "parar de anunciar", já está acima.
  "pause",
  "tira",
  "tire",
  "tirar",
  "retira",
  "retire",
  "retirar",
  "desligue",
  "desative",
  "encerra",
  "encerre",
  "suspende",
  "suspenda",
];

/**
 * O que transforma um pedido em NÃO-pedido.
 *
 * "ainda não vendeu" tem a palavra "vendeu" dentro. Sem isto, a frase que
 * diz exatamente o contrário desligaria o anúncio — e seria o pior defeito
 * possível deste arquivo, porque acontece justamente quando a loja está
 * avisando que o carro continua lá.
 */
const DESMENTIDOS = [
  "nao vendeu",
  "nao foi vendido",
  "ainda nao",
  "quase vendeu",
  "se vender",
  "quando vender",
  "nao pode tirar",
  "nao tira",
  "nao desliga",
  "nao pausa",
  "nao pause",
  "nao tire",
  "nao retire",
  "nao desligue",
  "nao desative",
  "nem vendeu",
  "sera que vendeu",
];
// Cuidado ao mexer aqui: o texto é comparado SEM pontuação, então um
// desmentido escrito "vendeu?" vira "vendeu" e passa a desmentir toda frase
// que contenha a palavra — inclusive o pedido de verdade. Pergunta já é
// tratada em pedeParaDesligar, pelo ponto de interrogação no fim.

/**
 * Palavras que não distinguem carro nenhum.
 *
 * Cor é o caso que mais engana: "vendeu o prata" parece específico e numa
 * loja com quatro carros prata não é. Entram aqui também as palavras de
 * ligação e as que aparecem em todo nome de anúncio.
 */
const PALAVRAS_SEM_FORCA = new Set([
  // ligação
  "o", "a", "os", "as", "um", "uma", "de", "do", "da", "dos", "das", "e",
  "que", "ja", "pra", "para", "por", "com", "em", "no", "na", "ao", "se",
  "foi", "ta", "esta", "tava", "estava", "pode", "podemos", "favor",
  // cores
  "branco", "branca", "preto", "preta", "prata", "cinza", "vermelho",
  "vermelha", "azul", "verde", "amarelo", "amarela", "marrom", "bege",
  "dourado", "vinho",
  // genéricas de anúncio
  "carro", "veiculo", "anuncio", "anuncios", "campanha", "oferta", "promo",
  "promocao", "estoque", "loja", "venda", "vendas", "novo", "nova", "usado",
  "usada", "seminovo", "zero", "km", "ano", "modelo", "completo",
  // os próprios verbos do pedido
  ...PEDIDOS_DE_DESLIGAR.flatMap((p) => p.split(" ")),
]);

// ── As ferramentas de texto ──────────────────────────────────────────────

/** Minúsculas, sem acento, sem pontuação — pra "Ônix" casar com "onix". */
export function achatar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function palavras(texto: string): string[] {
  return achatar(texto)
    .split(" ")
    .filter((p) => p.length >= 2);
}

/** As palavras de um anúncio que servem pra reconhecê-lo. */
function palavrasDoAnuncio(a: AnuncioConhecido): Set<string> {
  const todas = [a.nome, ...a.textos].flatMap(palavras);
  return new Set(todas.filter((p) => !PALAVRAS_SEM_FORCA.has(p)));
}

// ── A leitura ────────────────────────────────────────────────────────────

/** A frase pede pra tirar algo do ar? */
export function pedeParaDesligar(texto: string): boolean {
  const t = achatar(texto);
  // Pergunta não é pedido: "já vendeu o Onix?" é dúvida de quem está
  // perguntando, não ordem de quem está mandando.
  if (texto.trim().endsWith("?")) return false;
  if (DESMENTIDOS.some((d) => t.includes(achatar(d)))) return false;
  return PEDIDOS_DE_DESLIGAR.some((p) => {
    const termo = achatar(p);
    // Com espaço é expressão: busca solta. Palavra só tem que ser palavra
    // inteira, senão "pausa" casaria dentro de qualquer coisa.
    return termo.includes(" ")
      ? t.includes(termo)
      : new RegExp(`(^|\\s)${termo}(\\s|$)`).test(t);
  });
}

/**
 * Lê a frase contra os anúncios que a loja tem no ar.
 *
 * ── Como o candidato é escolhido ─────────────────────────────────────────
 *
 * Cada palavra da frase que aparece num anúncio vale pontos, e vale MAIS
 * quanto menos anúncios a contiverem. "onix" numa loja com um Onix só vale
 * muito; "hyundai" numa loja que só vende Hyundai não vale nada — e é por
 * isso que não é só contar palavra igual.
 *
 * ── Quando ele diz "sem dúvida" ──────────────────────────────────────────
 *
 * Só com as três coisas juntas:
 *   1. um único anúncio pontuou, ou o primeiro valeu pelo menos o dobro do
 *      segundo;
 *   2. a palavra que o escolheu é exclusiva dele entre os anúncios da loja;
 *   3. essa palavra não é cor nem palavra de ligação.
 *
 * Fora disso devolve os candidatos e deixa a decisão com gente.
 */
export function entenderPedido(
  texto: string,
  anuncios: AnuncioConhecido[],
): Pedido {
  if (!pedeParaDesligar(texto)) {
    return { intencao: "nenhuma", candidatos: [], semDuvida: false };
  }
  return { intencao: "desligar", ...acharAnuncios(texto, anuncios) };
}

/**
 * Acha os anúncios que combinam com um texto, SEM conferir se ele pede algo.
 *
 * Separado de entenderPedido porque numa mensagem com mais de um carro o
 * verbo aparece uma vez só: em "pausar anúncios mobi 2018 e peugeot 2008",
 * o pedaço "peugeot 2008" não pede nada sozinho. Quem confere o verbo é
 * quem olha a frase inteira; quem acha o carro olha cada pedaço.
 */
function acharAnuncios(
  texto: string,
  anuncios: AnuncioConhecido[],
): { candidatos: AnuncioConhecido[]; semDuvida: boolean } {
  const daFrase = new Set(
    palavras(texto).filter((p) => !PALAVRAS_SEM_FORCA.has(p)),
  );
  if (daFrase.size === 0 || anuncios.length === 0) {
    return { candidatos: [], semDuvida: false };
  }

  const porAnuncio = anuncios.map((a) => ({
    anuncio: a,
    palavras: palavrasDoAnuncio(a),
  }));

  // Em quantos anúncios cada palavra aparece. É o que separa "onix" de
  // "hyundai" numa loja só de Hyundai.
  const emQuantos = new Map<string, number>();
  for (const { palavras: ps } of porAnuncio) {
    for (const p of ps) emQuantos.set(p, (emQuantos.get(p) ?? 0) + 1);
  }

  const notas = porAnuncio.map(({ anuncio, palavras: ps }) => {
    let nota = 0;
    let temExclusiva = false;
    for (const p of daFrase) {
      if (!ps.has(p)) continue;
      const quantos = emQuantos.get(p) ?? 1;
      nota += 1 / quantos;
      if (quantos === 1) temExclusiva = true;
    }
    return { anuncio, nota, temExclusiva };
  });

  const comNota = notas
    .filter((n) => n.nota > 0)
    .sort((a, b) => b.nota - a.nota);

  if (comNota.length === 0) {
    return { candidatos: [], semDuvida: false };
  }

  const primeiro = comNota[0];
  const segundo = comNota[1];
  const folga = !segundo || primeiro.nota >= segundo.nota * 2;

  return {
    candidatos: comNota.map((n) => n.anuncio),
    semDuvida: folga && primeiro.temExclusiva,
  };
}

// ─────────────────── Mais de um carro na mesma mensagem ───────────────────
//
// ── Por que isto precisou existir ────────────────────────────────────────
//
// Porque é como as pessoas escrevem. O primeiro pedido de verdade que o
// Guilherme mandou foi "pausar anúncios mobi 2018 e peugeot 2008" — dois
// carros numa frase só. O entendimento antigo procurava UM anúncio na frase
// inteira, então as palavras dos dois carros competiam entre si: nenhum
// ganhava com folga, e o robô acabava perguntando "qual desses?" numa
// mensagem que já dizia exatamente quais.
//
// ── Como o corte é feito ─────────────────────────────────────────────────
//
// Por " e ", vírgula, ponto-e-vírgula, "+" e quebra de linha. São os
// separadores que aparecem em lista escrita à mão, e nenhum deles aparece no
// meio do nome de um carro.
//
// O verbo é conferido UMA vez, na frase toda: em "pausar X e Y", o pedaço
// "Y" não pede nada sozinho.
//
// ── Por que pedaço sem resultado é ignorado ──────────────────────────────
//
// Porque "vendeu o Compass, pode tirar" vira dois pedaços, e o segundo é só
// verbo. Tratá-lo como "carro não encontrado" faria o robô avisar a equipe
// sobre um carro que ninguém mencionou. Só quando NENHUM pedaço acha nada é
// que o pedido de fato não casou com anúncio nenhum.

/** O que fazer com um carro citado na mensagem. */
export interface AlvoDoPedido {
  /** O pedaço da frase que gerou isto, pra poder mostrar a quem perguntou. */
  trecho: string;
  candidatos: AnuncioConhecido[];
  semDuvida: boolean;
}

export interface PedidoComVarios {
  intencao: Intencao;
  /** Um por carro citado que achou alguma coisa. Vazio = nada casou. */
  alvos: AlvoDoPedido[];
}

const SEPARADORES = /\s+e\s+|\s*[,;+]\s*|\n+/i;

export function entenderPedidoComVarios(
  texto: string,
  anuncios: AnuncioConhecido[],
): PedidoComVarios {
  if (!pedeParaDesligar(texto)) return { intencao: "nenhuma", alvos: [] };

  const pedacos = texto
    .split(SEPARADORES)
    .map((p) => p.trim())
    .filter(Boolean);

  const alvos: AlvoDoPedido[] = [];
  const jaVistos = new Set<string>();

  for (const pedaco of pedacos) {
    const r = acharAnuncios(pedaco, anuncios);
    if (r.candidatos.length === 0) continue;

    // O mesmo anúncio citado em dois pedaços é um anúncio só. Sem isto,
    // "tira o Onix, o Onix branco" tentaria desligar duas vezes.
    const chave = r.candidatos[0].adId;
    if (r.semDuvida && jaVistos.has(chave)) continue;
    if (r.semDuvida) jaVistos.add(chave);

    alvos.push({ trecho: pedaco, ...r });
  }

  // Nenhum pedaço achou nada: é a frase inteira que não casou com anúncio
  // nenhum, e quem chamou trata como "não está anunciado".
  if (alvos.length === 0) return { intencao: "desligar", alvos: [] };

  // Um pedaço só, e ele achou: é o caso comum e nada muda.
  return { intencao: "desligar", alvos };
}
