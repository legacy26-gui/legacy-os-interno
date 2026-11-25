import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { achatar } from "./entender-pedido";

// A CONTINUIDADE da conversa no grupo da loja.
//
// ── O erro que isto fecha (Clube Mais, 25/11/2026) ────────────────────────
//
// O robô perguntou "Qual desses eu tiro do ar?" com 4 anúncios do Pulse. O Guilherme respondeu com os nomes ("pause todos
// Stories, vídeo, vídeos, feed - stories") e o robô leu a resposta como um pedido NOVO, solto: pausou todo anúncio da loja com
// esses nomes, de todos os carros. Agora a pergunta fica guardada, e a resposta de quem pediu escolhe SÓ dentro dela.

export const VALE_MS = 15 * 60 * 1000;
export type TipoDaPergunta = "qual" | "confirmar";
export interface Candidato {
  adId: string;
  nome: string;
}

export async function guardarPergunta(p: { grupoId: string; clientId: string; quem: string | null; tipo: TipoDaPergunta; candidatos: Candidato[] }) {
  const dados = { clientId: p.clientId, quem: p.quem, tipo: p.tipo, candidatos: p.candidatos as unknown as Prisma.InputJsonValue, feitaEm: new Date() };
  await prisma.perguntaNoGrupo.upsert({ where: { grupoId: p.grupoId }, create: { grupoId: p.grupoId, ...dados }, update: dados });
}

export async function lerPergunta(grupoId: string, agora = new Date()) {
  const p = await prisma.perguntaNoGrupo.findUnique({ where: { grupoId } });
  if (!p) return null;
  if (agora.getTime() - p.feitaEm.getTime() > VALE_MS) {
    await prisma.perguntaNoGrupo.deleteMany({ where: { grupoId } });
    return null;
  }
  const candidatos = Array.isArray(p.candidatos)
    ? (p.candidatos as unknown[]).filter((c): c is Candidato => !!c && typeof c === "object" && typeof (c as Candidato).adId === "string" && typeof (c as Candidato).nome === "string")
    : [];
  return candidatos.length ? { ...p, tipo: p.tipo as TipoDaPergunta, candidatos } : null;
}

export async function apagarPergunta(grupoId: string) {
  await prisma.perguntaNoGrupo.deleteMany({ where: { grupoId } });
}

export type RespostaDaPergunta = { tipo: "escolheu"; adIds: string[] } | { tipo: "cancelou" } | null;

/**
 * Lê a resposta à pergunta aberta. Só escolhe DENTRO dos candidatos. `null` = a mensagem não é resposta (segue o fluxo normal).
 * Pura.
 *
 *  - "nenhum", "não", "cancela", "deixa" → cancela;
 *  - pergunta "confirmar": "sim", "pode", "confirmo", "ok" → todos;
 *  - pergunta "qual": números da lista ("1 e 3", "2,4"), "todos"/"todas"/"ambos", ou as palavras do nome de cada um.
 */
export function lerResposta(texto: string, tipo: TipoDaPergunta, candidatos: Candidato[]): RespostaDaPergunta {
  const t = achatar(texto);
  if (!t) return null;
  if (/\b(nenhum|nenhuma|cancela|cancelar|deixa|esquece|nao)\b/.test(t)) return { tipo: "cancelou" };
  if (tipo === "confirmar") {
    return /\b(sim|pode|confirmo|confirma|ok|isso|manda|beleza|positivo)\b/.test(t) ? { tipo: "escolheu", adIds: candidatos.map((c) => c.adId) } : null;
  }
  if (/\b(todos|todas|tudo|ambos|os dois|as duas)\b/.test(t)) return { tipo: "escolheu", adIds: candidatos.map((c) => c.adId) };

  const escolhidos = new Set<string>();
  // Números da lista (1 a N). Só número solto: "2024" de um ano não é item.
  for (const m of t.matchAll(/(?<![\d])(\d{1,2})(?![\d])/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= candidatos.length) escolhidos.add(candidatos[n - 1].adId);
  }
  if (escolhidos.size > 0) return { tipo: "escolheu", adIds: [...escolhidos] };

  // Pelo nome: o candidato cujas palavras (do pedaço depois do "—", que é o que diferencia na lista) estão TODAS na resposta.
  const palavras = new Set(t.split(" ").map((p) => p.replace(/s$/, "")));
  for (const c of candidatos) {
    const proprio = c.nome.includes(" — ") ? c.nome.split(" — ").slice(1).join(" ") : c.nome;
    const dele = achatar(proprio).split(" ").filter((p) => p.length >= 2).map((p) => p.replace(/s$/, ""));
    if (dele.length > 0 && dele.every((p) => palavras.has(p))) escolhidos.add(c.adId);
  }
  return escolhidos.size > 0 ? { tipo: "escolheu", adIds: [...escolhidos] } : null;
}
