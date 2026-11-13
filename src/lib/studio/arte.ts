import "server-only";

import sharp from "sharp";

// Os layouts moram em ./layouts porque a TELA precisa deles pra montar o
// seletor — e este arquivo é `server-only` (usa sharp). Reexportados aqui
// pra quem já importava daqui não precisar saber da divisão.
export { LAYOUTS, layoutDaLoja, type Layout } from "./layouts";

// As regras da arte de veículo — sem JSX, pra poderem ser testadas sozinhas.
//
// O desenho em si mora em src/app/api/studio/arte/[id]/route.tsx, porque é lá
// que o Satori transforma JSX em PNG. Aqui ficam as decisões que não
// dependem de pixel: o que escrever, em que formato, e o que fazer com a foto
// que a loja mandou.

/** Os dois recortes. Um registro de arte gera os dois. */
export const FORMATOS = {
  feed: { largura: 1080, altura: 1080 },
  story: { largura: 1080, altura: 1920 },
} as const;

export type Formato = keyof typeof FORMATOS;

export function formatoValido(v: string | null): v is Formato {
  return v === "feed" || v === "story";
}

// ─────────────────────────── A foto do carro ────────────────────────────

/**
 * O maior lado da foto depois de reduzida.
 *
 * 1600 e não o original: a foto sai de um celular com 4000 pixels de largura
 * e 5 MB. Na arte ela aparece com 1080 no máximo, então tudo acima disso é
 * peso que ninguém vê — e esse peso vai pro banco, pro backup e pra memória
 * da função que desenha.
 *
 * Também não é 1080 na régua: guardar com alguma folga permite recortar e
 * reenquadrar depois sem a imagem esfarelar.
 */
const LADO_MAXIMO = 1600;

/**
 * Qualidade do JPEG guardado.
 *
 * 82 é onde a diferença para de ser visível em foto de carro e o arquivo cai
 * pra um quinto. Acima disso só engorda o banco.
 */
const QUALIDADE = 82;

/** Acima disto a foto é recusada antes de qualquer processamento. */
export const FOTO_MAX_BYTES = 12 * 1024 * 1024;

export interface FotoPronta {
  dataUri: string;
  largura: number;
  altura: number;
  bytes: number;
}

/**
 * Prepara a foto que a loja mandou.
 *
 * Três coisas, nesta ordem, e todas importam:
 *
 * 1. **Reduz.** Pelo motivo acima.
 * 2. **Achata pra JPEG.** PNG de foto de carro é três vezes maior sem ganho
 *    nenhum, e foto de carro não tem transparência pra preservar.
 * 3. **Apaga os metadados.** Foto de celular carrega GPS. A foto vai parar no
 *    banco e, pela arte, no Instagram da loja — mandar junto a coordenada do
 *    pátio (ou da casa de quem fotografou) é vazamento que ninguém pediu.
 *    O `rotate()` sem argumento é o que aplica a orientação do EXIF ANTES de
 *    jogá-lo fora: sem ele, a foto tirada de pé chega deitada.
 */
export async function prepararFoto(bytes: Buffer): Promise<FotoPronta> {
  const img = sharp(bytes, { failOn: "none" }).rotate();

  const saida = await img
    .resize({
      width: LADO_MAXIMO,
      height: LADO_MAXIMO,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: QUALIDADE, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  return {
    dataUri: `data:image/jpeg;base64,${saida.data.toString("base64")}`,
    largura: saida.info.width,
    altura: saida.info.height,
    bytes: saida.data.byteLength,
  };
}

/**
 * Prepara a LOGO da loja, que não é a mesma coisa que a foto do carro.
 *
 * A diferença é a transparência, e ela importa muito aqui: a logo vai em
 * cima da foto de um carro. Achatada pra JPEG, ela chega com o retângulo de
 * fundo junto — um quadrado branco ou preto no canto da arte, que é
 * exatamente a cara de peça montada às pressas.
 *
 * Então PNG, com o canal alfa preservado. Custa mais bytes que um JPEG, e
 * aqui vale: é uma imagem por loja, não uma por carro.
 *
 * A altura é a régua, não a largura: na arte a logo é posicionada por altura
 * (78 ou 96 pontos), e logo larga e baixa precisa de mais pixels na
 * horizontal pra chegar nítida.
 */
const ALTURA_DA_LOGO = 400;

export async function prepararLogo(bytes: Buffer): Promise<FotoPronta> {
  const saida = await sharp(bytes, { failOn: "none" })
    .rotate()
    .resize({ height: ALTURA_DA_LOGO, fit: "inside", withoutEnlargement: true })
    // Sem `palette: true`.
    //
    // Paleta reduz o PNG a 256 cores, e numa logo chapada (branco e dourado)
    // isso é invisível e economiza bytes. Mas logo com degradê — e muita
    // concessionária tem — sairia com faixas, do tipo que se vê de longe
    // numa arte. É uma imagem POR LOJA: economizar aqui não paga o risco de
    // entregar a marca de alguém esfarelada.
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });

  return {
    dataUri: `data:image/png;base64,${saida.data.toString("base64")}`,
    largura: saida.info.width,
    altura: saida.info.height,
    bytes: saida.data.byteLength,
  };
}

// ─────────────────────────── O enquadramento ────────────────────────────
//
// ── O problema, medido ───────────────────────────────────────────────────
//
// A foto de um carro vem deitada: 1254×780 é típico, proporção 1,61. A arte
// de feed é quadrada e a de Stories é 0,56. Mandar "preencha o quadro" faz
// o navegador cortar as laterais a partir do CENTRO, e a conta é cruel:
//
//   feed   sobra 62% da imagem — perde 38%
//   story  sobra 35% da imagem — perde 65%
//
// Com 65% fora não existe recorte que salve: o carro perde a frente, a
// traseira, ou as duas. Foi exatamente o que apareceu na primeira peça
// gerada com foto de verdade, e foi o Guilherme quem viu.
//
// ── As duas regras ───────────────────────────────────────────────────────
//
// 1. Quando a perda é tolerável, cortar pelo que IMPORTA e não pelo centro.
//    O `attention` do sharp procura a região de maior saliência — num pátio,
//    o carro. Custa uma passada a mais e acerta muito mais que o centro.
//
// 2. Quando a perda passa do limite, NÃO cortar. A foto inteira entra, e o
//    que sobra de moldura é preenchido com uma cópia ampliada e borrada
//    dela mesma. É o que arte boa faz quando a proporção não bate: parece
//    decisão, enquanto faixa preta parece erro e carro decepado parece
//    descuido.

/**
 * Quanto da imagem se pode perder antes de valer mais não cortar.
 *
 * ── Por que 45%, e não menos ─────────────────────────────────────────────
 *
 * O número saiu de olhar as artes reais da equipe e de comparar os dois
 * recortes lado a lado numa foto de verdade.
 *
 * Nas artes de FEED da casa o carro é cortado sim — o Cruze da Redline tem
 * a traseira saindo pela borda esquerda, e fica bom. Foto deitada num
 * quadrado perde 38%, e com o corte por saliência o que se perde é a
 * traseira, enquanto a frente, a grade e a placa ficam inteiras. É o
 * enquadramento que eles mesmos usam.
 *
 * Com 35% de limite, o feed caía no fundo borrado — mais conservador e
 * menos parecido com o que a casa faz.
 *
 * Já o Stories perde 65%. Aí não há recorte que salve: a informação não
 * cabe, e qualquer corte entrega um pedaço de carro.
 *
 * Então 45% separa exatamente os dois casos. Não é um número redondo
 * escolhido no olho: é onde a medida de uma foto real cai de cada lado.
 */
const PERDA_QUE_NAO_VALE = 0.45;

// Uma régua só, e não uma por formato.
//
// Houve uma tentativa de dar ao Stories um limite próprio (12%), porque lá
// o corte decepava o carro. Era remendo no lugar errado: o problema não era
// o limite, era a FOTO OCUPAR A ARTE INTEIRA num quadro de proporção 0,56.
// Nessa proporção nenhuma foto de carro cabe — a de 4:3 perdia 58%, a em pé
// perdia 25%, e as duas acabavam viradas numa tira entre duas faixas
// escuras. Ficou feio em todas.
//
// A correção foi na geometria: no Stories a foto ganhou uma área quase
// quadrada em cima e a informação foi pra um bloco sólido embaixo. Com a
// área em 0,85 as perdas caem pra 36%, 12% e 47% — e a mesma régua de 45%
// decide bem nos três casos.
//
// Fica o padrão: quando um limite precisa de exceção por formato, quase
// sempre o errado é o formato, não o limite.

/** O quanto a cópia de fundo é borrada. Alto o bastante pra não competir. */
const BORRAO = 42;

export interface Enquadrada {
  dataUri: string;
  /** Falso quando a foto entrou inteira sobre um fundo borrado. */
  cortada: boolean;
  /** Quanto da imagem original ficou de fora, de 0 a 1. */
  perda: number;
}

/**
 * Prepara a foto já no formato exato da arte.
 *
 * Feito aqui e não no desenho porque o Satori só sabe "preencher" ou
 * "caber" — ele não tem onde está o carro nem como borrar um fundo. O
 * desenho recebe a imagem pronta e só a coloca.
 */
export async function enquadrar(
  dataUri: string,
  alvoLargura: number,
  alvoAltura: number
): Promise<Enquadrada> {
  const bytes = Buffer.from(dataUri.split(",")[1] ?? "", "base64");
  const base = sharp(bytes, { failOn: "none" });
  const info = await base.metadata();

  const origem = (info.width ?? 1) / (info.height ?? 1);
  const alvo = alvoLargura / alvoAltura;
  const sobra = origem > alvo ? alvo / origem : origem / alvo;
  const perda = 1 - sobra;

  if (perda <= PERDA_QUE_NAO_VALE) {
    const saida = await sharp(bytes, { failOn: "none" })
      .resize(alvoLargura, alvoAltura, {
        fit: "cover",
        position: sharp.strategy.attention,
      })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    return {
      dataUri: `data:image/jpeg;base64,${saida.toString("base64")}`,
      cortada: true,
      perda,
    };
  }

  // Fundo: a própria foto, ampliada até preencher e borrada. Usar a foto em
  // vez de uma cor chapada mantém a peça na paleta do carro — um Onix
  // branco num pátio claro ganha fundo claro, e não um retângulo preto.
  const fundo = await sharp(bytes, { failOn: "none" })
    .resize(alvoLargura, alvoAltura, { fit: "cover", position: sharp.strategy.attention })
    .blur(BORRAO)
    .modulate({ brightness: 0.55 })
    .toBuffer();

  // A foto inteira, do tamanho que couber dentro do quadro.
  const inteira = await sharp(bytes, { failOn: "none" })
    .resize(alvoLargura, alvoAltura, { fit: "inside", withoutEnlargement: false })
    .toBuffer();

  const saida = await sharp(fundo)
    .composite([{ input: inteira, gravity: "center" }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  return {
    dataUri: `data:image/jpeg;base64,${saida.toString("base64")}`,
    cortada: false,
    perda,
  };
}

// ──────────────────────── O que vai escrito na arte ─────────────────────

/**
 * O preço como a loja escreve na vitrine.
 *
 * Sem centavos de propósito: preço de carro é redondo, e "R$ 89.900,00" numa
 * arte ocupa um terço a mais de largura pra dizer a mesma coisa que
 * "R$ 89.900". Quando há centavos de verdade — o que é raro — eles aparecem.
 */
export function precoDaArte(centavos: number | null | undefined): string | null {
  if (centavos === null || centavos === undefined) return null;
  const temCentavos = centavos % 100 !== 0;
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: temCentavos ? 2 : 0,
    maximumFractionDigits: temCentavos ? 2 : 0,
  });
}

/**
 * Abaixo disto não é carro — é vírgula no lugar errado.
 *
 * Saiu de um caso real: a arte de uma F250 1996 foi gerada com
 * **R$ 169,90**. Quem preencheu digitou "169,90" querendo "169.900", e o
 * sistema obedeceu sem piscar.
 *
 * É o erro de digitação mais provável que existe neste campo, porque as duas
 * formas de escrever preço no Brasil usam os mesmos dois sinais trocados de
 * posição. E é um erro que não dá erro: a arte sai bonita, com o número
 * errado, e vai pro Instagram antes de alguém ler.
 *
 * Mil reais é folgado pra qualquer veículo — até sucata de leilão passa
 * disso. Então nada abaixo disso é preço de verdade.
 */
export const PRECO_MINIMO_DE_VEICULO = 1000_00;

/**
 * O que a pessoa provavelmente quis dizer.
 *
 * Multiplicar por mil é o conserto certo porque o erro é sempre o mesmo:
 * escreveu a vírgula de centavos onde ia o ponto de milhar. "169,90" vira
 * "169.900,00", "72,9" vira "72.900,00".
 *
 * Devolver a sugestão em vez de só recusar muda o recado de "está errado"
 * pra "você quis dizer isto?" — que é a diferença entre a pessoa consertar
 * na hora e a pessoa ficar presa sem saber o que o campo quer.
 */
export function precoQueProvavelmenteQuis(centavos: number): number {
  return centavos * 1000;
}

/**
 * Lê o preço escrito por gente.
 *
 * Aceita "89900", "89.900", "89900,50" e "R$ 89.900,00" — é o que sai de um
 * teclado de celular e de um copiar-e-colar do anúncio da OLX. Devolve null
 * pra vazio e `false` pra entrada que não é número, pra quem chama poder
 * distinguir "não informou" de "escreveu errado".
 */
export function lerPreco(texto: string): number | null | false {
  const limpo = texto.trim();
  if (limpo === "") return null;
  const so = limpo.replace(/[R$\s.]/g, "").replace(",", ".");
  const valor = Number(so);
  if (!Number.isFinite(valor) || valor < 0) return false;
  // Dez milhões: barra o zero a mais sem atrapalhar nenhum carro real.
  if (valor > 10_000_000) return false;
  return Math.round(valor * 100);
}

/**
 * A quilometragem como se lê na arte.
 *
 * "45000" vira "45.000 km". Texto que já venha escrito ("0 km", "45 mil") é
 * devolvido como está: a loja às vezes quer escrever do jeito dela, e brigar
 * com isso só faria o campo ser preenchido errado de propósito.
 */
export function kmDaArte(texto: string | null | undefined): string | null {
  const limpo = (texto ?? "").trim();
  if (limpo === "") return null;
  if (/^\d+$/.test(limpo)) {
    return `${Number(limpo).toLocaleString("pt-BR")} km`;
  }
  return limpo;
}

/**
 * A linha de baixo da arte: ano e quilometragem, quando existem.
 *
 * Junta com "·" e some inteira quando não há nenhum dos dois — em vez de
 * deixar um separador solto, que é a marca registrada de arte gerada por
 * máquina.
 */
export function fichaDoVeiculo(ano: string | null, km: string | null): string | null {
  const partes = [ano?.trim(), kmDaArte(km)].filter((p): p is string => !!p && p !== "");
  return partes.length ? partes.join(" · ") : null;
}

/**
 * O corpo da letra do modelo, conforme o nome é comprido.
 *
 * "ONIX" e "COMPASS LONGITUDE 2.0 TURBO DIESEL 4X4" vão no mesmo lugar. Com
 * corpo fixo, ou o curto fica pequeno à toa ou o comprido vaza da arte — e
 * nome de carro cortado num anúncio é erro que o dono da loja vê de longe.
 */
export function corpoDoModelo(modelo: string, formato: Formato): number {
  const n = modelo.trim().length;
  const base = formato === "feed" ? 1 : 1.08;
  const corpo = n <= 12 ? 86 : n <= 20 ? 68 : n <= 30 ? 54 : n <= 42 ? 44 : 36;
  return Math.round(corpo * base);
}

/** Mesma ideia pro preço, que varia de "R$ 19.900" a "R$ 1.890.000". */
export function corpoDoPreco(preco: string, formato: Formato): number {
  const n = preco.length;
  const base = formato === "feed" ? 1 : 1.1;
  const corpo = n <= 9 ? 96 : n <= 11 ? 82 : n <= 13 ? 70 : 58;
  return Math.round(corpo * base);
}

/** Cor em #rgb ou #rrggbb. Vale pra conferir o que a pessoa digitou. */
export const FORMATO_DA_COR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * As cores da loja, com o padrão da casa quando ela não tem marca cadastrada.
 *
 * Nunca devolve cor inválida: o que vem do banco foi validado na hora de
 * salvar, mas uma arte que não desenha porque alguém pôs "azul" no campo da
 * cor seria um defeito bobo e difícil de achar.
 */
export interface Paleta {
  primaria: string;
  fundo: string;
  texto: string;
}

const PADRAO: Paleta = { primaria: "#FFC20E", fundo: "#0A0A0A", texto: "#FFFFFF" };

export function paletaDaLoja(marca: Partial<Paleta> | null | undefined): Paleta {
  const usar = (v: string | undefined, padrao: string) =>
    v && FORMATO_DA_COR.test(v) ? v : padrao;
  return {
    primaria: usar(marca?.primaria, PADRAO.primaria),
    fundo: usar(marca?.fundo, PADRAO.fundo),
    texto: usar(marca?.texto, PADRAO.texto),
  };
}
