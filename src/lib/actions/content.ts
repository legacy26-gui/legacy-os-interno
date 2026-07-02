"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

const ContentSchema = z.object({
  clientId: z.string().optional(),
  title: z.string().min(2, "Informe um título."),
  description: z.string().optional(),
  platforms: z.array(z.string()).min(1, "Selecione ao menos uma plataforma."),
  scheduledDate: z.string().optional(),
  status: z.enum(["IDEIA", "PRODUCAO", "APROVACAO", "PUBLICADO"]),
  mediaUrl: z.string().optional(),
});

export type ContentFormState = { error?: string } | undefined;

export async function createContentItem(_prevState: ContentFormState, formData: FormData): Promise<ContentFormState> {
  await requireModuleAccess("marketing");
  const parsed = ContentSchema.safeParse({
    clientId: formData.get("clientId") || undefined,
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    platforms: formData.getAll("platforms"),
    scheduledDate: formData.get("scheduledDate") || undefined,
    status: formData.get("status"),
    mediaUrl: formData.get("mediaUrl") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { scheduledDate, ...rest } = parsed.data;
  await prisma.contentItem.create({
    data: { ...rest, scheduledDate: scheduledDate ? new Date(scheduledDate) : null },
  });
  revalidatePath("/marketing");
}

export async function updateContentStatus(itemId: string, status: string) {
  await requireModuleAccess("marketing");
  await prisma.contentItem.update({ where: { id: itemId }, data: { status: status as never } });
  revalidatePath("/marketing");
}

export async function deleteContentItem(itemId: string) {
  await requireModuleAccess("marketing");
  await prisma.contentItem.delete({ where: { id: itemId } });
  revalidatePath("/marketing");
}
