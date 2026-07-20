// Únicos dias de vencimento/pagamento aceitos no sistema.
export const PAYMENT_DAYS = [5, 10, 15, 20, 25, 30] as const;

export const CLIENT_STATUS_LABELS = {
  ATIVO: "Ativo",
  IMPLANTACAO: "Em implantação",
  PAUSADO: "Pausado",
  CANCELADO: "Cancelado",
} as const;

export const CLIENT_STATUS_COLORS = {
  ATIVO: "bg-emerald-500/15 text-emerald-500",
  IMPLANTACAO: "bg-amber-500/15 text-amber-500",
  PAUSADO: "bg-zinc-500/15 text-zinc-400",
  CANCELADO: "bg-red-500/15 text-red-500",
} as const;

export const REVENUE_STATUS_LABELS = {
  PAGO: "Pago",
  PENDENTE: "Pendente",
  ATRASADO: "Atrasado",
} as const;

export const REVENUE_STATUS_COLORS = {
  PAGO: "bg-emerald-500/15 text-emerald-500",
  PENDENTE: "bg-amber-500/15 text-amber-500",
  ATRASADO: "bg-red-500/15 text-red-500",
} as const;

export const TASK_STATUS_LABELS = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  FINALIZADO: "Finalizado",
} as const;

export const TASK_PRIORITY_LABELS = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Urgente",
} as const;

export const TASK_PRIORITY_COLORS = {
  BAIXA: "bg-zinc-500/15 text-zinc-400",
  MEDIA: "bg-blue-500/15 text-blue-500",
  ALTA: "bg-amber-500/15 text-amber-500",
  URGENTE: "bg-red-500/15 text-red-500",
} as const;

export const LEAD_STAGE_LABELS = {
  LEAD: "Lead",
  CONTATO: "Contato",
  REUNIAO: "Reunião",
  PROPOSTA: "Proposta",
  NEGOCIACAO: "Negociação",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
} as const;

export const LEAD_ORIGIN_LABELS = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
  INDICACAO: "Indicação",
  SITE: "Site",
  TRAFEGO_PAGO: "Tráfego Pago",
} as const;

export const CONTENT_STATUS_LABELS = {
  IDEIA: "Ideia",
  PRODUCAO: "Produção",
  APROVACAO: "Aprovação",
  PUBLICADO: "Publicado",
} as const;

export const CONTRACT_STATUS_LABELS = {
  RASCUNHO: "Rascunho",
  AGUARDANDO_ASSINATURA: "Aguardando assinatura",
  ASSINADO: "Assinado",
  CANCELADO: "Cancelado",
} as const;

export const CONTRACT_TEMPLATE_TYPE_LABELS = {
  TRAFEGO_PAGO: "Tráfego Pago",
  SITE: "Site",
  GESTAO_COMPLETA: "Gestão Completa",
  OUTRO: "Outro",
} as const;

export const TICKET_STATUS_LABELS = {
  ABERTO: "Aberto",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  RESOLVIDO: "Resolvido",
} as const;

export const TICKET_STATUS_COLORS = {
  ABERTO: "bg-amber-500/15 text-amber-500",
  EM_ANDAMENTO: "bg-blue-500/15 text-blue-500",
  AGUARDANDO_CLIENTE: "bg-zinc-500/15 text-zinc-400",
  RESOLVIDO: "bg-emerald-500/15 text-emerald-500",
} as const;

export const CAMPAIGN_CHANGE_TYPE_LABELS = {
  CAMPANHA_CRIADA: "Campanha criada",
  CAMPANHA_PAUSADA: "Campanha pausada",
  CRIATIVO_ALTERADO: "Criativo alterado",
  CRIATIVO_NOVO: "Criativo novo",
  PUBLICO_ALTERADO: "Público alterado",
  ORCAMENTO_ALTERADO: "Orçamento alterado",
  OUTRO: "Outro",
} as const;

export function formatCurrency(value: number | string) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("pt-BR");
}
