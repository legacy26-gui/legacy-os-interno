import "server-only";

import { prisma } from "@/lib/prisma";
import { enviarTexto } from "@/lib/whatsapp/zapi";
import { anotar } from "@/lib/whatsapp/trilha";
import { atrasada, descreverRecorrencia, falarDoPrazo, ocorreNoDia, type Recorrencia } from "./regras";

// As tarefas pessoais no banco: a lista do dia de cada pessoa, criar, concluir, parar. Quem usa: a tela (Meu Dia), o
// WhatsApp (tarefas-no-privado.ts) e o robô das 8h30/17h (robo.ts). A regra de "cai neste dia?" mora em regras.ts.

export interface ItemDaLista {
  id: string;
  titulo: string;
  recorrencia: Recorrencia;
  diaDaSemana: number | null;
  diaDoMes: number | null;
  prazo: Date | null;
  atrasada: boolean;
  feita: boolean;
  responsavelId: string;
  criadaPor: { id: string; nome: string } | null;
}

const soDigitos = (s: string) => s.replace(/\D/g, "");
const primeiroNome = (n: string) => n.trim().split(/\s+/)[0];

/**
 * A lista de uma pessoa num dia: o que cai no dia e ainda está aberto, mais o que ela já concluiu NESTE dia (fica na
 * lista, riscado, pra numeração não pular no meio do dia). Ordem fixa: atrasadas, depois as com prazo, depois as que
 * repetem, depois as sem prazo — o "feito 2" dito de manhã e o dito à tarde apontam pra mesma tarefa.
 */
export async function listaDoDia(userId: string, dia: Date): Promise<ItemDaLista[]> {
  const tarefas = await prisma.tarefa.findMany({
    where: { responsavelId: userId, ativa: true },
    include: { feitas: { select: { dia: true } }, criadaPor: { select: { id: true, name: true } } },
    orderBy: { criadaEm: "asc" },
  });
  const diaMs = dia.getTime();
  const itens: ItemDaLista[] = [];
  for (const t of tarefas) {
    if (!ocorreNoDia(t, dia)) continue;
    const feitaHoje = t.feitas.some((f) => f.dia.getTime() === diaMs);
    // Única já concluída em outro dia: sumiu da lista.
    if (t.recorrencia === "NENHUMA" && t.feitas.length > 0 && !feitaHoje) continue;
    itens.push({
      id: t.id,
      titulo: t.titulo,
      recorrencia: t.recorrencia,
      diaDaSemana: t.diaDaSemana,
      diaDoMes: t.diaDoMes,
      prazo: t.prazo,
      atrasada: atrasada(t, dia),
      feita: feitaHoje,
      responsavelId: t.responsavelId,
      criadaPor: t.criadaPor ? { id: t.criadaPor.id, nome: t.criadaPor.name } : null,
    });
  }
  const peso = (i: ItemDaLista) => (i.atrasada ? 0 : i.prazo && i.recorrencia === "NENHUMA" ? 1 : i.recorrencia !== "NENHUMA" ? 2 : 3);
  return itens.sort((a, b) => peso(a) - peso(b) || (a.prazo?.getTime() ?? 0) - (b.prazo?.getTime() ?? 0));
}

/** Um item como linha de mensagem: "1. ⬜ Ligar pra Vilela — ⚠️ atrasada (ontem)". */
export function linhaDaTarefa(i: ItemDaLista, n: number, hoje: Date): string {
  const marca = i.feita ? "✅" : "⬜";
  const titulo = i.feita ? `~${i.titulo}~` : i.titulo;
  const rec = descreverRecorrencia(i);
  let nota = "";
  if (!i.feita) {
    if (i.atrasada && i.prazo) nota = ` — ⚠️ atrasada (${falarDoPrazo(i.prazo, hoje)})`;
    else if (rec) nota = ` — ${rec}`;
    else if (i.prazo) nota = ` — ${falarDoPrazo(i.prazo, hoje)}`;
  }
  const de = i.criadaPor && i.criadaPor.id !== i.responsavelId ? ` _(de ${primeiroNome(i.criadaPor.nome)})_` : "";
  return `${n}. ${marca} ${titulo}${nota}${de}`;
}

export function textoDaLista(itens: ItemDaLista[], hoje: Date): string {
  return itens.map((i, k) => linhaDaTarefa(i, k + 1, hoje)).join("\n");
}

export interface NovaTarefa {
  titulo: string;
  responsavelId: string;
  criadaPorId: string | null;
  recorrencia: Recorrencia;
  prazo: Date | null;
  diaDaSemana: number | null;
  diaDoMes: number | null;
  origem: "whatsapp" | "sistema";
}

export async function criarTarefa(d: NovaTarefa) {
  return prisma.tarefa.create({
    data: {
      titulo: d.titulo.slice(0, 300),
      responsavelId: d.responsavelId,
      criadaPorId: d.criadaPorId,
      recorrencia: d.recorrencia,
      prazo: d.recorrencia === "NENHUMA" ? d.prazo : null,
      diaDaSemana: d.recorrencia === "SEMANAL" ? d.diaDaSemana : null,
      diaDoMes: d.recorrencia === "MENSAL" ? d.diaDoMes : null,
      origem: d.origem,
    },
  });
}

/** Avisa a pessoa, pelo WhatsApp, que ganhou uma tarefa. Falha de envio não derruba nada. */
export async function avisarTarefaNova(
  t: { titulo: string; recorrencia: Recorrencia; diaDaSemana: number | null; diaDoMes: number | null; prazo: Date | null },
  de: string,
  telefone: string | null,
  hoje: Date,
): Promise<boolean> {
  if (!telefone || soDigitos(telefone).length < 10) return false;
  const quando = descreverRecorrencia(t) || (t.prazo ? `até ${falarDoPrazo(t.prazo, hoje)}` : "");
  const msg = `📌 *Nova tarefa de ${primeiroNome(de)}:*\n• ${t.titulo}${quando ? ` — ${quando}` : ""}\n\nQuando terminar, responde *feito*. Pra ver a sua lista: *o que tenho hoje?*`;
  try {
    const r = await enviarTexto(soDigitos(telefone), msg);
    return r.ok;
  } catch {
    return false;
  }
}

export type ResultadoDaConclusao =
  | { ok: true; titulo: string; jaEstava: boolean; avisou: string | null }
  | { ok: false; motivo: "nao-achou" | "nao-e-sua" };

/**
 * Marca a tarefa como feita no `dia`. Só o responsável (ou o dono) conclui. Já feita: não duplica. Se quem atribuiu é
 * outra pessoa, ela é avisada pelo WhatsApp ("Tatiana concluiu: …").
 */
export async function concluirTarefa(
  tarefaId: string,
  dia: Date,
  quem: { id: string; name: string; role: string },
  messageId?: string | null,
): Promise<ResultadoDaConclusao> {
  const t = await prisma.tarefa.findFirst({
    where: { id: tarefaId, ativa: true },
    include: { criadaPor: { select: { id: true, name: true, whatsapp: true } } },
  });
  if (!t) return { ok: false, motivo: "nao-achou" };
  if (t.responsavelId !== quem.id && quem.role !== "ADMIN") return { ok: false, motivo: "nao-e-sua" };

  const ja = await prisma.tarefaFeita.findUnique({ where: { tarefaId_dia: { tarefaId, dia } }, select: { id: true } });
  if (!ja) await prisma.tarefaFeita.create({ data: { tarefaId, dia, feitaPorId: quem.id } });

  let avisou: string | null = null;
  if (!ja && t.criadaPor && t.criadaPor.id !== t.responsavelId && t.criadaPor.id !== quem.id && t.criadaPor.whatsapp && soDigitos(t.criadaPor.whatsapp).length >= 10) {
    try {
      const r = await enviarTexto(soDigitos(t.criadaPor.whatsapp), `✅ *${primeiroNome(quem.name)}* concluiu a tarefa que você passou:\n• ${t.titulo}`);
      if (r.ok) avisou = primeiroNome(t.criadaPor.name);
      else await anotar(messageId, "tarefas", "tarefa-aviso-recusado", r.erro ?? "");
    } catch (e) {
      await anotar(messageId, "tarefas", "tarefa-aviso-estourou", e instanceof Error ? e.message : String(e));
    }
  }
  return { ok: true, titulo: t.titulo, jaEstava: !!ja, avisou };
}

/** Desfaz a conclusão de hoje (clique errado). */
export async function reabrirTarefa(tarefaId: string, dia: Date, quemId: string, role: string): Promise<boolean> {
  const t = await prisma.tarefa.findFirst({ where: { id: tarefaId }, select: { responsavelId: true } });
  if (!t || (t.responsavelId !== quemId && role !== "ADMIN")) return false;
  await prisma.tarefaFeita.deleteMany({ where: { tarefaId, dia } });
  return true;
}

/** Cancela a tarefa (única) ou para a que repete. Fica guardada, mas sai das listas. Só quem criou, o responsável ou o dono. */
export async function pararTarefa(tarefaId: string, quemId: string, role: string): Promise<{ ok: boolean; titulo?: string; recorrente?: boolean }> {
  const t = await prisma.tarefa.findFirst({ where: { id: tarefaId, ativa: true }, select: { titulo: true, recorrencia: true, responsavelId: true, criadaPorId: true } });
  if (!t) return { ok: false };
  if (t.responsavelId !== quemId && t.criadaPorId !== quemId && role !== "ADMIN") return { ok: false };
  await prisma.tarefa.update({ where: { id: tarefaId }, data: { ativa: false } });
  return { ok: true, titulo: t.titulo, recorrente: t.recorrencia !== "NENHUMA" };
}
