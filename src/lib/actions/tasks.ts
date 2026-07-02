"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

const TaskSchema = z.object({
  clientId: z.string().optional(),
  title: z.string().min(2, "Informe um título."),
  description: z.string().optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]),
});

export type TaskFormState = { error?: string } | undefined;

export async function createTask(_prevState: TaskFormState, formData: FormData): Promise<TaskFormState> {
  await requireModuleAccess("operacoes");
  const parsed = TaskSchema.safeParse({
    clientId: formData.get("clientId") || undefined,
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    assigneeId: formData.get("assigneeId") || undefined,
    dueDate: formData.get("dueDate") || undefined,
    priority: formData.get("priority"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { dueDate, ...rest } = parsed.data;
  await prisma.task.create({ data: { ...rest, dueDate: dueDate ? new Date(dueDate) : null } });
  revalidatePath("/operacoes");
}

export async function updateTaskStatus(taskId: string, status: string) {
  await requireModuleAccess("operacoes");
  await prisma.task.update({ where: { id: taskId }, data: { status: status as never } });
  revalidatePath("/operacoes");
}

export async function deleteTask(taskId: string) {
  await requireModuleAccess("operacoes");
  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath("/operacoes");
}
