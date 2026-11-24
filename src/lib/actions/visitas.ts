"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira } from "@/lib/carteira";
import { apagarVisita, diaDoTexto, historicoDaLoja, hojeDaCasa, registrarVisita, sincronizarUltimaVisita, type ItemDoHistorico } from "@/lib/visitas-registro";

// Visitas à loja.
//
// "Visitei hoje" é um clique só — é pra ser apertado na calçada, saindo da loja. Cada visita vira uma linha do HISTÓRICO
// (um dia por loja), com o que foi falado quando a pessoa quiser anotar. A "última visita" que a tabela mostra é sempre a
// mais recente do histórico. As regras moram em src/lib/visitas-registro.ts (as mesmas do WhatsApp).

function revalidar(clientId: string) {
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clientId}`);
}

/** Apertou o botão: a visita foi hoje. */
export async function marcarVisitaHoje(clientId: string) {
  const user = await requireModuleAccess("clientes");
  // O id vem do navegador: marcar visita em loja que não é sua mentiria no controle de quem cuida dela.
  if (!(await clienteEDaCarteira(user, clientId))) return;
  await registrarVisita({ clientId, dia: hojeDaCasa(), quemId: user.id });
  revalidar(clientId);
}

/**
 * Corrige a data da ÚLTIMA visita (o lápis da tabela): a visita sai do dia errado e vai pro certo, levando o que foi falado.
 * Data vazia apaga a última visita (a anterior passa a ser a última).
 */
export async function definirDataDaVisita(clientId: string, data: string) {
  const user = await requireModuleAccess("clientes");
  if (!(await clienteEDaCarteira(user, clientId))) return;

  const ultima = await prisma.visitaDaLoja.findFirst({ where: { clientId }, orderBy: { dia: "desc" } });
  if (!data) {
    if (ultima) await apagarVisita(clientId, ultima.id);
    else await sincronizarUltimaVisita(clientId);
    revalidar(clientId);
    return;
  }
  const dia = diaDoTexto(data);
  if (!dia) return;
  if (ultima && ultima.dia.getTime() === dia.getTime()) return;
  const r = await registrarVisita({ clientId, dia, nota: ultima?.nota ?? null, quemId: ultima?.quemId ?? user.id });
  if (!r.ok) return;
  // Moveu a visita (não criou uma segunda): tira a do dia errado.
  if (ultima) await apagarVisita(clientId, ultima.id);
  revalidar(clientId);
}

// ── O histórico em bolha ──────────────────────────────────────────────────

export interface RespostaDoHistorico {
  ok: boolean;
  erro?: string;
  loja?: string;
  itens?: ItemDoHistorico[];
}

/** As visitas e as anotações da loja, pra bolha do histórico. */
export async function lerHistoricoDaLoja(clientId: string): Promise<RespostaDoHistorico> {
  const user = await requireModuleAccess("clientes");
  if (!(await clienteEDaCarteira(user, clientId))) return { ok: false, erro: "Esta loja não está na sua carteira." };
  const loja = await prisma.client.findUnique({ where: { id: clientId }, select: { companyName: true } });
  if (!loja) return { ok: false, erro: "Loja não encontrada." };
  return { ok: true, loja: loja.companyName, itens: await historicoDaLoja(clientId) };
}

/** Registra uma visita de um dia (hoje ou passado), com o que foi falado. */
export async function registrarVisitaComNota(clientId: string, data: string, nota: string): Promise<{ ok: boolean; erro?: string }> {
  const user = await requireModuleAccess("clientes");
  if (!(await clienteEDaCarteira(user, clientId))) return { ok: false, erro: "Esta loja não está na sua carteira." };
  const dia = diaDoTexto(data);
  if (!dia) return { ok: false, erro: "Escolha a data da visita." };
  const r = await registrarVisita({ clientId, dia, nota: String(nota ?? ""), quemId: user.id });
  if (!r.ok) return { ok: false, erro: r.erro };
  revalidar(clientId);
  return { ok: true };
}

/** Só anotar o que foi falado, sem marcar visita (ligação, conversa por WhatsApp…). */
export async function anotarNaLoja(clientId: string, nota: string): Promise<{ ok: boolean; erro?: string }> {
  const user = await requireModuleAccess("clientes");
  if (!(await clienteEDaCarteira(user, clientId))) return { ok: false, erro: "Esta loja não está na sua carteira." };
  const texto = String(nota ?? "").trim();
  if (texto.length < 2) return { ok: false, erro: "Escreva o que foi falado." };
  await prisma.clientHistory.create({ data: { clientId, note: texto.slice(0, 2000), authorId: user.id } });
  revalidar(clientId);
  return { ok: true };
}

/** Apaga uma visita registrada por engano. */
export async function apagarVisitaDaLoja(clientId: string, visitaId: string): Promise<{ ok: boolean; erro?: string }> {
  const user = await requireModuleAccess("clientes");
  if (!(await clienteEDaCarteira(user, clientId))) return { ok: false, erro: "Esta loja não está na sua carteira." };
  const ok = await apagarVisita(clientId, String(visitaId ?? ""));
  if (ok) revalidar(clientId);
  return ok ? { ok: true } : { ok: false, erro: "Não achei essa visita." };
}
