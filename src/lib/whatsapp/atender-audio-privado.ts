import "server-only";

import { enviarTexto } from "./zapi";
import { anotar } from "./trilha";
import { acharPessoaPeloNumero, atenderMensagemPrivada } from "./atender-privado";
import { SEGUNDOS_MAXIMOS, transcreverAudio } from "./transcrever";
import { canAccessModule } from "@/lib/permissions";
import { numerosPorExtenso } from "@/lib/financeiro-ia/numeros-por-extenso";

// Áudio no privado do robô: a pessoa da casa fala ("visitei a Vilela, conversei com o dono…"), o robô transcreve, mostra o
// que ouviu e trata como se tivesse sido digitado — vale pra todos os comandos do privado (visita, anotação, gravação,
// relatório, tarefa…) e pras perguntas.
//
// ── Ordem das travas (transcrever custa dinheiro e manda o áudio pra fora) ────────────────────────────────
//   1. o número tem que ser de alguém da casa, com acesso ao módulo de clientes — número de fora é ignorado SEM baixar nada;
//   2. áudio longo demais é recusado antes de baixar;
//   3. o robô repete o que ouviu ("🎙️ Ouvi: …") ANTES de agir, pra erro de transcrição aparecer na hora.

export async function atenderAudioPrivado(a: {
  telefone: string;
  audioUrl: string;
  mimeType?: string | null;
  segundos?: number | null;
  messageId?: string | null;
}): Promise<{ tipo: "ignorado" | "falhou" | "atendido" }> {
  const pessoa = await acharPessoaPeloNumero(a.telefone);
  if (!pessoa || !canAccessModule(pessoa.role, "clientes", pessoa.email)) {
    await anotar(a.messageId, a.telefone, "audio-privado-ignorado", pessoa ? "sem acesso" : "número de fora");
    return { tipo: "ignorado" };
  }

  const dizer = async (texto: string) => {
    const r = await enviarTexto(a.telefone, texto);
    if (!r.ok) await anotar(a.messageId, a.telefone, "audio-privado-nao-enviou", r.erro ?? "");
  };

  if (a.segundos && a.segundos > SEGUNDOS_MAXIMOS) {
    await dizer(`🎙️ Esse áudio tem ${Math.round(a.segundos)} segundos. Eu ouço até ${SEGUNDOS_MAXIMOS / 60} minutos: manda em partes menores.`);
    return { tipo: "falhou" };
  }

  const t = await transcreverAudio(a.audioUrl, { mimeType: a.mimeType });
  if (!t.ok) {
    await anotar(a.messageId, a.telefone, "audio-privado-nao-transcreveu", t.erro);
    await dizer(`🎙️ Não consegui ouvir esse áudio: ${t.erro}. Manda de novo ou escreve.`);
    return { tipo: "falhou" };
  }

  const ouvido = t.texto.trim();
  if (!ouvido) {
    await dizer("🎙️ Não ouvi nada nesse áudio. Manda de novo ou escreve.");
    return { tipo: "falhou" };
  }
  await anotar(a.messageId, a.telefone, "audio-privado-transcrito", `${ouvido.length} caracteres`);
  await dizer(`🎙️ Ouvi: “${ouvido.slice(0, 600)}”`);

  await atenderMensagemPrivada({ telefone: a.telefone, texto: numerosPorExtenso(ouvido), messageId: a.messageId });
  return { tipo: "atendido" };
}
