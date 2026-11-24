// As regras das tarefas pessoais. Arquivo puro (sem banco): serve à tela, ao robô e aos testes.
//
// Um "dia" aqui é sempre uma data de meia-noite UTC (o formato da coluna DATE e de `diaDaCasaComoData`).

import { dobrar, NOMES_DOS_DIAS, diaDeBrasilia, lerDiaFuturo } from "@/lib/datas-da-conversa";

export type Recorrencia = "NENHUMA" | "DIARIA" | "SEMANAL" | "MENSAL";

export interface TarefaDaRegra {
  recorrencia: Recorrencia;
  prazo: Date | null;
  diaDaSemana: number | null;
  diaDoMes: number | null;
  criadaEm: Date;
}

const umDia = 86_400_000;
const soODia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Último dia do mês do `dia`. */
function ultimoDoMes(dia: Date): number {
  return new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * Esta tarefa cai no `dia`? (Não diz se já foi feita — isso é a tabela de feitas.)
 *
 *  - Única: aparece até ser concluída. Com prazo, só a partir do prazo (antes disso ainda não é "de hoje"); sem prazo,
 *    desde o dia em que foi criada. Passou do prazo e não foi feita = atrasada (ver `atrasada`).
 *  - Diária: de segunda a sábado (domingo a casa não trabalha), a partir do início.
 *  - Semanal: no dia da semana escolhido.
 *  - Mensal: no dia do mês escolhido (mês curto cai no último dia: "dia 31" em fevereiro vira dia 28/29).
 */
export function ocorreNoDia(t: TarefaDaRegra, dia: Date): boolean {
  const hoje = soODia(dia);
  const inicio = t.prazo ? soODia(t.prazo) : soODia(t.criadaEm);
  if (t.recorrencia === "NENHUMA") return hoje >= inicio;
  if (hoje < inicio) return false;
  const dow = dia.getUTCDay();
  if (t.recorrencia === "DIARIA") return dow !== 0;
  if (t.recorrencia === "SEMANAL") return t.diaDaSemana !== null && dow === t.diaDaSemana;
  if (t.recorrencia === "MENSAL") {
    if (!t.diaDoMes) return false;
    return dia.getUTCDate() === Math.min(t.diaDoMes, ultimoDoMes(dia));
  }
  return false;
}

/** Única, com prazo que já passou, ainda sem ser feita. (Tarefa que repete nunca fica "atrasada": o dia seguinte é outro dia.) */
export function atrasada(t: TarefaDaRegra, dia: Date): boolean {
  return t.recorrencia === "NENHUMA" && !!t.prazo && soODia(t.prazo) < soODia(dia);
}

const NOME_DO_DIA: Record<number, string> = { 0: "domingo", 1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta", 6: "sábado" };

/** "todo dia", "toda segunda", "todo dia 5", ou "" (única). */
export function descreverRecorrencia(t: Pick<TarefaDaRegra, "recorrencia" | "diaDaSemana" | "diaDoMes">): string {
  if (t.recorrencia === "DIARIA") return "todo dia";
  if (t.recorrencia === "SEMANAL" && t.diaDaSemana !== null) {
    const d = t.diaDaSemana;
    // "todo sábado / todo domingo", mas "toda segunda … sexta".
    return `${d === 0 || d === 6 ? "todo" : "toda"} ${NOME_DO_DIA[d]}`;
  }
  if (t.recorrencia === "MENSAL" && t.diaDoMes) return `todo dia ${t.diaDoMes}`;
  return "";
}

/** "sexta, 21/11", "hoje", "amanhã" pra um prazo, comparando com `hoje`. */
export function falarDoPrazo(prazo: Date, hoje: Date): string {
  const dif = Math.round((soODia(prazo) - soODia(hoje)) / umDia);
  const dd = String(prazo.getUTCDate()).padStart(2, "0");
  const mm = String(prazo.getUTCMonth() + 1).padStart(2, "0");
  if (dif === 0) return "hoje";
  if (dif === 1) return "amanhã";
  if (dif === -1) return "ontem";
  return `${NOME_DO_DIA[prazo.getUTCDay()]}, ${dd}/${mm}`;
}

// ─────────────────────────── ler da conversa ───────────────────────────────

export interface RecorrenciaLida {
  recorrencia: Exclude<Recorrencia, "NENHUMA">;
  diaDaSemana: number | null;
  diaDoMes: number | null;
}

/**
 * "todo dia", "toda segunda", "todas as sextas", "todo dia 5", "todo mês dia 10". `null` = a frase não repete. Pura.
 */
export function lerRecorrencia(texto: string, agora: Date): RecorrenciaLida | null {
  const t = dobrar(texto);
  const mensalDia = t.match(/\btodo dia (\d{1,2})\b/) ?? t.match(/\b(?:todo mes|mensalmente)\b.*?\bdia (\d{1,2})\b/);
  if (mensalDia) {
    const d = Number(mensalDia[1]);
    return d >= 1 && d <= 31 ? { recorrencia: "MENSAL", diaDaSemana: null, diaDoMes: d } : null;
  }
  for (let i = 0; i < 7; i++) {
    const nome = NOMES_DOS_DIAS[i];
    if (new RegExp(`\\btod[oa]s?(?: as| os)? ${nome}s?\\b`).test(t) || new RegExp(`\\btoda semana\\b.*\\b${nome}\\b`).test(t) || new RegExp(`\\b${nome}s? (?:de )?toda semana\\b`).test(t)) {
      return { recorrencia: "SEMANAL", diaDaSemana: i, diaDoMes: null };
    }
  }
  if (/\b(?:todo dia|todos os dias|diariamente|todo dia util|todos os dias uteis)\b/.test(t)) return { recorrencia: "DIARIA", diaDaSemana: null, diaDoMes: null };
  if (/\b(?:toda semana|semanalmente)\b/.test(t)) return { recorrencia: "SEMANAL", diaDaSemana: diaDeBrasilia(agora).dow, diaDoMes: null };
  if (/\b(?:todo mes|mensalmente)\b/.test(t)) return { recorrencia: "MENSAL", diaDaSemana: null, diaDoMes: diaDeBrasilia(agora).d };
  return null;
}

/** Tira da frase o pedaço que fala de repetição e de prazo, pra sobrar só a tarefa. Mexe no TEXTO ORIGINAL (mesmo tamanho do dobrado). */
export function tirarDatasDoTitulo(texto: string): string {
  const t = dobrar(texto);
  const cortes: [number, number][] = [];
  const marca = (re: RegExp) => {
    for (const m of t.matchAll(re)) if (m.index !== undefined) cortes.push([m.index, m.index + m[0].length]);
  };
  const dias = NOMES_DOS_DIAS.join("|");
  marca(/\b(?:ate|para|pra|ate o dia|no dia)?\s*(?:depois de amanha|amanha|hoje)\b/g);
  marca(new RegExp(`\\b(?:ate|para|pra|na|no)?\\s*tod[oa]s?(?: as| os)? (?:${dias})s?\\b`, "g"));
  marca(/\btoda semana\b|\bsemanalmente\b|\bmensalmente\b|\btodo mes\b|\btodos os dias( uteis)?\b|\bdiariamente\b|\btodo dia( util)?\b(?:\s+\d{1,2}\b)?/g);
  marca(new RegExp(`\\b(?:ate|para|pra|na|no|nesta|neste|esta|este)\\s+(?:proxima\\s+)?(?:${dias})(?:-feira)?\\b`, "g"));
  marca(new RegExp(`\\b(?:${dias})(?:-feira)?\\b`, "g"));
  marca(/\b(?:ate o dia|ate dia|para o dia|pro dia|no dia|dia)\s+\d{1,2}(?:\/\d{1,2})?\b/g);
  marca(/\b(?:ate|para|pra)?\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g);
  // Funde os cortes e remove do original.
  cortes.sort((a, b) => a[0] - b[0]);
  let r = "";
  let pos = 0;
  for (const [a, b] of cortes) {
    if (a < pos) {
      pos = Math.max(pos, b);
      continue;
    }
    r += texto.slice(pos, a);
    pos = b;
  }
  r += texto.slice(pos);
  return r.replace(/\s{2,}/g, " ").replace(/^[\s,;:.–-]+|[\s,;:.–-]+$/g, "").replace(/\s+(até|para|pra|em|no|na|de|do|da|e)$/i, "").trim();
}

/** O prazo dito na frase ("até sexta", "amanhã", "dia 25"), como dia de meia-noite UTC. `null` = sem prazo. Pura. */
export function lerPrazo(texto: string, agora: Date): Date | null {
  const d = lerDiaFuturo(texto, agora);
  return d ? new Date(Date.UTC(d.y, d.m - 1, d.d)) : null;
}
