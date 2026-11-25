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

/** O que a leitura de um pedaço de frase devolve. */
export interface Achado {
  /** Os anúncios que a frase pode estar citando, do mais provável ao menos. */
  candidatos: AnuncioConhecido[];
  /**
   * `true` só quando UM carro ganhou com folga, por palavra que é dele e de
   * mais ninguém, e essa palavra está no NOME do anúncio.
   */
  semDuvida: boolean;
  /**
   * Os anúncios do carro que ganhou — mais de um quando a loja anunciou o
   * mesmo carro duas vezes. É esta lista que se desliga, não só o primeiro:
   * tirar um e deixar o outro é deixar o carro vendido no ar.
   */
  mesmoCarro: AnuncioConhecido[];
  /** Quando não há folga: os anúncios dos carros empatados no topo (casados pelo nome). Ver acharAnuncios. */
  empatados?: AnuncioConhecido[];
}

export interface Pedido extends Achado {
  intencao: Intencao;
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
  // Quem VENDEU escreve na primeira pessoa: "vendi o Virtus", "vendemos o
  // Compass". Sem estes, o aviso mais natural de todos passava batido.
  "vendi",
  "vendemos",
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
  "nao vendi",
  "nao vendemos",
  "nem vendi",
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
  // marcas de versão do anúncio, não do carro: a loja duplica o anúncio e
  // acrescenta isto ao nome
  "copia", "video",
  // os próprios verbos do pedido
  ...PEDIDOS_DE_DESLIGAR.flatMap((p) => p.split(" ")),
]);

/** A palavra não distingue carro nenhum (ligação, cor, verbo do pedido…). */
export function palavraSemForca(p: string): boolean {
  return PALAVRAS_SEM_FORCA.has(p);
}

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

/** Só as palavras do NOME — é o nome que identifica o carro. */
function palavrasDoNome(a: AnuncioConhecido): Set<string> {
  return new Set(palavras(a.nome).filter((p) => !PALAVRAS_SEM_FORCA.has(p)));
}

/** Ano, cilindrada, versão. Não identifica carro nenhum sozinho. */
function soNumero(p: string): boolean {
  return /^\d+$/.test(p);
}

/**
 * O nome do anúncio sem o que a loja acrescenta ao duplicar.
 *
 * ── Por que isto existe ──────────────────────────────────────────────────
 *
 * Porque a loja anuncia o mesmo carro mais de uma vez. Na R2, no dia em que
 * isto foi escrito, estavam no ar ao mesmo tempo:
 *
 *   FORD KA 1.0 – 2016 —
 *   FORD KA 1.0 – 2016 — Cópia
 *
 * São dois anúncios do MESMO Ka. Isso estragava duas coisas de uma vez.
 *
 * A primeira: "ka" aparecia em dois anúncios, então não era palavra exclusiva
 * de ninguém — e exclusividade é o que autoriza desligar sem perguntar. Numa
 * loja cheia de duplicatas, NENHUMA palavra era exclusiva, e o robô não tinha
 * certeza de nada nunca. Era isto, mais que qualquer outra coisa, que o
 * deixava preso em "qual desses?".
 *
 * A segunda: mesmo acertando, desligar um só deixaria o carro vendido no ar
 * pelo outro anúncio.
 *
 * Com o nome normalizado, os dois viram um carro: a palavra volta a ser
 * exclusiva, e quando o robô age ele tira os dois do ar juntos.
 */
export function nomeNormalizado(nome: string): string {
  // "CONJUNTO — Foto 3" (nome montado pra anúncio de nome genérico, ver nome-do-anuncio.ts): o carro é o conjunto, e a parte
  // depois do "—" (formato e número da variação) não separa carro nenhum.
  const corte = nome.lastIndexOf(" — ");
  if (corte > 0) {
    const depois = achatar(nome.slice(corte + 3)).split(" ").filter(Boolean);
    if (depois.length > 0 && depois.every((p) => PALAVRAS_DE_FORMATO.has(p) || /^v?\d{1,2}$/.test(p))) return nomeNormalizado(nome.slice(0, corte));
  }
  // Sem as palavras de FORMATO: "PULSE AUDACE Stories" e "PULSE AUDACE Video" são o mesmo carro.
  const sobra = achatar(nome)
    .split(" ")
    .filter((p) => p && !PALAVRAS_DE_FORMATO.has(p))
    .join(" ")
    .trim();
  return sobra || achatar(nome);
}

/** Palavras que dizem o formato/variação do anúncio, não o carro. */
export const PALAVRAS_DE_FORMATO = new Set([
  "stories", "story", "storie", "feed", "reels", "reel", "video", "videos", "foto", "fotos", "imagem", "imagens", "img",
  "carrossel", "carousel", "copia", "copy", "anuncio", "anuncios", "ad", "ads", "criativo", "criativos",
  "estatico", "estatica", "vertical", "horizontal", "quadrado", "quadrada",
]);


// ─────────────── O nome do anúncio colado inteiro na mensagem ───────────────
//
// ── Por que isto existe ──────────────────────────────────────────────────
//
// O Guilherme copia o nome do anúncio direto do Gerenciador e cola pro robô:
//
//   Peugeot 2008 1.6 16v Flex griffe
//   peugeot 2008 griffe 1.6 automático - 2017 - cópia
//   Desativar esses anúncios da R2
//
// Isso é o pedido mais claro que existe: o nome INTEIRO de dois anúncios. Mas a
// leitura por palavras soltas tratava como busca vaga: "16v" casava com o Nissan
// March, "flex" com o Renegade, e os dois Peugeot (que são anúncios diferentes, com
// nomes diferentes) empatavam entre si. Resultado: "Qual destes?" com quatro carros,
// dois deles sem nada a ver. O robô "não entendia nada".
//
// Quando o nome inteiro de um anúncio está na mensagem, não há o que adivinhar.
//
// ── Os limites ───────────────────────────────────────────────────────────
//
//   - Só vale nome com pelo menos 3 palavras de verdade (sem ligação, cor, "cópia"):
//     "Gol" ou "Versa foto" aparecendo numa frase não é o anúncio inteiro, é uma
//     palavra que a pessoa usou, e essa continua na leitura de sempre.
//   - Palavra inteira: "onix lt 2023" não casa dentro de "onix lt 20231".
//   - Se um nome está dentro de outro, vale o mais comprido, e o trecho é consumido
//     (o nome curto não conta de novo dentro do longo).
//   - O mesmo carro (nome igual sem "cópia"/"vídeo") leva junto todos os anúncios dele.

const MIN_PALAVRAS_DO_NOME = 3;

/** Minúsculas e sem acento, mas COM pontuação e quebras de linha (pra poder cortar o texto). */
function leve(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Um nome de anúncio como expressão: as palavras, com qualquer pontuação no meio. */
function expressaoDoNome(nome: string): RegExp | null {
  const toks = achatar(nome).split(" ").filter(Boolean);
  if (toks.filter((t) => t.length >= 2 && !PALAVRAS_SEM_FORCA.has(t)).length < MIN_PALAVRAS_DO_NOME) return null;
  // "copia" e "video" no fim do nome não são do carro: o texto pode ter ou não.
  const corpo = toks.map((t) => t.replace(/[^a-z0-9]/g, "")).filter(Boolean).join("[^a-z0-9]+");
  return new RegExp(`(?<![a-z0-9])${corpo}(?![a-z0-9])`);
}

export interface AchadoPeloNome {
  /** Um por carro (nome normalizado). */
  carros: { trecho: string; anuncios: AnuncioConhecido[] }[];
  /** A mensagem sem os nomes encontrados, pra o resto seguir na leitura de sempre. */
  resto: string;
}

/** Procura, na mensagem, o NOME INTEIRO de anúncios. Ver o comentário acima. */
export function acharPeloNomeCompleto(texto: string, anuncios: AnuncioConhecido[]): AchadoPeloNome {
  let resto = leve(texto);
  const carros = new Map<string, { trecho: string; anuncios: AnuncioConhecido[] }>();

  // Os nomes mais compridos primeiro: ele consome o trecho e o nome curto não conta de novo.
  const candidatos = anuncios
    .map((a) => ({ a, re: expressaoDoNome(a.nome), tam: achatar(a.nome).length }))
    .filter((x): x is { a: AnuncioConhecido; re: RegExp; tam: number } => x.re !== null)
    .sort((x, y) => y.tam - x.tam);

  for (const { a, re } of candidatos) {
    const m = re.exec(resto);
    if (!m) continue;
    resto = resto.slice(0, m.index) + "\n" + resto.slice(m.index + m[0].length);
    const chave = nomeNormalizado(a.nome);
    if (!carros.has(chave)) {
      carros.set(chave, {
        trecho: m[0],
        anuncios: anuncios.filter((x) => nomeNormalizado(x.nome) === chave),
      });
    }
  }
  return { carros: [...carros.values()], resto };
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
 * A frase AVISA uma venda? ("vendeu o Virtus", "vendemos o Compass")
 *
 * Mais estreito que pedeParaDesligar, que também aceita "pode tirar" e "saiu":
 * tirar um anúncio do ar não é vender o carro, e registrar venda por causa de um
 * "pode pausar" encheria o controle de vendas que não aconteceram.
 *
 * Os mesmos filtros de sempre valem: pergunta ("vendeu o Virtus?") e negação
 * ("ainda não vendeu", "se vender") não são aviso.
 */
export function pedeVenda(texto: string): boolean {
  if (texto.trim().endsWith("?")) return false;
  const t = achatar(texto);
  if (DESMENTIDOS.some((d) => t.includes(achatar(d)))) return false;
  return /(^|\s)(vendeu|vendi|vendemos|vendido|vendida)(\s|$)/.test(t);
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
    return {
      intencao: "nenhuma",
      candidatos: [],
      semDuvida: false,
      mesmoCarro: [],
    };
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
): Achado {
  // O nome inteiro de um anúncio na frase: não há o que adivinhar.
  const pelNome = acharPeloNomeCompleto(texto, anuncios).carros;
  if (pelNome.length === 1) {
    return { candidatos: pelNome[0].anuncios, semDuvida: true, mesmoCarro: pelNome[0].anuncios };
  }

  const daFrase = new Set(
    palavras(texto).filter((p) => !PALAVRAS_SEM_FORCA.has(p)),
  );
  if (daFrase.size === 0 || anuncios.length === 0) {
    return { candidatos: [], semDuvida: false, mesmoCarro: [] };
  }

  const porAnuncio = anuncios.map((a) => ({
    anuncio: a,
    carro: nomeNormalizado(a.nome),
    noNome: palavrasDoNome(a),
    todas: palavrasDoAnuncio(a),
  }));

  // ── Raridade contada por CARRO, não por anúncio ───────────────────────
  //
  // É o que separa "onix" de "hyundai" numa loja só de Hyundai. Mas contar
  // por anúncio fazia a loja com duplicata nunca ter palavra exclusiva — ver
  // nomeNormalizado. Agora os dois anúncios do mesmo Ka contam um Ka.
  const carrosComAPalavra = new Map<string, Set<string>>();
  for (const { carro, todas } of porAnuncio) {
    for (const p of todas) {
      let onde = carrosComAPalavra.get(p);
      if (!onde) {
        onde = new Set();
        carrosComAPalavra.set(p, onde);
      }
      onde.add(carro);
    }
  }
  const emQuantosCarros = (p: string) => carrosComAPalavra.get(p)?.size ?? 1;

  // ── O nome vale mais que a legenda ────────────────────────────────────
  //
  // Porque a legenda é texto de venda, e texto de venda fala de outros
  // carros. Na R2, o anúncio chamado "cruze 2014" tem "Virtus" escrito na
  // legenda — e com legenda valendo igual ao nome ele aparecia como primeiro
  // candidato de "tira o virtus", na frente dos dois Virtus de verdade.
  const PESO_DA_LEGENDA = 0.25;

  const notas = porAnuncio.map(({ anuncio, carro, noNome, todas }) => {
    let nota = 0;
    let forteNoNome = false;
    let forteNaLegenda = false;
    let exclusiva = false;
    for (const p of daFrase) {
      const estaNoNome = noNome.has(p);
      const estaNaLegenda = !estaNoNome && todas.has(p);
      if (!estaNoNome && !estaNaLegenda) continue;

      const carros = emQuantosCarros(p);
      nota += (estaNoNome ? 1 : PESO_DA_LEGENDA) / carros;

      // ── Número não identifica carro ─────────────────────────────────────
      //
      // "pausar os anúncios do mobi 2018": a R2 não tem Mobi nenhum no ar, e
      // "2018" casou com o Argo 2018, o Renegade 2018 e o Civic 2018. O robô
      // devolveu três carros que ninguém pediu, não teve certeza de nenhum, e
      // o Mobi — que era o assunto — não existia pra ele.
      //
      // Agora o número continua pontuando (é ele que separa o Virtus 2021 do
      // Virtus 2020), mas não qualifica ninguém sozinho: sem uma palavra de
      // verdade em comum, o anúncio não é candidato. "mobi 2018" volta a ser
      // "esse carro não está no ar" — que é a verdade e é o que interessa.
      if (soNumero(p)) continue;
      // Palavra de FORMATO ("stories", "video", "feed") não identifica carro: todo carro tem anúncio assim. Pontua, mas não
      // qualifica ninguém — "pausa stories video feed" sem carro não pode pausar os anúncios de formato da loja inteira.
      if (PALAVRAS_DE_FORMATO.has(p)) continue;
      if (estaNoNome) forteNoNome = true;
      else forteNaLegenda = true;
    }
    return { anuncio, carro, nota, forteNoNome, forteNaLegenda };
  });

  let comNota = notas.filter(
    (n) => n.nota > 0 && (n.forteNoNome || n.forteNaLegenda),
  );
  // Se alguém casou pelo nome, quem casou só pela legenda sai da frente: ele
  // sobraria pra engordar a pergunta "qual desses?" com o carro errado.
  if (comNota.some((n) => n.forteNoNome)) {
    comNota = comNota.filter((n) => n.forteNoNome);
  }
  comNota.sort((a, b) => b.nota - a.nota);

  if (comNota.length === 0) {
    return { candidatos: [], semDuvida: false, mesmoCarro: [] };
  }

  const primeiro = comNota[0];
  // Os anúncios do MESMO carro que o primeiro — eles não competem com ele,
  // eles vão junto com ele.
  const mesmoCarro = comNota.filter((n) => n.carro === primeiro.carro);
  const concorrentes = comNota.filter((n) => n.carro !== primeiro.carro);
  const folga = concorrentes.length === 0 || primeiro.nota >= concorrentes[0].nota * 2;

  // ── O que autoriza desligar sem perguntar ─────────────────────────────
  //
  // Duas coisas, e as duas precisam ser verdade:
  //
  //   1. FOLGA: o carro que ganhou valeu pelo menos o dobro do segundo carro
  //      diferente. Dois Duster empatados não têm folga, e aí o robô pergunta.
  //   2. A palavra que o escolheu não é número, e está no NOME do anúncio.
  //
  // Antes havia uma terceira: a palavra tinha que ser exclusiva daquele carro
  // na loja. Ela saiu porque reprovava o caso mais claro que existe — "vendeu
  // o Virtus 2021" numa loja com dois Virtus. "virtus" não é exclusiva de
  // nenhum dos dois, e era o ANO que resolvia a frase; mas ano não contava
  // como palavra, então o robô perguntava "Virtus 2021 ou Virtus 2020?" pra
  // quem acabou de escrever 2021.
  //
  // A folga já é a medida de dúvida, e é melhor medida: ela olha o resultado
  // da frase inteira em vez de uma palavra só. Com os dois Virtus empatados
  // em "do virtus" não há folga e ele pergunta; com "virtus 2021" o ano
  // desempata em três por um e ele age.
  return {
    candidatos: [...mesmoCarro, ...concorrentes].map((n) => n.anuncio),
    semDuvida: folga && primeiro.forteNoNome,
    mesmoCarro: mesmoCarro.map((n) => n.anuncio),
    // Sem folga: os carros EMPATADOS no topo (nenhum vale o dobro do outro), todos pelo nome. Quem pede pra pausar "o Virtus"
    // numa loja com dois Virtus quer os dois fora — o robô pausa e avisa, não pergunta.
    empatados: comNota.filter((n) => n.forteNoNome && n.nota * 2 > primeiro.nota).map((n) => n.anuncio),
  };
}

/**
 * Acha os anúncios de um carro pelo que a pessoa escreveu — SEM conferir se a
 * frase pede alguma coisa.
 *
 * É a mesma busca que o grupo usa pra desligar, aberta pra quem só quer
 * encontrar o carro: "quanto gastou o Mobi 2018" não tem verbo de desligar e não
 * deve ter. Reaproveitar a busca, em vez de escrever outra, é o que garante que
 * "Virtus" quer dizer a mesma coisa quando se pausa e quando se pergunta o gasto.
 */
export function acharCarro(
  texto: string,
  anuncios: AnuncioConhecido[],
): Achado {
  return acharAnuncios(texto, anuncios);
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
export interface AlvoDoPedido extends Achado {
  /** O pedaço da frase que gerou isto, pra poder mostrar a quem perguntou. */
  trecho: string;
}

/**
 * Uma palavra do pedido que não existe nos anúncios, mas se parece com uma
 * que existe — quase sempre um erro de digitação ou de autocorretor.
 */
export interface Sugestao {
  /** A palavra como veio escrita, sem acento e em minúsculas. */
  digitado: string;
  /** A palavra do anúncio que ela provavelmente queria ser. */
  quis: string;
  /** Os anúncios que têm essa palavra no nome. */
  anuncios: AnuncioConhecido[];
}

export interface PedidoComVarios {
  intencao: Intencao;
  /** Um por carro citado que achou alguma coisa. Vazio = nada casou. */
  alvos: AlvoDoPedido[];
  /** Palavras que não existem mas lembram uma que existe. */
  sugestoes: Sugestao[];
}

// ─────────────────────────── "Quis dizer…?" ───────────────────────────────
//
// ── Por que isto existe ──────────────────────────────────────────────────
//
// O Guilherme pediu pra pausar o Virtus e o celular (o autocorretor) escreveu
// "virtual". "Virtual" não existe em nenhum anúncio, então o pedaço não achou
// nada e o robô respondeu o caso de "esse carro não está no ar" — que está
// ERRADO: o carro está no ar, só o nome veio torto. Quem lê isso conclui que
// o robô não conhece o carro.
//
// O certo é o que uma pessoa faria: "virtual não existe, quis dizer Virtus?".
//
// ── Os limites, que são o que impede isto de virar ruído ─────────────────
//
// Só entra palavra que o anúncio NÃO tem. Se "virtus" está no nome de algum
// anúncio, o pedaço teria achado e nem chegaria aqui.
//
// Palavra de até 3 letras não conta ("gol", "uno", "fit"): perto assim, tudo
// se parece com tudo, e o robô perguntaria "quis dizer Gol?" pra qualquer
// "god" ou "gás".
//
// A primeira letra tem que bater: erro de digitação raramente troca a
// primeira, e exigir isso corta boa parte dos falsos positivos.
//
// E a distância aceita cresce com o tamanho da palavra: 1 troca até 6 letras,
// 2 até 9, 3 de 10 em diante. "virtual" → "virtus" são 2 trocas em 7 letras.
// Com as 4 primeiras letras iguais aceita até 2 mesmo em palavra curta:
// "virtal" → "virtus".
//
// Pergunta errada custa uma linha no grupo. Pergunta nenhuma, no caso do
// Virtus, custou o pedido inteiro — e a confiança de quem mandou.

/** Distância de edição, contando a troca de letras vizinhas como UMA
 *  ("virtsu" é um erro só, não dois). */
export function distancia(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [
    i,
    ...Array<number>(n).fill(0),
  ]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/** Quantas letras do começo as duas palavras têm em comum. */
function prefixoComum(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function limiteDeErros(tamanho: number): number {
  if (tamanho <= 6) return 1;
  if (tamanho <= 9) return 2;
  return 3;
}

/**
 * Palavras do pedaço que não existem nos anúncios mas lembram uma que existe.
 *
 * Devolve no máximo uma sugestão por palavra digitada, a mais próxima — e
 * nunca a própria palavra, nem número, nem palavra sem força.
 */
export function sugerirNomes(
  pedaco: string,
  anuncios: AnuncioConhecido[],
): Sugestao[] {
  // O vocabulário são os NOMES dos anúncios — é com o nome que a pessoa fala.
  const vocabulario = new Map<string, AnuncioConhecido[]>();
  for (const a of anuncios) {
    for (const p of palavrasDoNome(a)) {
      if (p.length < 4 || soNumero(p)) continue;
      const lista = vocabulario.get(p) ?? [];
      lista.push(a);
      vocabulario.set(p, lista);
    }
  }
  if (vocabulario.size === 0) return [];

  // Também conta como "existe" o que aparece na legenda: se a pessoa escreveu
  // uma palavra que o anúncio realmente tem, não é erro de digitação.
  const existentes = new Set<string>();
  for (const a of anuncios) for (const p of palavrasDoAnuncio(a)) existentes.add(p);

  const achadas: Sugestao[] = [];
  for (const digitada of new Set(palavras(pedaco))) {
    if (digitada.length < 4) continue;
    if (soNumero(digitada) || PALAVRAS_SEM_FORCA.has(digitada)) continue;
    if (existentes.has(digitada)) continue;

    let melhor: { palavra: string; erros: number } | null = null;
    for (const palavra of vocabulario.keys()) {
      if (palavra[0] !== digitada[0]) continue;
      const erros = distancia(digitada, palavra);
      if (erros === 0) continue;
      // Dentro do limite do tamanho — ou, num meio-termo, até 2 erros quando
      // as 4 primeiras letras batem: "virtal" tem 2 letras erradas em 6, mas
      // começar com "virt" é evidência forte de que era "virtus".
      const noLimite = erros <= limiteDeErros(Math.max(digitada.length, palavra.length));
      const comecoIgual = erros <= 2 && prefixoComum(digitada, palavra) >= 4;
      if (!noLimite && !comecoIgual) continue;
      if (!melhor || erros < melhor.erros) melhor = { palavra, erros };
    }
    if (melhor) {
      achadas.push({
        digitado: digitada,
        quis: melhor.palavra,
        anuncios: vocabulario.get(melhor.palavra) ?? [],
      });
    }
  }
  return achadas;
}

const SEPARADORES = /\s+e\s+|\s*[,;+]\s*|\n+/i;

export function entenderPedidoComVarios(
  texto: string,
  anuncios: AnuncioConhecido[],
): PedidoComVarios {
  if (!pedeParaDesligar(texto)) {
    return { intencao: "nenhuma", alvos: [], sugestoes: [] };
  }

  // Nomes de anúncio colados inteiros (um ou vários, em linhas ou na mesma): valem primeiro.
  const pelNome = acharPeloNomeCompleto(texto, anuncios);

  const pedacos = pelNome.resto
    .split(SEPARADORES)
    .map((p) => p.trim())
    .filter(Boolean);

  const alvos: AlvoDoPedido[] = pelNome.carros.map((c) => ({
    trecho: c.trecho,
    candidatos: c.anuncios,
    semDuvida: true,
    mesmoCarro: c.anuncios,
  }));
  const sugestoes: Sugestao[] = [];
  const jaVistos = new Set<string>(pelNome.carros.map((c) => nomeNormalizado(c.anuncios[0].nome)));

  for (const pedaco of pedacos) {
    const r = acharAnuncios(pedaco, anuncios);
    if (r.candidatos.length === 0) {
      // Pedaço que não achou nada: se tem uma palavra que lembra um carro
      // anunciado, vira pergunta em vez de silêncio. Ver sugerirNomes.
      for (const sug of sugerirNomes(pedaco, anuncios)) {
        if (!sugestoes.some((x) => x.quis === sug.quis)) sugestoes.push(sug);
      }
      continue;
    }

    // O mesmo CARRO citado em dois pedaços é um carro só. Sem isto, "tira o
    // Onix, o Onix branco" tentaria desligar duas vezes — e por carro, não
    // por anúncio, porque o Ka duplicado tem dois adId e é um Ka.
    const chave = nomeNormalizado(r.candidatos[0].nome);
    if (r.semDuvida && jaVistos.has(chave)) continue;
    if (r.semDuvida) jaVistos.add(chave);

    alvos.push({ trecho: pedaco, ...r });
  }

  // Não pergunta "quis dizer Virtus?" quando o Virtus já está entre os alvos:
  // "pausar virtual e virtus 2021" tirou o 2021, e perguntar do Virtus depois
  // disso seria ruído — o carro já saiu.
  const jaEntre = new Set(
    alvos.flatMap((a) => a.candidatos.map((c) => c.adId)),
  );
  const faltam = sugestoes.filter((sg) =>
    sg.anuncios.some((a) => !jaEntre.has(a.adId)),
  );

  // Nenhum pedaço achou nada: é a frase inteira que não casou com anúncio
  // nenhum, e quem chamou trata como "não está anunciado" — a menos que haja
  // sugestão, e aí trata como erro de digitação.
  if (alvos.length === 0) {
    return { intencao: "desligar", alvos: [], sugestoes: faltam };
  }

  // Um pedaço só, e ele achou: é o caso comum e nada muda.
  return { intencao: "desligar", alvos, sugestoes: faltam };
}
