// "Meu saldo é 12.500" — o saldo em caixa dito no grupo financeiro. Arquivo puro.
//
// ── Por que isto vem ANTES da leitura de gastos ──────────────────────────
//
// "saldo 12500" tem um número e nenhuma categoria conhecida: a leitura de gastos o
// trataria como um gasto de R$ 12.500 e perguntaria "pessoal ou empresa?". E uma
// pergunta como "qual meu saldo?" ou "quanto tenho em caixa?" tem a palavra "quanto"
// e cairia no "quanto gastei". Então a ordem é: saldo dito → pergunta de saldo →
// pergunta de gasto → gasto.
//
// ── O que conta como "dizer o saldo" ─────────────────────────────────────
//
//   "meu saldo é 12.500"    "saldo 12500"      "saldo atual 12 mil"
//   "saldo do banco: 8.300" "tenho 8 mil no banco / em caixa / na conta"
//   "saldo negativo de 500" "saldo -500"
//
// Exatamente UM valor. Dois valores ("saldo 12 mil e 500") não dá pra saber qual é o
// saldo: o robô pergunta, não adivinha — saldo errado estraga o caixa inteiro.

import { normal, valoresNoTexto } from "./interpretar-gasto";

export type SaldoDito =
  | { tipo: "valor"; cents: number; treinamentos: boolean }
  | { tipo: "ambiguo" };

const PERGUNTA = /\b(qual|quais|quanto|quantos|como|me (diz|fala|mostra)|mostra|mostre)\b/;

/** A frase DIZ o saldo? (e não pergunta por ele, nem é um gasto) */
export function lerSaldoDito(texto: string): SaldoDito | null {
  const t = normal(texto);
  if (texto.trim().endsWith("?") || PERGUNTA.test(t)) return null;

  const falaDeSaldo = /\bsaldo\b/.test(t);
  const tenho = /\btenho\b/.test(t) && /\b(banco|caixa|conta|itau|nubank|inter|bradesco|santander|sicredi|sicoob)\b/.test(t);
  if (!falaDeSaldo && !tenho) return null;
  // "recarga de saldo do celular 30" é gasto, não o saldo do caixa.
  if (/\b(recarga|celular|credito|chip|pre pago|prepago|meta ads|verba)\b/.test(t)) return null;

  const valores = valoresNoTexto(texto);
  if (valores.length === 0) return null;
  if (valores.length > 1) return { tipo: "ambiguo" };

  const negativo = /\b(negativo|no vermelho|devendo|descoberto)\b/.test(t) || /(^|\s)-\s*(r\$\s*)?\d/.test(texto);
  const cents = negativo ? -valores[0].cents : valores[0].cents;
  return { tipo: "valor", cents, treinamentos: /\b(treinamento|treinamentos)\b/.test(t) };
}

/** "qual meu saldo?", "quanto tenho em caixa?", "como vou fechar o mês?", "projeção" */
export function pedeSaldoOuProjecao(texto: string): boolean {
  const t = normal(texto);
  if (/\b(projecao|projetado|projetar)\b/.test(t)) return true;
  if (/\b(fechar|fecha|fechamento|fim|final)\b.*\bmes\b/.test(t) || /\bmes\b.*\b(fechar|fecha|fechamento)\b/.test(t)) return true;
  if (/\b(qual|quanto|como|me (diz|fala|mostra)|mostra|mostre)\b.*\b(saldo|caixa)\b/.test(t)) return true;
  if (/\bquanto\b.*\btenho\b.*\b(banco|caixa|conta)\b/.test(t)) return true;
  if (/^(saldo|caixa)\s*\??$/.test(t)) return true;
  return false;
}
