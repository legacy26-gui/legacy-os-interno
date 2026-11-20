// As travas sobre o que a IA propôs. Arquivo puro.
//
// A IA entende a frase; o CÓDIGO decide se o que ela propôs pode virar dinheiro no
// sistema. Três regras, e nenhuma depende de a IA ter acertado:
//
//   1. Valor só se estiver ESCRITO na mensagem (ou falado, depois de virar dígito). Um
//      R$ que a IA "deduziu" é descartado e vira pergunta.
//   2. Conta a pagar e pendência só pelos ids que ela recebeu ("c1", "p2"). Id inventado
//      é descartado.
//   3. Descrição curta: a frase inteira como descrição (o defeito que motivou isto) é
//      cortada pra algo que caiba num extrato.

import type { AcaoInterpretada } from "./interprete";
import { normal, valoresNoTexto } from "./interpretar-gasto";

export interface AcaoValida extends AcaoInterpretada {
  /** Em centavos, já conferido contra a mensagem. */
  cents: number | null;
}

export interface Validacao {
  acoes: AcaoValida[];
  /** O que foi descartado, dito pra ele em uma linha cada. */
  problemas: string[];
}

const PRECISA_DE_VALOR = new Set(["lancar_gasto", "anotar_a_pagar", "atualizar_saldo"]);
const PRECISA_DE_CONTA = new Set(["dar_baixa", "ja_estava_pago", "remover_a_pagar"]);

/** Os valores que a mensagem realmente diz, em centavos. */
export function valoresDitos(texto: string): Set<number> {
  return new Set(valoresNoTexto(texto).map((v) => v.cents));
}

export function descricaoCurta(d: string | null, texto: string): string | null {
  if (!d) return null;
  let x = d.replace(/\s+/g, " ").trim();
  const nd = normal(x);
  // O que é ORDEM ou aviso não é descrição de gasto ("já está pago", "tira do contas a pagar").
  if (/\b(ja esta|ja foi|ja paguei|tira do|tirar do|tira da|contas a pagar|conta a pagar|faltam|falta pagar|deste mes|desse mes)\b/.test(nd)) return null;
  // Descrição de extrato tem poucas palavras. Muitas, e quase todas tiradas da mensagem, é a frase inteira.
  const palavras = nd.split(" ").filter(Boolean);
  const daMensagem = new Set(normal(texto).split(/[^a-z0-9]+/).filter(Boolean));
  const copiadas = palavras.filter((p) => daMensagem.has(p)).length;
  if (palavras.length > 7 || (palavras.length > 5 && copiadas / palavras.length > 0.8)) return null;
  if (x.length > 60) x = x.slice(0, 57).replace(/\s+\S*$/, "") + "…";
  return x.charAt(0).toUpperCase() + x.slice(1);
}

export function validarInterpretacao(
  acoes: AcaoInterpretada[],
  texto: string,
  ids: { contas: Set<string>; pendentes: Set<string> },
  hoje: string,
): Validacao {
  const ditos = valoresDitos(texto);
  const validas: AcaoValida[] = [];
  const problemas: string[] = [];

  for (const a of acoes) {
    if (a.tipo === "nada") continue;

    let cents: number | null = null;
    if (a.valor !== null && Number.isFinite(a.valor)) {
      const c = Math.round(Math.abs(a.valor) * 100);
      if (!ditos.has(c)) {
        problemas.push(`não achei o valor de ${a.descricao ?? "um item"} escrito na mensagem`);
        continue;
      }
      cents = a.tipo === "atualizar_saldo" && a.valor < 0 ? -c : c;
    }
    if (PRECISA_DE_VALOR.has(a.tipo) && (cents === null || cents === 0)) {
      problemas.push(`faltou o valor de ${a.descricao ?? "um item"}`);
      continue;
    }
    if (PRECISA_DE_CONTA.has(a.tipo) && (!a.contaId || !ids.contas.has(a.contaId))) {
      problemas.push(`não achei ${a.descricao ? `"${a.descricao}"` : "essa conta"} nas contas a pagar`);
      continue;
    }
    if (a.tipo === "decidir_pendente" && (!a.pendenteId || !ids.pendentes.has(a.pendenteId) || (a.destino !== "pessoal" && a.destino !== "empresa"))) {
      continue;
    }

    const descricao = descricaoCurta(a.descricao, texto);
    if ((a.tipo === "lancar_gasto" || a.tipo === "anotar_a_pagar") && !descricao) {
      problemas.push("não entendi o que foi o gasto");
      continue;
    }
    // Dia fora do formato vira hoje; gasto no futuro não existe (conta a pagar pode).
    let dia = a.dia && /^\d{4}-\d{2}-\d{2}$/.test(a.dia) ? a.dia : null;
    if (dia && a.tipo === "lancar_gasto" && dia > hoje) dia = hoje;

    validas.push({ ...a, descricao, dia, cents });
  }
  return { acoes: validas, problemas };
}
