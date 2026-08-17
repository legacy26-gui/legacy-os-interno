"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

const SaleSchema = z.object({
  description: z.string().optional(),
  value: z.coerce.number().positive("Informe o valor da venda."),
  adSpend: z.coerce.number().min(0, "Investimento inválido."),
  soldAt: z.string().min(1, "Informe a data da venda."),
});

export type SaleFormState = { error?: string } | undefined;

export async function createClientSale(
  clientId: string,
  _prevState: SaleFormState,
  formData: FormData
): Promise<SaleFormState> {
  const user = await requireModuleAccess("gestao-contas");
  const parsed = SaleSchema.safeParse({
    description: formData.get("description") || undefined,
    value: formData.get("value"),
    adSpend: formData.get("adSpend") || 0,
    soldAt: formData.get("soldAt"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { soldAt, description, ...rest } = parsed.data;
  await prisma.clientSale.create({
    data: {
      ...rest,
      clientId,
      description: description?.trim() || null,
      soldAt: new Date(`${soldAt}T00:00:00Z`),
      createdById: user.id,
    },
  });
  revalidatePath(`/gestao-contas/${clientId}`);
  revalidatePath("/gestao-contas");
}

export async function deleteClientSale(clientId: string, saleId: string) {
  await requireModuleAccess("gestao-contas");
  await prisma.clientSale.delete({ where: { id: saleId } });
  revalidatePath(`/gestao-contas/${clientId}`);
  revalidatePath("/gestao-contas");
}

const PinnedSchema = z.object({
  label: z.string().min(1, "Informe o nome da informação (ex: Verba)."),
  value: z.string().min(1, "Informe o conteúdo."),
});

export type PinnedFormState = { error?: string } | undefined;

export async function createPinnedInfo(
  clientId: string,
  _prevState: PinnedFormState,
  formData: FormData
): Promise<PinnedFormState> {
  await requireModuleAccess("gestao-contas");
  const parsed = PinnedSchema.safeParse({
    label: formData.get("label"),
    value: formData.get("value"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  await prisma.clientPinnedInfo.create({
    data: { clientId, label: parsed.data.label.trim(), value: parsed.data.value.trim() },
  });
  revalidatePath(`/gestao-contas/${clientId}`);
}

export async function deletePinnedInfo(clientId: string, infoId: string) {
  await requireModuleAccess("gestao-contas");
  await prisma.clientPinnedInfo.delete({ where: { id: infoId } });
  revalidatePath(`/gestao-contas/${clientId}`);
}
