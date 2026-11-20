import { achatar } from "@/lib/whatsapp/entender-pedido";

// Ler uma venda escrita num grupo de WhatsApp.
//
// ── O problema ───────────────────────────────────────────────────────────
//
// Pra entrar no Controle de Vendas a venda precisa de DUAS coisas que a frase
// do grupo quase nunca traz juntas: o valor, e se ela veio de lead do anúncio.
//
//   "vendeu o Virtus"                         → nenhuma das duas
//   "vendeu o Virtus por 68 mil"              → só o valor
//   "vendeu o Virtus por 68 mil, foi lead"    → as duas
//
// Este arquivo lê o que a frase TEM. O que falta, o robô pergunta.
//
// ── A regra que o Guilherme deu ──────────────────────────────────────────
//
// "somente de venda por leads". O Controle de Vendas mede o resultado do
// trabalho da agência, e uma venda de balcão (o cliente que entrou na loja, a
// indicação) não é resultado dele — contá-la faria a loja parecer mais bem
// atendida do que está.
//
// Arquivo puro de propósito: sem banco e sem rede, pra testar com frases de
// verdade.

// ──────────────────────────────── O valor ─────────────────────────────────

/** Abaixo disto não é preço de carro: é parcela, é entrada, é outra coisa. */
const VALOR_MINIMO_REAIS = 3_000;
/** Acima disto é erro de digitação ou outra coisa. */
const VALOR_MAXIMO_REAIS = 2_000_000;

function emReais(texto: string): number | null {
  // "68.500,00" → 68500 · "68500,5" → 68500.5 · "68,5" → 68.5
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(texto)) {
    return Number(texto.replace(/\./g, "").replace(",", "."));
  }
  if (/^\d+(,\d+)?$/.test(texto)) return Number(texto.replace(",", "."));
  return null;
}

function dentroDaFaixa(reais: number): boolean {
  return reais >= VALOR_MINIMO_REAIS && reais <= VALOR_MAXIMO_REAIS;
}

/** O que vem depois do número diz que ele NÃO é dinheiro: "45 mil km". */
const NAO_E_DINHEIRO = String.raw`(?!\s*(?:km|quilometro|quilometros|quilometragem))`;

/**
 * O valor da venda escrito na frase, em centavos — ou `null`.
 *
 * `null` é uma resposta, e a certa quando há dúvida: a frase com dois valores
 * ("vendeu por 68 mil, tinha entrado 20 mil de entrada") não tem UM valor de
 * venda, e escolher o primeiro registraria no controle um número que ninguém
 * confirmou. O robô pergunta.
 *
 * Reconhece: "R$ 68.500", "68.500", "68 mil", "68mil", "68k", "68,5 mil",
 * "68500". Descarta: quilometragem ("45 mil km"), ano ("2021"), e qualquer
 * coisa fora da faixa de preço de carro.
 */
export function extrairValorDaVenda(texto: string): number | null {
  const t = achatar(texto).replace(/\s+/g, " ");
  // achatar tira pontuação; o valor precisa dela, então lê do texto cru.
  const cru = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const achados = new Set<number>();
  const guardar = (reais: number | null) => {
    if (reais !== null && dentroDaFaixa(reais)) achados.add(Math.round(reais * 100));
  };

  // 1. Com R$.
  for (const m of cru.matchAll(
    new RegExp(String.raw`r\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)` + NAO_E_DINHEIRO, "g"),
  )) {
    guardar(emReais(m[1]));
  }

  // 2. "68 mil", "68mil", "68k", "68,5 mil".
  for (const m of cru.matchAll(
    new RegExp(String.raw`(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b` + NAO_E_DINHEIRO, "g"),
  )) {
    guardar(Number(m[1].replace(",", ".")) * 1000);
  }

  // 3. "68.500" solto.
  for (const m of cru.matchAll(
    new RegExp(String.raw`(?<![\d.,])(\d{1,3}\.\d{3})(?![\d.,]\d)` + NAO_E_DINHEIRO, "g"),
  )) {
    guardar(emReais(m[1]));
  }

  // 4. "68500" — cinco ou seis dígitos. Ano tem quatro e fica de fora.
  for (const m of cru.matchAll(
    new RegExp(String.raw`(?<![\d.,])(\d{5,6})(?![\d.,]\d)` + NAO_E_DINHEIRO, "g"),
  )) {
    guardar(Number(m[1]));
  }

  void t;
  return achados.size === 1 ? [...achados][0] : null;
}

/**
 * O preço escrito no ANÚNCIO, em centavos — só como dica.
 *
 * Preço de anúncio não é preço de venda: o carro costuma fechar abaixo do pedido.
 * Por isso isto nunca vira o valor da venda sozinho; só aparece na pergunta
 * ("o anúncio estava com R$ 69.900") pra quem responde lembrar do número.
 *
 * Só olha o que vem depois de "R$": é onde o preço está de verdade, e é o que
 * evita confundir com quilometragem e ano no texto do anúncio.
 */
export function precoNoAnuncio(textos: string[]): number | null {
  const achados = new Set<number>();
  for (const texto of textos) {
    const cru = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const m of cru.matchAll(
      new RegExp(String.raw`r\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)` + NAO_E_DINHEIRO, "g"),
    )) {
      const v = emReais(m[1]);
      if (v !== null && dentroDaFaixa(v)) achados.add(Math.round(v * 100));
    }
  }
  return achados.size === 1 ? [...achados][0] : null;
}

// ─────────────────────────────── A origem ─────────────────────────────────

const NAO_VEIO_DO_ANUNCIO = [
  // negação explícita
  /\b(nao|nem)\s+(foi|veio|era|e)\s+(de\s+|do\s+|da\s+)?(lead|leads|anuncio|anuncios|trafego|instagram|propaganda|campanha)\b/,
  /\bfora\s+d[oa]\s+(anuncio|lead|trafego)\b/,
  /\bsem\s+(lead|anuncio)\b/,
  // o que já diz que foi outro caminho
  /\b(balcao|indicacao|indicou|recompra|presencial)\b/,
  /\bcliente\s+antigo\b/,
  /\b(passou|veio|foi|entrou)\s+na\s+loja\b/,
];

const VEIO_DO_ANUNCIO = /\b(lead|leads|anuncio|anuncios|instagram|insta|facebook|trafego|propaganda|campanha)\b/;

/**
 * A venda veio de lead do anúncio?
 *
 *   `true`  — a frase diz que sim ("foi lead", "veio do anúncio")
 *   `false` — a frase diz que não ("foi balcão", "não foi do anúncio")
 *   `null`  — a frase não diz, ou diz as duas coisas (e aí é pra perguntar)
 *
 * "Veio na loja por causa do anúncio" tem os dois sinais. Não dá pra saber qual
 * pesa mais, e chutar contaria no controle uma venda que talvez não seja da
 * agência — ou deixaria de contar uma que é. Pergunta.
 */
export function lerOrigemDaVenda(texto: string): boolean | null {
  const t = achatar(texto);
  const disseNao = NAO_VEIO_DO_ANUNCIO.some((r) => r.test(t));
  const disseSim = VEIO_DO_ANUNCIO.test(t);

  // A negação explícita ("não foi lead") contém a palavra "lead": vale a negação.
  if (NAO_VEIO_DO_ANUNCIO.slice(0, 3).some((r) => r.test(t))) return false;
  if (disseNao && disseSim) return null;
  if (disseNao) return false;
  if (disseSim) return true;
  return null;
}

const SIM = new Set(["sim", "s", "foi", "foi sim", "isso", "isso mesmo", "veio", "veio sim", "foi lead", "positivo", "yes"]);
const NAO = new Set(["nao", "n", "nao foi", "nao veio", "negativo", "foi balcao"]);

export interface RespostaDaPendencia {
  valorCents: number | null;
  origemLead: boolean | null;
}

/**
 * Lê a resposta a "qual o valor e veio de lead?".
 *
 * `faltaSoOrigem` existe porque "sim" sozinho só quer dizer alguma coisa quando a
 * pergunta foi só uma: se o robô perguntou valor E origem, um "sim" não responde
 * nenhuma das duas, e é ignorado.
 */
export function lerRespostaDaPendencia(
  texto: string,
  falta: { valor: boolean; origem: boolean },
): RespostaDaPendencia {
  const valorCents = falta.valor ? extrairValorDaVenda(texto) : null;
  let origemLead = falta.origem ? lerOrigemDaVenda(texto) : null;

  if (falta.origem && origemLead === null && !falta.valor) {
    const t = achatar(texto);
    if (SIM.has(t)) origemLead = true;
    else if (NAO.has(t)) origemLead = false;
  }
  return { valorCents, origemLead };
}

// ─────────────────────────── O que o robô escreve ─────────────────────────

/** "R$ 1.230,00", com espaço comum (o espaço do Intl é inseparável e o WhatsApp o mostra estranho). */
export function dinheiro(cents: number): string {
  return (cents / 100)
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    .replace(/ /g, " ");
}

/** A partir de quantas vendas no mês o robô diz "excepcional". "Acima de 2." */
export const VENDAS_PARA_EXCEPCIONAL = 3;

/**
 * A mensagem de parabéns que vai pro grupo do cliente.
 *
 *   🎉 Parabéns, *Loja*, pela venda!
 *   Valor investido: *R$ 200,00*
 *   Leads: *40*
 *
 * A PRIMEIRA venda do mês não diz que é a primeira (decisão do Guilherme: fica
 * feio). Da segunda em diante o número do mês é dito, e da terceira vem o
 * "excepcional" — palavra forte demais pra gastar à toa.
 *
 * Valor investido e leads vêm em linhas separadas e só quando há dado: "Leads: 0"
 * ou "R$ 0,00" no momento da comemoração seria um número que provavelmente é
 * falta de leitura e não a verdade.
 */
export function textoDeParabens(opcoes: {
  /** O nome da LOJA: quem recebe os parabéns é ela, não "o pessoal". */
  loja: string;
  vendasNoMes: number;
  gastoCents: number;
  /** Quantos leads os anúncios do carro trouxeram. */
  leads?: number;
}): string {
  const n = opcoes.vendasNoMes;
  const excepcional = n >= VENDAS_PARA_EXCEPCIONAL;
  const linhas = [
    `🎉 Parabéns, *${opcoes.loja}*, pela venda!` +
      (n >= 2
        ? ` Essa é a *${n}ª venda do mês*${excepcional ? " — resultado excepcional!" : "."}`
        : ""),
  ];
  if (opcoes.gastoCents > 0) linhas.push(`Valor investido: *${dinheiro(opcoes.gastoCents)}*`);
  if ((opcoes.leads ?? 0) > 0) linhas.push(`Leads: *${opcoes.leads}*`);
  return linhas.join("\n");
}

export const TEXTO_FORA_DE_LEAD =
  "Entendi, essa venda não veio de lead do anúncio, então não conto no controle. " +
  "Parabéns mesmo assim! 🎉";

/** O que o robô ainda não sabe, dito como pergunta. */
export function textoDaPergunta(opcoes: {
  faltaValor: boolean;
  faltaOrigem: boolean;
  precoDoAnuncioCents: number | null;
}): string {
  const dica = opcoes.precoDoAnuncioCents
    ? ` (O anúncio estava com ${dinheiro(opcoes.precoDoAnuncioCents)}.)`
    : "";
  const marcar = " Me responde marcando o @.";

  if (opcoes.faltaValor && opcoes.faltaOrigem) {
    return (
      "Pra eu registrar essa venda no controle: qual foi o *valor* e ela veio de " +
      "*lead do anúncio*?" + dica + marcar
    );
  }
  if (opcoes.faltaValor) {
    return "Qual foi o *valor* da venda?" + dica + marcar;
  }
  return (
    "Essa venda veio de *lead do anúncio*? Responde *sim*, ou *não* se foi " +
    "balcão ou indicação." + marcar
  );
}
