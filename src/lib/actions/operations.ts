"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

// Pacote de tarefas padrão criado para cada cliente da operação.
const STANDARD_TASKS = [
  "Reunião semanal",
  "Enviar verba",
  "Conferir verba",
  "Reservar criativos",
  "Enviar relatório mensal",
] as const;

export async function assignClientManager(clientId: string, managerId: string) {
  await requireModuleAccess("operacoes");
  await prisma.client.update({
    where: { id: clientId },
    data: { managerId: managerId || null },
  });
  revalidatePath("/operacoes");
}

export async function generateStandardTasks(clientId: string) {
  await requireModuleAccess("operacoes");

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, managerId: true },
  });
  if (!client) return;

  // Não duplica: só cria as tarefas padrão que ainda não existem para o cliente.
  const existing = await prisma.task.findMany({
    where: { clientId, title: { in: [...STANDARD_TASKS] } },
    select: { title: true },
  });
  const existingTitles = new Set(existing.map((t) => t.title));
  const toCreate = STANDARD_TASKS.filter((title) => !existingTitles.has(title));

  if (toCreate.length > 0) {
    await prisma.task.createMany({
      data: toCreate.map((title) => ({
        clientId,
        title,
        assigneeId: client.managerId,
        priority: "MEDIA" as const,
      })),
    });
  }
  revalidatePath("/operacoes");
}

export async function createClientTask(clientId: string, formData: FormData) {
  await requireModuleAccess("operacoes");
  const title = (formData.get("title") as string)?.trim();
  if (!title || title.length < 2) return;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { managerId: true },
  });

  await prisma.task.create({
    data: { clientId, title, assigneeId: client?.managerId ?? null, priority: "MEDIA" },
  });
  revalidatePath("/operacoes");
}
