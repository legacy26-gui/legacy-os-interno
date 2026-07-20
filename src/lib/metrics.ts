import "server-only";
import { prisma } from "@/lib/prisma";

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

function yearRange(year: number) {
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
}

export async function getFinanceOverview(refDate = new Date()) {
  const month = refDate.toISOString().slice(0, 7);
  const year = refDate.getUTCFullYear();
  const { start: monthStart, end: monthEnd } = monthRange(month);
  const { start: yearStart, end: yearEnd } = yearRange(year);

  const [activeClients, revenuesThisMonth, revenuesThisYear, expensesThisMonth, goal, pendingRevenues, overdue, dueToday, dueSoon] =
    await Promise.all([
      prisma.client.findMany({ where: { status: "ATIVO" } }),
      prisma.revenue.findMany({ where: { status: "PAGO", paidDate: { gte: monthStart, lt: monthEnd } } }),
      prisma.revenue.findMany({ where: { status: "PAGO", paidDate: { gte: yearStart, lt: yearEnd } } }),
      prisma.expense.findMany({ where: { date: { gte: monthStart, lt: monthEnd } } }),
      prisma.monthlyGoal.findUnique({ where: { month } }),
      prisma.revenue.findMany({ where: { status: { in: ["PENDENTE", "ATRASADO"] } } }),
      prisma.revenue.findMany({
        where: { status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { lt: new Date(new Date().toDateString()) } },
        include: { client: { select: { companyName: true } } },
      }),
      prisma.revenue.findMany({
        where: {
          status: { in: ["PENDENTE", "ATRASADO"] },
          dueDate: { gte: new Date(new Date().toDateString()), lt: new Date(new Date().toDateString() + " 23:59:59") },
        },
        include: { client: { select: { companyName: true } } },
      }),
      prisma.revenue.findMany({
        where: {
          status: { in: ["PENDENTE", "ATRASADO"] },
          dueDate: { gte: new Date(), lt: new Date(Date.now() + 3 * 86400000) },
        },
        include: { client: { select: { companyName: true } } },
      }),
    ]);

  const mrr = activeClients.reduce((s, c) => s + Number(c.monthlyValue), 0);
  const faturamentoMensal = revenuesThisMonth.reduce((s, r) => s + Number(r.value), 0);
  const faturamentoAnual = revenuesThisYear.reduce((s, r) => s + Number(r.value), 0);
  const despesasMes = expensesThisMonth.reduce((s, e) => s + Number(e.value), 0);
  const lucroEstimado = faturamentoMensal - despesasMes;
  const aReceber = pendingRevenues.reduce((s, r) => s + Number(r.value), 0);
  const ticketMedio = activeClients.length > 0 ? mrr / activeClients.length : 0;
  const targetRevenue = goal ? Number(goal.targetRevenue) : 0;
  const percentAtingido = targetRevenue > 0 ? Math.min(999, (faturamentoMensal / targetRevenue) * 100) : 0;

  const clientesInadimplentes = new Set(overdue.map((r) => r.clientId)).size;

  return {
    month,
    mrr,
    faturamentoMensal,
    faturamentoAnual,
    despesasMes,
    lucroEstimado,
    aReceber,
    ticketMedio,
    clientesAtivos: activeClients.length,
    clientesInadimplentes,
    targetRevenue,
    percentAtingido,
    alerts: { overdue, dueToday, dueSoon },
  };
}

export async function getRevenueByClient() {
  const revenues = await prisma.revenue.groupBy({
    by: ["clientId"],
    _sum: { value: true },
    where: { status: "PAGO" },
  });
  const clients = await prisma.client.findMany({
    where: { id: { in: revenues.map((r) => r.clientId) } },
    select: { id: true, companyName: true, city: true },
  });
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  return revenues
    .map((r) => ({
      clientId: r.clientId,
      companyName: clientMap.get(r.clientId)?.companyName ?? "—",
      city: clientMap.get(r.clientId)?.city ?? "—",
      total: Number(r._sum.value ?? 0),
    }))
    .sort((a, b) => b.total - a.total);
}

export async function getRevenueByCity() {
  const byClient = await getRevenueByClient();
  const map = new Map<string, number>();
  for (const c of byClient) {
    const key = c.city || "Não informado";
    map.set(key, (map.get(key) ?? 0) + c.total);
  }
  return Array.from(map.entries())
    .map(([city, total]) => ({ city, total }))
    .sort((a, b) => b.total - a.total);
}

export async function getOperationsOverview() {
  const [activeCampaigns, pendingReports, pendingTasks, clientsWithoutRecentContact, leadsThisMonth] =
    await Promise.all([
      prisma.campaign.count({ where: { periodEnd: { gte: new Date() } } }),
      prisma.report.count(),
      prisma.task.count({ where: { status: { not: "FINALIZADO" } } }),
      prisma.client.count({
        where: {
          status: "ATIVO",
          history: { none: { createdAt: { gte: new Date(Date.now() - 14 * 86400000) } } },
        },
      }),
      prisma.lead.count({ where: { createdAt: { gte: new Date(new Date().toISOString().slice(0, 7) + "-01") } } }),
    ]);

  return { activeCampaigns, pendingReports, pendingTasks, clientsWithoutRecentContact, leadsThisMonth };
}

export async function getCommercialOverview() {
  const monthStart = new Date(new Date().toISOString().slice(0, 7) + "-01");
  const [newLeads, meetings, proposals, contractsAwaitingSignature, closedDeals] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.lead.count({ where: { stage: "REUNIAO" } }),
    prisma.lead.count({ where: { stage: "PROPOSTA" } }),
    prisma.contract.count({ where: { status: "AGUARDANDO_ASSINATURA" } }),
    prisma.lead.count({ where: { stage: "FECHADO", updatedAt: { gte: monthStart } } }),
  ]);

  return { newLeads, meetings, proposals, contractsAwaitingSignature, closedDeals };
}

export interface AutomationAlert {
  type: "vencimento" | "inadimplencia" | "contrato" | "campanha" | "relatorio";
  message: string;
}

export async function getAutomationAlerts(): Promise<AutomationAlert[]> {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  const [overdueRevenues, staleContracts, staleCampaigns, activeClients, recentReports] = await Promise.all([
    prisma.revenue.findMany({
      where: { status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { lt: now } },
      include: { client: { select: { companyName: true } } },
    }),
    prisma.contract.findMany({
      where: { status: "AGUARDANDO_ASSINATURA", sentAt: { lt: threeDaysAgo } },
      include: { client: { select: { companyName: true } } },
    }),
    prisma.campaign.findMany({
      where: { periodEnd: { gte: now }, updatedAt: { lt: fourteenDaysAgo } },
      include: { client: { select: { companyName: true } } },
    }),
    prisma.client.findMany({ where: { status: "ATIVO" }, select: { id: true, companyName: true } }),
    prisma.report.findMany({ where: { createdAt: { gte: thirtyDaysAgo } }, select: { clientId: true } }),
  ]);

  const recentReportClientIds = new Set(recentReports.map((r) => r.clientId));
  const alerts: AutomationAlert[] = [];

  for (const r of overdueRevenues) {
    alerts.push({ type: "inadimplencia", message: `${r.client.companyName} está com pagamento em atraso.` });
  }
  for (const c of staleContracts) {
    alerts.push({ type: "contrato", message: `Contrato de ${c.client.companyName} aguardando assinatura há mais de 3 dias.` });
  }
  for (const c of staleCampaigns) {
    alerts.push({ type: "campanha", message: `Campanha de ${c.client.companyName} sem atualização há mais de 14 dias.` });
  }
  for (const client of activeClients) {
    if (!recentReportClientIds.has(client.id)) {
      alerts.push({ type: "relatorio", message: `${client.companyName} está sem relatório gerado nos últimos 30 dias.` });
    }
  }

  return alerts;
}
