// Únicos dias de vencimento/pagamento aceitos no sistema.
export const PAYMENT_DAYS = [5, 10, 15, 20, 25, 30] as const;

export const EXPENSE_CATEGORIES = ["Salários", "Aluguel", "Ferramentas/Software", "Impostos", "Marketing", "Comissões", "Outros"];

// Planos contratados disponíveis no cadastro de cliente.
export const PLAN_OPTIONS = [
  "Gestão Completa",
  "Gestão Completa + Áquila IA",
  "Tráfego Pago",
  "Site",
  "Áquila IA",
  "Outro",
] as const;

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
  QUALIFICADO: "Qualificado",
  REUNIAO_AGENDADA: "Reunião agendada",
  REUNIAO_REALIZADA: "Reunião realizada",
  PROPOSTA: "Proposta",
  NEGOCIACAO: "Negociação",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
} as const;

// Cor da faixa no topo da coluna do quadro — o funil esquenta da esquerda
// (lead frio) pra direita (fechado).
export const LEAD_STAGE_COLORS = {
  LEAD: "bg-zinc-400",
  QUALIFICADO: "bg-sky-500",
  REUNIAO_AGENDADA: "bg-indigo-500",
  REUNIAO_REALIZADA: "bg-violet-500",
  PROPOSTA: "bg-amber-500",
  NEGOCIACAO: "bg-orange-500",
  FECHADO: "bg-emerald-500",
  PERDIDO: "bg-red-500",
} as const;

export const LEAD_CHANNEL_LABELS = {
  META: "Meta",
  PRESENCIAL: "Presencial",
  REDE: "Rede",
  MESA_LOJISTA: "Mesa do lojista",
  ORGANICO: "Orgânico",
} as const;

// Tag colorida do canal. Cada canal tem a sua cor e ela é a mesma no cartão, no
// filtro e no dashboard — é assim que se bate o olho e sabe de onde veio.
export const LEAD_CHANNEL_COLORS = {
  META: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PRESENCIAL: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  REDE: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  MESA_LOJISTA: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  ORGANICO: "bg-teal-500/15 text-teal-400 border-teal-500/30",
} as const;

// Versão sólida da mesma cor, pros gráficos e barras do dashboard.
export const LEAD_CHANNEL_SOLID = {
  META: "#3b82f6",
  PRESENCIAL: "#10b981",
  REDE: "#8b5cf6",
  MESA_LOJISTA: "#f59e0b",
  ORGANICO: "#14b8a6",
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

export const DAILY_REVIEW_CHECKS = [
  ["checkedBalance", "Verificou saldo da conta"],
  ["checkedDailyBudget", "Verificou orçamento diário"],
  ["checkedTodaySpend", "Verificou gasto de hoje"],
  ["checkedBillingLimit", "Verificou limite de cobrança"],
  ["checkedPendingPayments", "Verificou pagamentos pendentes"],
  ["checkedWhatsappResolved", "WhatsApp resolvido?"],
] as const;

export const WEEKLY_REVIEW_CHECKS = [
  ["paymentCleared", "Pagamento compensado"],
  ["reportGenerated", "Relatório semanal gerado"],
  ["checkedBestCampaigns", "Conferiu campanhas com melhor desempenho"],
  ["checkedWeeklyCost", "Conferiu custo total da semana"],
  ["definedNewCreatives", "Definiu novos criativos"],
  ["definedNewCampaigns", "Definiu novas campanhas"],
] as const;

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
