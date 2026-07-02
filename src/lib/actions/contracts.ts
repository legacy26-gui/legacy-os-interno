"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { formatCurrency, formatDate } from "@/lib/labels";

const ContractSchema = z.object({
  clientId: z.string().min(1, "Selecione um cliente."),
  templateId: z.string().min(1, "Selecione um modelo."),
  value: z.coerce.number().positive("Valor deve ser maior que zero."),
});

export type ContractFormState = { error?: string } | undefined;

function fillTemplate(body: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value || "—"), body);
}

export async function createContract(_prevState: ContractFormState, formData: FormData): Promise<ContractFormState> {
  await requireModuleAccess("contratos");
  const parsed = ContractSchema.safeParse({
    clientId: formData.get("clientId"),
    templateId: formData.get("templateId"),
    value: formData.get("value"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const [client, template] = await Promise.all([
    prisma.client.findUnique({ where: { id: parsed.data.clientId } }),
    prisma.contractTemplate.findUnique({ where: { id: parsed.data.templateId } }),
  ]);
  if (!client || !template) return { error: "Cliente ou modelo inválido." };

  const content = fillTemplate(template.bodyTemplate, {
    clientName: client.companyName,
    clientCnpj: client.cnpj ?? "",
    clientCity: client.city ?? "",
    clientState: client.state ?? "",
    value: formatCurrency(parsed.data.value),
    plan: client.plan ?? "",
    startDate: formatDate(client.startDate ?? new Date()),
  });

  const contract = await prisma.contract.create({
    data: {
      clientId: client.id,
      templateId: template.id,
      content,
      value: parsed.data.value,
      status: "RASCUNHO",
    },
  });

  revalidatePath("/contratos");
  redirect(`/contratos/${contract.id}`);
}

export async function updateContractStatus(contractId: string, status: string) {
  await requireModuleAccess("contratos");
  const data: { status: string; sentAt?: Date; signedAt?: Date } = { status };
  if (status === "AGUARDANDO_ASSINATURA") data.sentAt = new Date();
  if (status === "ASSINADO") data.signedAt = new Date();
  await prisma.contract.update({ where: { id: contractId }, data: data as never });
  revalidatePath("/contratos");
  revalidatePath(`/contratos/${contractId}`);
}

export async function deleteContract(contractId: string) {
  await requireModuleAccess("contratos");
  await prisma.contract.delete({ where: { id: contractId } });
  revalidatePath("/contratos");
  redirect("/contratos");
}
