import "server-only";

import { prisma } from "@/lib/prisma";
import { enviarTexto } from "./zapi";
import { anotar } from "./trilha";
import { acharPessoaPeloNumero } from "./atender-privado";
import { SEGUNDOS_MAXIMOS, transcreverAudio } from "./transcrever";
import { atenderGrupoFinanceiro } from "@/lib/financeiro-ia/atender-financeiro";
import { numerosPorExtenso } from "@/lib/financeiro-ia/numeros-por-extenso";

// Áudio no grupo financeiro: o dono fala, o robô transcreve e lança como se tivesse
// sido digitado.
//
// ── A ordem das travas é a parte importante ───────────────────────────────
//
// Transcrever custa dinheiro e manda o áudio pra fora. Então, ANTES de baixar nada:
//   1. o grupo tem que ser o financeiro de alguém;
//   2. quem falou tem que ser o DONO do grupo.
// Áudio de grupo de cliente, do grupo interno, ou de outra pessoa no financeiro é
// ignorado sem ser baixado, sem ser transcrito e sem resposta.

export type DesfechoDoAudio =
  | { tipo: "ignorado"; motivo: string }
  | { tipo: "falhou"; erro: string }
  | { tipo: "atendido" };

export async function atenderAudioDoGrupo(a: {
  grupoId: string;
  audioUrl: string;
  mimeType?: string | null;
  segundos?: number | null;
  telefone: string | null;
  messageId?: string | null;
}): Promise<DesfechoDoAudio> {
  const financeiro = await prisma.grupoFinanceiro.findUnique({
    where: { grupoId: a.grupoId },
    select: { donoId: true },
  });
  if (!financeiro) {
    await anotar(a.messageId, a.grupoId, "audio-ignorado", "grupo não é o financeiro");
    return { tipo: "ignorado", motivo: "grupo" };
  }

  const pessoa = a.telefone ? await acharPessoaPeloNumero(a.telefone) : null;
  if (!pessoa || pessoa.id !== financeiro.donoId) {
    await anotar(a.messageId, a.grupoId, "audio-ignorado", "quem falou não é o dono");
    return { tipo: "ignorado", motivo: "nao-e-o-dono" };
  }

  const responder = async (texto: string) => {
    const r = await enviarTexto(a.grupoId, texto);
    if (!r.ok) await anotar(a.messageId, a.grupoId, "financeiro-nao-enviou", r.erro ?? "");
  };

  if (a.segundos && a.segundos > SEGUNDOS_MAXIMOS) {
    await anotar(a.messageId, a.grupoId, "audio-longo", `${a.segundos}s`);
    await responder(`🎙️ Esse áudio tem ${Math.round(a.segundos)} segundos. Eu ouço até ${SEGUNDOS_MAXIMOS / 60} minutos: manda em partes menores.`);
    return { tipo: "falhou", erro: "longo" };
  }

  const t = await transcreverAudio(a.audioUrl, { mimeType: a.mimeType, segundos: a.segundos });
  if (!t.ok) {
    await anotar(a.messageId, a.grupoId, "audio-nao-transcreveu", t.erro);
    await responder(`🎙️ Não consegui ouvir esse áudio: ${t.erro}. Manda de novo ou escreve o gasto.`);
    return { tipo: "falhou", erro: t.erro };
  }

  // "quarenta e cinco" → "45", pro leitor de gastos entender.
  const texto = numerosPorExtenso(t.texto);
  await anotar(a.messageId, a.grupoId, "audio-transcrito", `${texto.length} caracteres`);

  await atenderGrupoFinanceiro(
    { grupoId: a.grupoId, texto, telefone: a.telefone, messageId: a.messageId, ouvido: t.texto },
    financeiro,
  );
  return { tipo: "atendido" };
}
