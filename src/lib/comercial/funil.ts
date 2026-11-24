import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Empresa, LeadStage } from "@/generated/prisma/enums";

// Regras do funil do Comercial que valem pra quem mexe no cartão: a tela (arrastar) e o WhatsApp.
// Moram aqui, e não em actions/leads.ts, porque aquele arquivo é "use server" (só exporta ação) e porque a regra tem que
// ser UMA só: cartão que anda pelo WhatsApp tem que deixar os mesmos marcos e o mesmo evento de venda que o arrastar.

export const ETAPAS = [
  "LEAD",
  "QUALIFICADO",
  "REUNIAO_AGENDADA",
  "REUNIAO_REALIZADA",
  "PROPOSTA",
  "NEGOCIACAO",
  "FECHADO",
  "PERDIDO",
] as const;

/**
 * Marcos que já aconteceram quando o cartão chega numa etapa. Só preenche o que
 * estiver vazio: o cartão pode ir e voltar, mas a reunião que aconteceu não
 * "desacontece" — é isso que segura os números do dashboard de pé.
 */
export function marcosDaEtapa(etapa: LeadStage, agora: Date) {
  const ordem = ETAPAS.indexOf(etapa as (typeof ETAPAS)[number]);
  const passou = (alvo: (typeof ETAPAS)[number]) => etapa !== "PERDIDO" && ordem >= ETAPAS.indexOf(alvo);

  return {
    qualifiedAt: passou("QUALIFICADO") ? agora : undefined,
    meetingSetAt: passou("REUNIAO_AGENDADA") ? agora : undefined,
    meetingHeldAt: passou("REUNIAO_REALIZADA") ? agora : undefined,
    proposalAt: passou("PROPOSTA") ? agora : undefined,
  };
}

/**
 * Mantém o painel de vendas/metas em dia sozinho: cartão em Fechado vira um
 * evento de venda; cartão que sai de Fechado leva o evento junto. Assim ninguém
 * precisa lançar a mesma venda duas vezes.
 */
export async function sincronizarEventoDaVenda(lead: {
  id: string;
  empresa: Empresa;
  stage: LeadStage;
  companyName: string;
  monthlyValue: unknown;
}) {
  if (lead.stage === "FECHADO") {
    await prisma.commercialEvent.upsert({
      where: { leadId: lead.id },
      create: {
        leadId: lead.id,
        // O evento é da mesma empresa do lead que o gerou, não da tela aberta.
        empresa: lead.empresa,
        type: "VENDA",
        companyName: lead.companyName,
        value: Number(lead.monthlyValue),
      },
      update: { companyName: lead.companyName, value: Number(lead.monthlyValue) },
    });
  } else {
    await prisma.commercialEvent.deleteMany({ where: { leadId: lead.id } });
  }
  // Fora de uma requisição da tela (o robô do WhatsApp roda em segundo plano) o Next pode recusar o revalidate. O evento
  // já está gravado: a tela só mostra o número novo na próxima abertura.
  try {
    revalidatePath("/dashboard");
  } catch {
    /* sem contexto de requisição */
  }
}
