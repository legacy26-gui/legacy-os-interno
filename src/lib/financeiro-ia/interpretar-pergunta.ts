// "Quanto gastei de Uber com o Igor esse mês?" — a pergunta lida, sem IA.
//
// Arquivo puro, como interpretar-gasto.ts: a conta de dinheiro não pode depender de
// o modelo ter entendido bem a frase. A pergunta vira DUAS coisas objetivas:
//
//   - o PERÍODO (esse mês, mês passado, em outubro, hoje, últimos 7 dias, sempre…)
//   - os TERMOS que o gasto precisa ter ("uber" e "igor"), procurados na descrição
//     e na categoria de cada lançamento — todos os termos, não qualquer um
//
// O que sobra da frase depois de tirar as palavras de pergunta e de período é o que
// ele quer somar. Sem nenhum termo ("quanto gastei esse mês?") é o resumo geral.

import { normal } from "./interpretar-gasto";

export interface Periodo {
  /** AAAA-MM-DD, inclusivo. */
  de: string;
  /** AAAA-MM-DD, EXCLUSIVO. */
  ate: string;
  /** Como o robô diz na resposta: "em novembro", "hoje", "nos últimos 7 dias". */
  rotulo: string;
}

export interface PerguntaDeGasto {
  periodo: Periodo;
  /** Cada um tem que aparecer na descrição ou na categoria. Vazio = resumo geral. */
  termos: string[];
  /** Os mesmos termos como ele escreveu (com acento), pra repetir na resposta. */
  rotulos: string[];
  escopo: "tudo" | "empresa" | "pessoal";
  /** "treinamento" na frase: só o caixa do Treinamentos. */
  treinamentos: boolean;
}

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const NOME_DO_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m, d, 12)).toISOString().slice(0, 10);
const somar = (isoDia: string, n: number) => {
  const d = new Date(`${isoDia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** A frase é uma PERGUNTA sobre gasto (e não um lançamento)? */
export function ehPerguntaDeGasto(texto: string): boolean {
  const t = normal(texto);
  if (/\b(quanto|qto|qnto|quantos|quantas)\b/.test(t)) return true;
  // "total de uber", "gastos com mercado em outubro?" — sem valor em dinheiro na frase.
  const semPeriodo = t.replace(/\b\d+\s*dias\b/g, "").replace(/\b(19|20)\d{2}\b/g, "");
  if (/^(total|soma|somar|gastos?|me (mostra|mostre|fala|diz)|mostra|mostre)\b/.test(t) && !/\d/.test(semPeriodo)) return true;
  if (t.endsWith("?") && /\b(gast|paguei|custou|saiu)/.test(t)) return true;
  return false;
}

function lerPeriodo(t: string, hoje: string): { periodo: Periodo; resto: string } {
  const [ano, mes, dd] = hoje.split("-").map(Number);
  const tira = (re: RegExp) => t.replace(re, " ");

  const ate = (isoDia: string) => somar(isoDia, 1);
  let m: RegExpMatchArray | null;

  if ((m = t.match(/\banteontem\b/))) return { periodo: { de: somar(hoje, -2), ate: somar(hoje, -1), rotulo: "anteontem" }, resto: tira(/\banteontem\b/) };
  if (/\bontem\b/.test(t)) return { periodo: { de: somar(hoje, -1), ate: hoje, rotulo: "ontem" }, resto: tira(/\bontem\b/) };
  if (/\b(hoje|hj)\b/.test(t)) return { periodo: { de: hoje, ate: ate(hoje), rotulo: "hoje" }, resto: tira(/\b(hoje|hj)\b/) };

  if ((m = t.match(/\bultimos?\s+(\d{1,3})\s+dias\b/))) {
    const n = Math.min(Number(m[1]), 366);
    return { periodo: { de: somar(hoje, -(n - 1)), ate: ate(hoje), rotulo: `nos últimos ${n} dias` }, resto: tira(/\bultimos?\s+\d{1,3}\s+dias\b/) };
  }

  // Segunda-feira da semana de hoje.
  const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const segunda = somar(hoje, -((dow + 6) % 7));
  if (/\bsemana passada\b/.test(t)) return { periodo: { de: somar(segunda, -7), ate: segunda, rotulo: "na semana passada" }, resto: tira(/\bsemana passada\b/) };
  if (/\b(essa|esta|nessa|nesta|na)\s+semana\b/.test(t)) return { periodo: { de: segunda, ate: ate(hoje), rotulo: "nesta semana" }, resto: tira(/\b(essa|esta|nessa|nesta|na)\s+semana\b/) };

  if (/\bano passado\b/.test(t)) return { periodo: { de: dia(ano - 1, 0, 1), ate: dia(ano, 0, 1), rotulo: `em ${ano - 1}` }, resto: tira(/\bano passado\b/) };
  if (/\b(esse|este|nesse|neste|no|do)\s+ano\b/.test(t)) return { periodo: { de: dia(ano, 0, 1), ate: ate(hoje), rotulo: "neste ano" }, resto: tira(/\b(esse|este|nesse|neste|no|do)\s+ano\b/) };

  if (/\b(sempre|no total|desde o inicio|desde o comeco|desde o começo|em geral|geral|tudo)\b/.test(t)) {
    return { periodo: { de: "2000-01-01", ate: ate(hoje), rotulo: "desde o começo" }, resto: tira(/\b(sempre|no total|desde o inicio|desde o comeco|em geral|geral|tudo)\b/) };
  }

  if (/\b(mes passado|ultimo mes|mes anterior)\b/.test(t)) {
    const a = mes === 1 ? ano - 1 : ano;
    const mm = mes === 1 ? 12 : mes - 1;
    return { periodo: { de: dia(a, mm - 1, 1), ate: dia(ano, mes - 1, 1), rotulo: `em ${NOME_DO_MES[mm - 1]}` }, resto: tira(/\b(mes passado|ultimo mes|mes anterior)\b/) };
  }

  // "em outubro", "de outubro", "outubro de 2025", "outubro"
  for (let i = 0; i < 12; i++) {
    const re = new RegExp(`\\b(?:em |de |no mes de |do mes de )?${MESES[i]}(?: de (\\d{4}))?\\b`);
    if ((m = t.match(re))) {
      // Mês que ainda não chegou neste ano é o do ano passado: ninguém gastou no futuro.
      const a = m[1] ? Number(m[1]) : i + 1 > mes ? ano - 1 : ano;
      const rotulo = `em ${NOME_DO_MES[i]}${a !== ano ? ` de ${a}` : ""}`;
      return { periodo: { de: dia(a, i, 1), ate: dia(a, i + 1, 1), rotulo }, resto: tira(re) };
    }
  }

  // Padrão (e "esse mês" explícito): o mês de hoje.
  const ehEsteMes = /\b(esse|este|nesse|neste|no|do)\s+mes\b/;
  const nome = NOME_DO_MES[mes - 1];
  void dd;
  return { periodo: { de: dia(ano, mes - 1, 1), ate: dia(ano, mes, 1), rotulo: `em ${nome}` }, resto: ehEsteMes.test(t) ? tira(ehEsteMes) : t };
}

// Palavras que fazem a pergunta, não o assunto.
const FORA = new Set([
  "quanto", "qto", "qnto", "quantos", "quantas", "gastei", "gasto", "gastos", "gastou", "gastamos", "gastar", "paguei", "pagamos", "pago", "foi", "deu", "custou", "custaram", "saiu",
  "ja", "total", "soma", "somar", "valor", "valores", "reais", "real", "r$", "lancamentos", "lancamento", "vez", "vezes",
  "de", "do", "da", "dos", "das", "com", "em", "no", "na", "nos", "nas", "o", "a", "os", "as", "um", "uma", "ao", "pro", "pra", "para", "por", "e", "ou",
  "eu", "me", "meu", "minha", "fala", "diz", "mostra", "mostre", "mostrar", "ver", "qual", "quais", "foram", "foi",
  "esse", "essa", "este", "esta", "neste", "nesta", "nesse", "nessa", "mes", "ano", "semana", "dia", "dias", "ultimos", "ultimo", "passado", "passada",
  "ate", "ai", "so", "mais", "menos", "tipo", "coisa", "coisas", "ta", "tudo", "geral", "sempre", "hoje", "hj", "ontem",
]);

const APELIDOS: Record<string, string> = { comida: "alimentacao", comidas: "alimentacao", gasolina: "combustivel" };

function singular(p: string): string {
  return p.length > 4 && p.endsWith("s") ? p.slice(0, -1) : p;
}

export function lerPergunta(texto: string, hoje: string): PerguntaDeGasto {
  const t0 = normal(texto).replace(/[?!]/g, " ");
  const { periodo, resto } = lerPeriodo(t0, hoje);

  let escopo: PerguntaDeGasto["escopo"] = "tudo";
  let treinamentos = false;
  const termos: string[] = [];
  const rotulos: string[] = [];
  // A palavra do jeito que veio, com acento: "alimentação", e não "alimentacao".
  const comoEscreveu = new Map<string, string>();
  for (const w of texto.toLowerCase().replace(/[?!.,;:]/g, " ").split(/\s+/)) if (w) comoEscreveu.set(normal(w), w);
  for (const bruto of resto.replace(/[.,;:/+]/g, " ").split(/\s+/)) {
    const p = bruto.trim();
    if (p.length < 2 || FORA.has(p) || /^\d+$/.test(p)) continue;
    if (/^(pessoal|pessoais|particular)$/.test(p)) { escopo = "pessoal"; continue; }
    if (/^(empresa|agencia|firma|legacy)$/.test(p)) { escopo = "empresa"; continue; }
    if (/^(treinamento|treinamentos)$/.test(p)) { escopo = "empresa"; treinamentos = true; continue; }
    const s = singular(p);
    const termo = APELIDOS[s] ?? APELIDOS[p] ?? s;
    if (termos.includes(termo)) continue;
    termos.push(termo);
    const original = comoEscreveu.get(p) ?? p;
    rotulos.push(singular(original) === original ? original : original.slice(0, original.length - (p.length - s.length)));
  }
  return { periodo, termos, rotulos, escopo, treinamentos };
}

/** O lançamento tem TODOS os termos na descrição ou na categoria? */
export function bateComOsTermos(descricao: string, categoria: string, termos: string[]): boolean {
  if (termos.length === 0) return true;
  const palheiro = normal(`${descricao} ${categoria}`);
  return termos.every((t) => palheiro.includes(t));
}
