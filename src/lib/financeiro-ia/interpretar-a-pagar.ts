// "Gastos que faltam: Andrielli e Brendon 7.500, Tatiana já está paga, Igor também."
//
// Isto NÃO é um gasto: é o Guilherme dizendo o que ainda vai sair do caixa neste mês,
// pra a projeção do fim do mês descontar. Arquivo puro.
//
// ── O erro que isto corrige ──────────────────────────────────────────────
//
// A primeira versão lia toda mensagem com UM valor como um gasto novo. Essa frase virou
// "Faltam andrielli brendon tatiana já está paga igor tbm — R$ 7.500: foi pessoal ou da
// empresa?": a frase inteira como descrição, e uma pergunta que não fazia sentido.
//
// Três coisas que a frase diz, e que gasto nenhum diz:
//
//   1. "faltam", "a pagar", "vou pagar", "vence dia 25": ainda NÃO saiu. Vira conta a
//      pagar (entra na projeção), não gasto (que já saiu e desconta do saldo).
//   2. "Tatiana já está paga", "Igor também": já saiu, ou não falta. Não conta de novo.
//   3. Quem recebe é gente da equipe: empresa, sem perguntar "pessoal ou empresa?".
//
// Depois, quando ele disser "paguei a Andrielli", o robô dá baixa na conta a pagar em vez
// de criar um gasto igual (contaria duas vezes).

import { diaNoTexto, destinoDito, normal, valoresNoTexto } from "./interpretar-gasto";

export interface ContaAPagar {
  descricao: string;
  cents: number;
  /** AAAA-MM-DD do vencimento. Sem dia dito, o último dia do mês. */
  vence: string;
}

export interface LeituraAPagar {
  itens: ContaAPagar[];
  /** Quem a frase disse que já está pago — não entra na conta, mas o robô repete pra ele conferir. */
  jaPagos: string[];
  treinamentos: boolean;
  /** Disse "pessoal": conta pessoal a pagar ainda não entra na projeção. */
  pessoal: boolean;
}

const CUE = /\b(falta|faltam|falta pagar|faltam pagar|a pagar|ainda (vou|tenho que|preciso|falta|faltam) pagar|vou pagar|tenho que pagar|tenho de pagar|preciso pagar|devo pagar|a vencer|vence|vencem|vencimento|previsto|previstos|previstas)\b/;
const JA_PAGO = /\bja\b.*\b(pag[ao]s?|quitad[ao]s?|pagou|pagaram)\b|\b(esta|estao|foi|foram|ta|tao)\s+(pag[ao]s?|quitad[ao]s?)\b|\bja\s+(pagou|pagaram|paguei|pagamos)\b/;
const TBM = /\b(tbm|tb|tambem)\b/;

/** Palavras que fazem o aviso e não o assunto — saem da descrição. */
const AVISO = new Set([
  "gastos", "gasto", "faltam", "falta", "faltando", "pagar", "pagamento", "pagamentos", "a", "ainda", "vou", "tenho", "que", "de", "preciso", "devo",
  "previsto", "previstos", "previstas", "vence", "vencem", "vencimento", "vencer", "dia", "ate", "pra", "para", "o", "os", "as", "um", "uma", "no", "na",
  "mes", "do", "da", "dos", "das", "mais", "r$", "reais", "real", "total", "tudo", "todos", "so", "somente", "resta", "restam", "fica", "ficam",
  "tbm", "tb", "tambem", "ja", "esta", "estao", "paga", "pago", "pagos", "pagas", "faltou", "contas", "conta", "e",
  // Palavras de "qual caixa" / "de quem": já viram escopo, não são o assunto.
  "treinamento", "treinamentos", "empresa", "agencia", "pessoal", "pessoais", "particular",
]);

const CONECTOR = new Set(["e", "de", "da", "do", "dos", "das"]);

function titulo(palavras: string[]): string {
  return palavras
    .map((p, i) => (i > 0 && CONECTOR.has(p) ? p : p === "DAS" ? "DAS" : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** O assunto de um pedaço: o que sobra depois de tirar o aviso, o valor e a data. */
function assuntoDe(clausula: string): string {
  const sem = clausula
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
    .replace(/\bdia\s+\d{1,2}\b/gi, " ");
  const valores = valoresNoTexto(sem);
  let t = sem;
  for (const v of [...valores].reverse()) t = t.slice(0, v.inicio) + " " + t.slice(v.fim);
  const palavras = t
    .replace(/[.,;:!?()]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    // Minúsculas, menos a SIGLA "DAS" (o imposto): "pagamento das contas" tem um "das" que sai, o "DAS 380" não.
    .map((p) => (p === "DAS" ? p : p.toLowerCase()));
  // Tira o aviso só das pontas e dos miolos que não são nome: "andrielli e brendon" fica com o "e".
  const fora = (p: string) => p !== "DAS" && AVISO.has(normal(p).replace(/[^a-z0-9$]/g, ""));
  while (palavras.length && fora(palavras[0])) palavras.shift();
  while (palavras.length && fora(palavras[palavras.length - 1])) palavras.pop();
  const miolo = palavras.filter((p, i, arr) => !(normal(p) === "e" && (i === 0 || i === arr.length - 1)));
  return titulo(miolo);
}

function nomesDe(clausula: string): string[] {
  const a = assuntoDe(clausula);
  if (!a) return [];
  return a.split(/\s+e\s+/i).map((x) => x.trim()).filter(Boolean);
}

function fimDoMes(hoje: string): string {
  const [a, m] = hoje.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0, 12)).toISOString().slice(0, 10);
}

/** Vencimento "dia 25": este mês se ainda não passou, senão o mês que vem. */
function vencimento(clausula: string, hoje: string): string | null {
  const m = normal(clausula).match(/\bdia\s+(\d{1,2})\b/) ?? normal(clausula).match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (!m) return null;
  const [a, mes, dh] = hoje.split("-").map(Number);
  if (m[2]) {
    const d = new Date(Date.UTC(a, Number(m[2]) - 1, Number(m[1]), 12));
    return d.getUTCMonth() === Number(m[2]) - 1 ? d.toISOString().slice(0, 10) : null;
  }
  const dia = Number(m[1]);
  if (dia < 1 || dia > 31) return null;
  const alvoMes = dia >= dh ? mes : mes + 1;
  const ultimo = new Date(Date.UTC(a, alvoMes, 0, 12)).getUTCDate();
  return new Date(Date.UTC(a, alvoMes - 1, Math.min(dia, ultimo), 12)).toISOString().slice(0, 10);
}

/**
 * A mensagem fala do que FALTA pagar? Devolve as contas a pagar e quem já está pago.
 * `null` quando não é isso — e a mensagem segue pro leitor de gastos.
 */
export function lerAPagar(texto: string, hoje: string): LeituraAPagar | null {
  const t = normal(texto);
  if (!CUE.test(t)) return null;
  if (texto.trim().endsWith("?")) return null; // "quanto falta pagar?" é pergunta
  if (/\b(quanto|qual|quais|quantos)\b/.test(t)) return null;
  if (valoresNoTexto(texto).length === 0) return null;

  const clausulas = texto.split(/\n|;|,(?!\d)/).map((c) => c.trim()).filter(Boolean);
  const itens: ContaAPagar[] = [];
  const jaPagos: string[] = [];
  let anteriorEraPago = false;
  const padrao = fimDoMes(hoje);

  for (const c of clausulas) {
    const n = normal(c);
    const valores = valoresNoTexto(c);

    // "Tatiana já está paga" e o "Igor tbm" logo depois: ninguém a pagar.
    if (JA_PAGO.test(n) || (anteriorEraPago && TBM.test(n) && valores.length === 0)) {
      jaPagos.push(...nomesDe(c));
      anteriorEraPago = true;
      continue;
    }
    anteriorEraPago = false;
    if (valores.length !== 1) continue; // sem valor: é só conversa; com vários, não dá pra adivinhar
    const descricao = assuntoDe(c);
    if (!descricao) continue;
    itens.push({ descricao, cents: valores[0].cents, vence: vencimento(c, hoje) ?? diaNoTexto(c, hoje) ?? padrao });
  }
  if (itens.length === 0) return null;

  return {
    itens,
    jaPagos: [...new Set(jaPagos)],
    treinamentos: /\b(treinamento|treinamentos)\b/.test(t),
    pessoal: destinoDito(texto) === "pessoal",
  };
}

// ───────────────────────────── "paguei a Andrielli" ──────────────────────────

export interface PagamentoDeConta {
  /** Palavras que a conta a pagar precisa ter na descrição. */
  termos: string[];
  /** O valor pago, se ele disse. Sem valor: a conta inteira. */
  cents: number | null;
}

/** "paguei a Andrielli", "paguei o DAS 380", "quitei o aluguel". `null` se não for isso. */
export function lerPagamentoDeConta(texto: string): PagamentoDeConta | null {
  const t = normal(texto);
  if (texto.trim().endsWith("?")) return null;
  if (!/\b(paguei|pagamos|quitei|quitamos|dei baixa|pago|paga)\b/.test(t)) return null;
  if (JA_PAGO.test(t) && CUE.test(t)) return null;

  const valores = valoresNoTexto(texto);
  if (valores.length > 1) return null;
  const termos = assuntoDe(texto.replace(/\b(paguei|pagamos|quitei|quitamos|dei baixa|pagou)\b/gi, " "))
    .split(/\s+/)
    // "DAS" (o imposto) fica; "das" de "contas das meninas" é conector e sai.
    .filter((w) => w === "DAS" || !CONECTOR.has(normal(w)))
    .map((w) => normal(w))
    .filter((w) => w.length >= 3);
  if (termos.length === 0) return null;
  return { termos, cents: valores[0]?.cents ?? null };
}

/** "o que falta pagar?", "quanto falta pagar esse mês?", "contas a pagar" */
export function pedeListaAPagar(texto: string): boolean {
  const t = normal(texto);
  return (
    /\b(o que|quais|quanto|quantos)\b.*\b(falta|faltam|a pagar|pagar)\b/.test(t) ||
    /^(contas a pagar|a pagar|o que falta)\??$/.test(t) ||
    /\b(me (mostra|mostre|lista|fala))\b.*\ba pagar\b/.test(t)
  );
}
