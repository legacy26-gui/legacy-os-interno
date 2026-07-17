"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

const PlaybookSchema = z.object({
  title: z.string().min(3, "Título muito curto."),
  tags: z.string().optional(),
  content: z.string().min(10, "Escreva um conteúdo com mais detalhes."),
});

export type PlaybookFormState = { error?: string } | undefined;

// Todo mundo lê playbooks; só Admin/Gerente cria, edita ou exclui.
async function requireCanEditPlaybooks() {
  const user = await requireModuleAccess("playbooks");
  if (user.role === "GESTOR_TRAFEGO") {
    redirect("/playbooks?erro=acesso-negado");
  }
  return user;
}

function parseTags(raw?: string): string[] {
  if (!raw) return [];
  return Array.from(new Set(raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)));
}

export async function createPlaybook(_prevState: PlaybookFormState, formData: FormData): Promise<PlaybookFormState> {
  const user = await requireCanEditPlaybooks();

  const parsed = PlaybookSchema.safeParse({
    title: formData.get("title"),
    tags: formData.get("tags"),
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const playbook = await prisma.playbook.create({
    data: {
      title: parsed.data.title,
      tags: parseTags(parsed.data.tags),
      content: parsed.data.content,
      authorId: user.id,
    },
  });

  revalidatePath("/playbooks");
  redirect(`/playbooks/${playbook.id}`);
}

export async function updatePlaybook(
  playbookId: string,
  _prevState: PlaybookFormState,
  formData: FormData
): Promise<PlaybookFormState> {
  await requireCanEditPlaybooks();

  const parsed = PlaybookSchema.safeParse({
    title: formData.get("title"),
    tags: formData.get("tags"),
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await prisma.playbook.update({
    where: { id: playbookId },
    data: {
      title: parsed.data.title,
      tags: parseTags(parsed.data.tags),
      content: parsed.data.content,
    },
  });

  revalidatePath("/playbooks");
  revalidatePath(`/playbooks/${playbookId}`);
  redirect(`/playbooks/${playbookId}`);
}

export async function deletePlaybook(playbookId: string) {
  await requireCanEditPlaybooks();
  await prisma.playbook.delete({ where: { id: playbookId } });
  revalidatePath("/playbooks");
  redirect("/playbooks");
}
