import "server-only";

import { prisma } from "@/lib/prisma";

// O retrato do que a Z-API mandou.
//
// ── Por que isto precisou existir ────────────────────────────────────────
//
// Porque o atendimento acontece DEPOIS da resposta HTTP, e isso fechou a
// única janela em que dava pra perguntar ao sistema o que ele tinha decidido.
// Quando uma mensagem de grupo sumia sem resposta, não sobrava nada pra
// olhar: nem log acessível, nem retorno. O diagnóstico virava chute, e chute
// custa o tempo de quem está do outro lado esperando funcionar.
//
// ── O que é guardado, e o que NÃO é ──────────────────────────────────────
//
// A estrutura do recado: quais campos vieram, se era grupo, quem escreveu, se
// o robô foi marcado. O TEXTO da mensagem não é guardado — pra descobrir por
// que o robô não respondeu basta saber se havia uma marcação nele, e guardar
// conversa de grupo de cliente num banco cria um problema maior que o que se
// está resolvendo.
//
// ── Por que guarda só os últimos ─────────────────────────────────────────
//
// Porque isto é uma lupa, não um arquivo. A pergunta que ele responde é
// sempre sobre a última mensagem que não funcionou.

/** Quantos recados ficam guardados. */
const GUARDA_OS_ULTIMOS = 30;

/** De quantas em quantas gravações uma limpeza acontece. */
const CHANCE_DE_LIMPAR = 0.1;

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null;
}

/**
 * Guarda o retrato. Nunca derruba o atendimento.
 *
 * Uma falha aqui não pode impedir uma mensagem de ser respondida: isto existe
 * pra ajudar a consertar o sistema, não pra fazer parte dele.
 */
export async function guardarRecado(corpo: Record<string, unknown>) {
  try {
    const t =
      corpo.text && typeof corpo.text === "object"
        ? (corpo.text as { message?: unknown }).message
        : null;
    const msg = typeof t === "string" ? t : "";

    const marcados =
      (Array.isArray(corpo.mentionedPhones) ? corpo.mentionedPhones : null) ??
      (corpo.text &&
      typeof corpo.text === "object" &&
      Array.isArray((corpo.text as { mentionedPhones?: unknown }).mentionedPhones)
        ? ((corpo.text as { mentionedPhones?: unknown[] }).mentionedPhones ?? [])
        : null);

    await prisma.recadoDaZapi.create({
      data: {
        chaves: Object.keys(corpo).join(", ").slice(0, 500),
        isGroup: typeof corpo.isGroup === "boolean" ? corpo.isGroup : null,
        fromMe: typeof corpo.fromMe === "boolean" ? corpo.fromMe : null,
        de: texto(corpo.phone),
        participante: texto(corpo.participantPhone),
        numeroDoRobo: texto(corpo.connectedPhone),
        mencionados: marcados ? JSON.stringify(marcados).slice(0, 300) : null,
        // Exatamente o que a detecção de menção procura no texto.
        temArrobaComNumero: /@[\d\s().-]{8,25}/.test(msg),
        tamanhoDoTexto: msg.length,
      },
    });

    if (Math.random() < CHANCE_DE_LIMPAR) void limpar();
  } catch {
    // Ver acima: a lupa não pode quebrar o que ela observa.
  }
}

async function limpar() {
  try {
    const ficam = await prisma.recadoDaZapi.findMany({
      orderBy: { recebidoEm: "desc" },
      take: GUARDA_OS_ULTIMOS,
      select: { id: true },
    });
    await prisma.recadoDaZapi.deleteMany({
      where: { id: { notIn: ficam.map((r) => r.id) } },
    });
  } catch {
    // Fica pra próxima.
  }
}
