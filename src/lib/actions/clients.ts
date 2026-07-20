"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess, getCurrentUser } from "@/lib/dal";
import { PAYMENT_DAYS } from "@/lib/labels";
import { ensureMonthlyMrrRevenues } from "@/lib/mrr-revenue";

const ClientSchema = z.object({
  companyName: z.string().min(2, "Informe o nome da empresa."),
  contactName: z.string().min(2, "Informe o nome do responsável."),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  city: z.string().optional(),
  state: z.string().optional(),
  cnpj: z.string().optional(),
  startDate: z.string().optional(),
  plan: z.string().optional(),
  monthlyValue: z.coerce.number().min(0, "Valor inválido."),
  dueDay: z.coerce
    .number()
    .int()
    .refine((v) => (PAYMENT_DAYS as readonly number[]).includes(v), "Dia de vencimento inválido.")
    .optional(),
  status: z.enum(["ATIVO", "IMPLANTACAO", "PAUSADO", "CANCELADO"]),
  internalNotes: z.string().optional(),
});

export type ClientFormState = { error?: string } | undefined;

function parseClientForm(formData: FormData) {
  return ClientSchema.safeParse({
    companyName: formData.get("companyName"),
    contactName: formData.get("contactName"),
    phone: formData.get("phone") || undefined,
    whatsapp: formData.get("whatsapp") || undefined,
    email: formData.get("email") || undefined,
    city: formData.get("city") || undefined,
    state: formData.get("state") || undefined,
    cnpj: formData.get("cnpj") || undefined,
    startDate: formData.get("startDate") || undefined,
    plan: formData.get("plan") || undefined,
    monthlyValue: formData.get("monthlyValue") || 0,
    dueDay: formData.get("dueDay") || undefined,
    status: formData.get("status"),
    internalNotes: formData.get("internalNotes") || undefined,
  });
}

export async function createClient(_prevState: ClientFormState, formData: FormData): Promise<ClientFormState> {
  await requireModuleAccess("clientes");

  const parsed = parseClientForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const client = await prisma.client.create({
    data: {
      ...data,
      email: data.email || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
    },
  });

  // Cliente ativo com mensalidade já entra automaticamente no Financeiro,
  // lançado no dia de pagamento escolhido — sem precisar esperar o mês virar.
  if (client.status === "ATIVO" && Number(client.monthlyValue) > 0) {
    await ensureMonthlyMrrRevenues();
  }

  revalidatePath("/clientes");
  revalidatePath("/financeiro");
  redirect(`/clientes/${client.id}`);
}

export async function updateClient(
  clientId: string,
  _prevState: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  await requireModuleAccess("clientes");

  const parsed = parseClientForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      ...data,
      email: data.email || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
    },
  });

  if (client.status === "ATIVO" && Number(client.monthlyValue) > 0) {
    await ensureMonthlyMrrRevenues();
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/financeiro");
  redirect(`/clientes/${clientId}`);
}

export async function deleteClient(clientId: string) {
  await requireModuleAccess("clientes");
  await prisma.client.delete({ where: { id: clientId } });
  revalidatePath("/clientes");
  redirect("/clientes");
}

const HistorySchema = z.object({ note: z.string().min(1, "Escreva uma observação.") });

export type HistoryFormState = { error?: string } | undefined;

export async function addClientHistory(
  clientId: string,
  _prevState: HistoryFormState,
  formData: FormData
): Promise<HistoryFormState> {
  const user = await requireModuleAccess("clientes");
  const parsed = HistorySchema.safeParse({ note: formData.get("note") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  await prisma.clientHistory.create({
    data: { clientId, note: parsed.data.note, authorId: user.id },
  });
  revalidatePath(`/clientes/${clientId}`);
}

const AttachmentSchema = z.object({
  fileName: z.string().min(1, "Informe um nome para o anexo."),
  url: z.string().url("Informe um link válido."),
});

export type AttachmentFormState = { error?: string } | undefined;

export async function addClientAttachment(
  clientId: string,
  _prevState: AttachmentFormState,
  formData: FormData
): Promise<AttachmentFormState> {
  await requireModuleAccess("clientes");
  const parsed = AttachmentSchema.safeParse({
    fileName: formData.get("fileName"),
    url: formData.get("url"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  await prisma.clientAttachment.create({
    data: { clientId, ...parsed.data },
  });
  revalidatePath(`/clientes/${clientId}`);
}

export async function deleteClientAttachment(clientId: string, attachmentId: string) {
  await requireModuleAccess("clientes");
  await prisma.clientAttachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/clientes/${clientId}`);
}

export async function ensureClientsAccess() {
  return getCurrentUser();
}
