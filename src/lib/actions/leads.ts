"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import type { LeadStage } from "@/generated/prisma/enums";

const CANAIS = ["META", "PRESENCIAL", "REDE", "MESA_LOJISTA", "ORGANICO"] as const;
const ETAPAS = [
  "LEAD",
  "QUALIFICADO",
  "REUNIAO_AGENDADA",
  "REUNIAO_REALIZADA",
  "PROPOSTA",
  "NEGOCIACAO",
  "FECHADO",
  "PERDIDO",
] as const;

const LeadSchema = z.object({
  companyName: z.string().min(2, "Informe o nome da empresa."),
  contactName: z.string().min(2, "Informe o nome do contato."),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  phone: z.string().optional(),
  channel: z.enum(CANAIS),
  notes: z.string().optional(),
  monthlyValue: z.coerce.number().min(0).default(0),
  setupValue: z.coerce.number().min(0).default(0),
  contractMonths: z.coerce.number().int().min(1).max(120).default(12),
});

export type LeadFormState = { error?: string; ok?: boolean } | undefined;

function revalidar() {
  revalidatePath("/comercial");
  revalidatePath("/comercial/dashboard");
}

function lerFormulario(formData: FormData) {
  return LeadSchema.safeParse({
    companyName: formData.get("companyName"),
    contactName: formData.get("contactName"),
    city: formData.get("city") || undefined,
    state: (formData.get("state") as string)?.toUpperCase() || undefined,
    phone: formData.get("phone") || undefined,
    channel: formData.get("channel"),
    notes: formData.get("notes") || undefined,
    monthlyValue: formData.get("monthlyValue") || 0,
    setupValue: formData.get("setupValue") || 0,
    contractMonths: formData.get("contractMonths") || 12,
  });
}

export async function createLead(_prevState: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const user = await requireModuleAccess("comercial");
  const parsed = lerFormulario(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  // Entra no topo da primeira coluna, que é onde o olho procura o lead novo.
  const primeiro = await prisma.lead.findFirst({
    where: { stage: "LEAD" },
    orderBy: { position: "asc" },
    select: { position: true },
  });

  await prisma.lead.create({
    data: { ...parsed.data, ownerId: user.id, position: (primeiro?.position ?? 0) - 1 },
  });
  revalidar();
  return { ok: true };
}

export async function updateLead(
  leadId: string,
  _prevState: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  await requireModuleAccess("comercial");
  const parsed = lerFormulario(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const lead = await prisma.lead.update({ where: { id: leadId }, data: parsed.data });
  await sincronizarEventoDaVenda(lead);
  revalidar();
  return { ok: true };
}

/**
 * Marcos que já aconteceram quando o cartão chega numa etapa. Só preenche o que
 * estiver vazio: o cartão pode ir e voltar, mas a reunião que aconteceu não
 * "desacontece" — é isso que segura os números do dashboard de pé.
 */
function marcosDaEtapa(etapa: LeadStage, agora: Date) {
  const ordem = ETAPAS.indexOf(etapa as (typeof ETAPAS)[number]);
  const passou = (alvo: (typeof ETAPAS)[number]) =>
    etapa !== "PERDIDO" && ordem >= ETAPAS.indexOf(alvo);

  return {
    qualifiedAt: passou("QUALIFICADO") ? agora : undefined,
    meetingSetAt: passou("REUNIAO_AGENDADA") ? agora : undefined,
    meetingHeldAt: passou("REUNIAO_REALIZADA") ? agora : undefined,
    proposalAt: passou("PROPOSTA") ? agora : undefined,
  };
}

/**
 * Move o cartão de coluna (e de lugar dentro dela). É o que o arrastar chama.
 *
 * `indice` é a posição onde o cartão foi solto dentro da coluna de destino.
 */
export async function moverLead(leadId: string, etapa: string, indice: number) {
  await requireModuleAccess("comercial");
  if (!ETAPAS.includes(etapa as (typeof ETAPAS)[number])) return;
  const destino = etapa as LeadStage;

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;

  const agora = new Date();
  const marcos = marcosDaEtapa(destino, agora);

  const atualizado = await prisma.$transaction(async (tx) => {
    const salvo = await tx.lead.update({
      where: { id: leadId },
      data: {
        stage: destino,
        // Marco novo só grava se ainda não tinha data.
        qualifiedAt: lead.qualifiedAt ?? marcos.qualifiedAt ?? null,
        meetingSetAt: lead.meetingSetAt ?? marcos.meetingSetAt ?? null,
        meetingHeldAt: lead.meetingHeldAt ?? marcos.meetingHeldAt ?? null,
        proposalAt: lead.proposalAt ?? marcos.proposalAt ?? null,
        // Ganho e perdido são o estado de agora, não história: tirar o cartão
        // de Fechado tem que tirar a venda da conta também.
        wonAt: destino === "FECHADO" ? (lead.wonAt ?? agora) : null,
        lostAt: destino === "PERDIDO" ? (lead.lostAt ?? agora) : null,
        // Voltou pra reunião agendada de novo? O no-show anterior fica pra trás.
        noShowAt: destino === "REUNIAO_AGENDADA" ? null : lead.noShowAt,
      },
    });

    // Reordena a coluna de destino colocando o cartão no lugar onde foi solto.
    const vizinhos = await tx.lead.findMany({
      where: { stage: destino, id: { not: leadId } },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    const ordenados = [...vizinhos.map((v) => v.id)];
    ordenados.splice(Math.max(0, Math.min(indice, ordenados.length)), 0, leadId);
    await Promise.all(
      ordenados.map((id, i) => tx.lead.update({ where: { id }, data: { position: i } }))
    );

    return salvo;
  });

  await sincronizarEventoDaVenda(atualizado);
  revalidar();
}

/** A reunião estava marcada e o lojista não apareceu. */
export async function marcarNoShow(leadId: string) {
  await requireModuleAccess("comercial");
  await prisma.lead.update({
    where: { id: leadId },
    data: { noShowAt: new Date(), stage: "REUNIAO_AGENDADA", meetingHeldAt: null },
  });
  revalidar();
}

/** Remarcou depois do furo: limpa o no-show e conta como agendamento novo. */
export async function reagendarReuniao(leadId: string) {
  await requireModuleAccess("comercial");
  await prisma.lead.update({
    where: { id: leadId },
    data: { noShowAt: null, meetingSetAt: new Date(), stage: "REUNIAO_AGENDADA" },
  });
  revalidar();
}

export async function marcarPerdido(leadId: string, motivo: string) {
  await requireModuleAccess("comercial");
  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: { stage: "PERDIDO", lostAt: new Date(), wonAt: null, lostReason: motivo.trim() || null },
  });
  await sincronizarEventoDaVenda(lead);
  revalidar();
}

export async function deleteLead(leadId: string) {
  await requireModuleAccess("comercial");
  await prisma.lead.delete({ where: { id: leadId } });
  revalidar();
}

/**
 * Mantém o painel de vendas/metas em dia sozinho: cartão em Fechado vira um
 * evento de venda; cartão que sai de Fechado leva o evento junto. Assim ninguém
 * precisa lançar a mesma venda duas vezes.
 */
async function sincronizarEventoDaVenda(lead: {
  id: string;
  stage: LeadStage;
  companyName: string;
  monthlyValue: unknown;
}) {
  if (lead.stage === "FECHADO") {
    await prisma.commercialEvent.upsert({
      where: { leadId: lead.id },
      create: {
        leadId: lead.id,
        type: "VENDA",
        companyName: lead.companyName,
        value: Number(lead.monthlyValue),
      },
      update: { companyName: lead.companyName, value: Number(lead.monthlyValue) },
    });
  } else {
    await prisma.commercialEvent.deleteMany({ where: { leadId: lead.id } });
  }
  revalidatePath("/dashboard");
}
