"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { diaDaCasaComoData } from "@/lib/dia-da-casa";
import { avisarTarefaNova, concluirTarefa, criarTarefa, pararTarefa, reabrirTarefa } from "@/lib/tarefas/dados";

// As tarefas pessoais, pelo Meu Dia. As regras (quem conclui, quem avisa) moram em src/lib/tarefas/dados.ts, as mesmas
// do WhatsApp: o clique e o "feito 2" fazem a mesma coisa.

export type TarefaFormState = { erro?: string; ok?: boolean } | undefined;

function revalidar() {
  revalidatePath("/meu-dia");
}

export async function criarTarefaPessoal(_prev: TarefaFormState, formData: FormData): Promise<TarefaFormState> {
  const user = await requireModuleAccess("clientes");
  const titulo = String(formData.get("titulo") ?? "").trim();
  if (titulo.length < 3) return { erro: "Escreva a tarefa (pelo menos 3 letras)." };

  const quando = String(formData.get("quando") ?? "");
  const repete = String(formData.get("repete") ?? "NENHUMA");
  const prazo = /^\d{4}-\d{2}-\d{2}$/.test(quando) ? new Date(`${quando}T00:00:00.000Z`) : null;
  const base = prazo ?? diaDaCasaComoData();

  // Atribuir a outra pessoa é só do dono e da gerência; pra qualquer outro, a tarefa é dele mesmo.
  let responsavelId = user.id;
  const pedido = String(formData.get("responsavelId") ?? "");
  if (pedido && pedido !== user.id && (user.role === "ADMIN" || user.role === "GERENTE")) {
    const alvo = await prisma.user.findFirst({ where: { id: pedido, active: true }, select: { id: true } });
    if (!alvo) return { erro: "Essa pessoa não está ativa." };
    responsavelId = alvo.id;
  }

  const recorrencia = repete === "DIARIA" || repete === "SEMANAL" || repete === "MENSAL" ? repete : "NENHUMA";
  const t = await criarTarefa({
    titulo,
    responsavelId,
    criadaPorId: user.id,
    recorrencia,
    prazo: recorrencia === "NENHUMA" ? prazo : base,
    diaDaSemana: recorrencia === "SEMANAL" ? base.getUTCDay() : null,
    diaDoMes: recorrencia === "MENSAL" ? base.getUTCDate() : null,
    origem: "sistema",
  });

  if (responsavelId !== user.id) {
    const alvo = await prisma.user.findUnique({ where: { id: responsavelId }, select: { whatsapp: true } });
    await avisarTarefaNova(t, user.name, alvo?.whatsapp ?? null, diaDaCasaComoData());
  }
  revalidar();
  return { ok: true };
}

export async function concluirTarefaPessoal(tarefaId: string) {
  const user = await requireModuleAccess("clientes");
  await concluirTarefa(tarefaId, diaDaCasaComoData(), { id: user.id, name: user.name, role: user.role });
  revalidar();
}

export async function reabrirTarefaPessoal(tarefaId: string) {
  const user = await requireModuleAccess("clientes");
  await reabrirTarefa(tarefaId, diaDaCasaComoData(), user.id, user.role);
  revalidar();
}

export async function pararTarefaPessoal(tarefaId: string) {
  const user = await requireModuleAccess("clientes");
  await pararTarefa(tarefaId, user.id, user.role);
  revalidar();
}
