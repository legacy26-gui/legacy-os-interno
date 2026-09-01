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

// `ok` é o que diz ao formulário que deu certo — sem ele a tela não tem como
// saber a diferença entre "acabou de abrir" e "salvou".
export type SaleFormState = { error?: string; ok?: boolean } | undefined;

function lerFormulario(formData: FormData) {
  return SaleSchema.safeParse({
    description: formData.get("description") || undefined,
    value: formData.get("value"),
    adSpend: formData.get("adSpend") || 0,
    soldAt: formData.get("soldAt"),
  });
}

// A venda aparece na página do cliente, na Gestão de Contas e no Ranking de
// Lojas — mexeu em uma, as três precisam ser refeitas.
function revalidarVendas(clientId: string) {
  revalidatePath(`/gestao-contas/${clientId}`);
  revalidatePath("/gestao-contas");
  revalidatePath("/ranking-lojas");
}

export async function createClientSale(
  clientId: string,
  _prevState: SaleFormState,
  formData: FormData
): Promise<SaleFormState> {
  const user = await requireModuleAccess("gestao-contas");
  const parsed = lerFormulario(formData);
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
  revalidarVendas(clientId);
  return { ok: true };
}

/** Corrige uma venda já lançada — valor, investimento, descrição ou data. */
export async function updateClientSale(
  saleId: string,
  _prevState: SaleFormState,
  formData: FormData
): Promise<SaleFormState> {
  await requireModuleAccess("gestao-contas");
  const parsed = lerFormulario(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const venda = await prisma.clientSale.findUnique({ where: { id: saleId }, select: { clientId: true } });
  if (!venda) return { error: "Esta venda não existe mais." };

  const { soldAt, description, ...rest } = parsed.data;
  await prisma.clientSale.update({
    where: { id: saleId },
    data: {
      ...rest,
      description: description?.trim() || null,
      soldAt: new Date(`${soldAt}T00:00:00Z`),
    },
  });
  revalidarVendas(venda.clientId);
  return { ok: true };
}

export async function deleteClientSale(clientId: string, saleId: string) {
  await requireModuleAccess("gestao-contas");
  await prisma.clientSale.delete({ where: { id: saleId } });
  revalidarVendas(clientId);
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
