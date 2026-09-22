import type { LeadChannel, LeadStage } from "@/generated/prisma/enums";

// Lead no formato que o quadro entende: só números, texto e data em ISO — nada
// de Decimal ou Date, que não atravessam do servidor pro componente de tela.
export interface LeadDoQuadro {
  id: string;
  companyName: string;
  contactName: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  channel: LeadChannel;
  stage: LeadStage;
  notes: string | null;
  monthlyValue: number;
  setupValue: number;
  contractMonths: number;
  noShowAt: string | null;
  wonAt: string | null;
  lostReason: string | null;
  createdAt: string;
  ownerName: string | null;
}

export const ETAPAS_DO_FUNIL: LeadStage[] = [
  "LEAD",
  "QUALIFICADO",
  "REUNIAO_AGENDADA",
  "REUNIAO_REALIZADA",
  "PROPOSTA",
  "NEGOCIACAO",
  "FECHADO",
  "PERDIDO",
];
