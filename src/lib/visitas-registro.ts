import "server-only";

import { prisma } from "@/lib/prisma";

// O registro das visitas à loja: um dia por linha, com o que foi falado. Quem grava: o botão da tela (Clientes e a ficha), o
// "histórico" em bolha e o "visitei a Vilela" do WhatsApp — uma regra só.
//
// `Client.ultimaVisitaEm` continua sendo o que a tabela e os avisos leem ("há 12 dias"): aqui ele é SEMPRE o dia mais recente
// do histórico (guardado ao meio-dia UTC, como sempre foi), e volta a ficar vazio quando a última visita é apagada.

const UM_DIA = 86_400_000;

/** "2026-11-12" → meia-noite UTC desse dia. `null` se não for data de verdade. Pura. */
export function diaDoTexto(data: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const [a, m, d] = data.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d));
  return x.getUTCMonth() === m - 1 ? x : null;
}

/** O dia de hoje (meia-noite UTC), no calendário de Brasília. */
export function hojeDaCasa(agora = new Date()): Date {
  const [a, m, d] = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

/** Deixa `ultimaVisitaEm` igual ao dia mais recente do histórico (ou vazio). */
export async function sincronizarUltimaVisita(clientId: string): Promise<void> {
  const ultima = await prisma.visitaDaLoja.findFirst({ where: { clientId }, orderBy: { dia: "desc" }, select: { dia: true } });
  await prisma.client.update({
    where: { id: clientId },
    data: { ultimaVisitaEm: ultima ? new Date(ultima.dia.getTime() + 12 * 3600_000) : null },
  });
}

export type ResultadoDaVisita = { ok: true; jaTinha: boolean } | { ok: false; erro: string };

/**
 * Registra a visita do dia. Já existe visita nesse dia: não duplica — só completa o "o que foi falado" (a nota nova é
 * acrescentada à que já estava). Visita no futuro é engano de digitação e não grava.
 */
export async function registrarVisita(p: { clientId: string; dia: Date; nota?: string | null; quemId: string | null }, agora = new Date()): Promise<ResultadoDaVisita> {
  if (p.dia.getTime() > hojeDaCasa(agora).getTime() + UM_DIA) return { ok: false, erro: "Essa data é no futuro." };
  const nota = p.nota?.trim() ? p.nota.trim().slice(0, 2000) : null;
  const existente = await prisma.visitaDaLoja.findUnique({ where: { clientId_dia: { clientId: p.clientId, dia: p.dia } }, select: { id: true, nota: true } });
  if (existente) {
    if (nota && nota !== existente.nota) {
      await prisma.visitaDaLoja.update({ where: { id: existente.id }, data: { nota: existente.nota ? `${existente.nota}\n${nota}`.slice(0, 4000) : nota } });
    }
  } else {
    await prisma.visitaDaLoja.create({ data: { clientId: p.clientId, dia: p.dia, nota, quemId: p.quemId } });
  }
  await sincronizarUltimaVisita(p.clientId);
  return { ok: true, jaTinha: !!existente };
}

/** Apaga uma visita (engano) e refaz a "última visita" da loja. */
export async function apagarVisita(clientId: string, visitaId: string): Promise<boolean> {
  const { count } = await prisma.visitaDaLoja.deleteMany({ where: { id: visitaId, clientId } });
  if (count > 0) await sincronizarUltimaVisita(clientId);
  return count > 0;
}

export interface ItemDoHistorico {
  id: string;
  tipo: "visita" | "nota";
  /** ISO. Visita: o dia (meia-noite UTC). Nota: quando foi escrita. */
  quando: string;
  quem: string | null;
  texto: string | null;
}

/** As visitas e as anotações da loja, da mais nova pra mais antiga. */
export async function historicoDaLoja(clientId: string): Promise<ItemDoHistorico[]> {
  const [visitas, notas] = await Promise.all([
    prisma.visitaDaLoja.findMany({ where: { clientId }, orderBy: { dia: "desc" }, include: { quem: { select: { name: true } } } }),
    prisma.clientHistory.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 200, include: { author: { select: { name: true } } } }),
  ]);
  const itens: ItemDoHistorico[] = [
    ...visitas.map((v) => ({ id: v.id, tipo: "visita" as const, quando: v.dia.toISOString(), quem: v.quem?.name ?? null, texto: v.nota })),
    ...notas.map((n) => ({ id: n.id, tipo: "nota" as const, quando: n.createdAt.toISOString(), quem: n.author?.name ?? null, texto: n.note })),
  ];
  return itens.sort((a, b) => (a.quando < b.quando ? 1 : -1));
}
