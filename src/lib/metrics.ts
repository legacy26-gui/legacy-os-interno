import "server-only";
import { prisma } from "@/lib/prisma";

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

export async function getFinanceOverview(refDate = new Date()) {
  const month = refDate.toISOString().slice(0, 7);
  const { start: monthStart, end: monthEnd } = monthRange(month);

  const [activeClients, revenuesThisMonth, expensesThisMonth, goal, pendingRevenues, overdue, dueToday, dueSoon] =
    await Promise.all([
      prisma.client.findMany({ where: { status: "ATIVO", billingActive: true } }),
      // Faturado do mês = cobranças daquele mês que já foram confirmadas
      // ("Confirmar"/"marcar como pago"). Usa dueDate — e não paidDate — pra
      // que dar baixa retroativa num mês passado entre no faturado daquele
      // mês, e pra bater com o "confirmado" do quadro de MRR.
      prisma.revenue.findMany({ where: { status: "PAGO", dueDate: { gte: monthStart, lt: monthEnd } } }),
      prisma.expense.findMany({ where: { date: { gte: monthStart, lt: monthEnd } } }),
      prisma.monthlyGoal.findUnique({ where: { month } }),
      prisma.revenue.findMany({
        where: { status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { gte: monthStart, lt: monthEnd } },
      }),
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
  // Projeção anual = MRR atual × 12 (não soma histórico do ano).
  const faturamentoAnual = mrr * 12;
  const despesasFixas = expensesThisMonth
    .filter((e) => e.fixedExpenseId)
    .reduce((s, e) => s + Number(e.value), 0);
  const despesasVariaveis = expensesThisMonth
    .filter((e) => !e.fixedExpenseId)
    .reduce((s, e) => s + Number(e.value), 0);
  const despesasMes = despesasFixas + despesasVariaveis;
  // Lucro estimado = o que entrou no mês menos tudo que saiu (fixas + variáveis).
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
    despesasFixas,
    despesasVariaveis,
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

// Categoria de despesa tratada como imposto — sai da receita antes do EBITDA,
// que por definição é o resultado operacional ANTES de juros e impostos.
const TAX_CATEGORY = "Impostos";

export interface DreMonth {
  month: string;
  monthLabel: string;
  receitaConfirmada: number;
  receitaPendente: number;
  receitaPrevista: number;
  impostos: number;
  receitaLiquida: number;
  despesasPorCategoria: { category: string; value: number; fixo: number; variavel: number }[];
  despesasOperacionais: number;
  despesasFixas: number;
  despesasVariaveis: number;
  fixasOperacionais: number;
  variaveisOperacionais: number;
  totalDespesas: number;
  ebitda: number;
  margemEbitda: number;
  depreciacao: number;
  ebit: number;
  resultadoFinanceiro: number;
  lucroLiquido: number;
  margemLiquida: number;
  pontoEquilibrio: number;
  clientesFaturados: number;
  clientesInadimplentes: number;
  valorInadimplente: number;
  taxaInadimplencia: number;
  ticketMedioRecebido: number;
}

// Monta o DRE de um mês: receita confirmada, impostos, despesas operacionais
// (fixas e variáveis, por categoria), EBITDA, EBIT e lucro líquido.
export async function getDreMonth(refDate: Date): Promise<DreMonth> {
  const monthStart = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 1));
  const monthLabelRaw = refDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

  const [paid, pending, expenses] = await Promise.all([
    prisma.revenue.findMany({
      where: { status: "PAGO", dueDate: { gte: monthStart, lt: monthEnd } },
      select: { clientId: true, value: true },
    }),
    prisma.revenue.findMany({
      where: { status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { gte: monthStart, lt: monthEnd } },
      select: { clientId: true, value: true },
    }),
    prisma.expense.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      select: { category: true, value: true, fixedExpenseId: true },
    }),
  ]);

  const receitaConfirmada = paid.reduce((s, r) => s + Number(r.value), 0);
  const receitaPendente = pending.reduce((s, r) => s + Number(r.value), 0);
  const receitaPrevista = receitaConfirmada + receitaPendente;

  const byCategory = new Map<string, { value: number; fixo: number; variavel: number }>();
  for (const e of expenses) {
    const entry = byCategory.get(e.category) ?? { value: 0, fixo: 0, variavel: 0 };
    const v = Number(e.value);
    entry.value += v;
    if (e.fixedExpenseId) entry.fixo += v;
    else entry.variavel += v;
    byCategory.set(e.category, entry);
  }

  const despesasPorCategoria = [...byCategory.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.value - a.value);

  const impostos = byCategory.get(TAX_CATEGORY)?.value ?? 0;
  const totalDespesas = expenses.reduce((s, e) => s + Number(e.value), 0);
  const despesasOperacionais = totalDespesas - impostos;
  const despesasFixas = expenses.filter((e) => e.fixedExpenseId).reduce((s, e) => s + Number(e.value), 0);
  const despesasVariaveis = totalDespesas - despesasFixas;
  // Split fixa/variável só das operacionais (sem impostos), pra que as linhas
  // "das quais" fechem exatamente com o total de despesas operacionais.
  const operacionais = expenses.filter((e) => e.category !== TAX_CATEGORY);
  const fixasOperacionais = operacionais.filter((e) => e.fixedExpenseId).reduce((s, e) => s + Number(e.value), 0);
  const variaveisOperacionais = despesasOperacionais - fixasOperacionais;

  const receitaLiquida = receitaConfirmada - impostos;
  const ebitda = receitaLiquida - despesasOperacionais;
  // Não rastreamos imobilizado nem empréstimos, então D&A e resultado
  // financeiro ficam zerados — EBIT e lucro líquido acompanham o EBITDA.
  const depreciacao = 0;
  const ebit = ebitda - depreciacao;
  const resultadoFinanceiro = 0;
  const lucroLiquido = ebit + resultadoFinanceiro;

  const clientesFaturados = new Set(paid.map((r) => r.clientId)).size;
  const clientesInadimplentes = new Set(pending.map((r) => r.clientId)).size;

  return {
    month: monthStart.toISOString().slice(0, 7),
    monthLabel: monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1),
    receitaConfirmada,
    receitaPendente,
    receitaPrevista,
    impostos,
    receitaLiquida,
    despesasPorCategoria,
    despesasOperacionais,
    despesasFixas,
    despesasVariaveis,
    fixasOperacionais,
    variaveisOperacionais,
    totalDespesas,
    ebitda,
    margemEbitda: receitaLiquida > 0 ? (ebitda / receitaLiquida) * 100 : 0,
    depreciacao,
    ebit,
    resultadoFinanceiro,
    lucroLiquido,
    margemLiquida: receitaConfirmada > 0 ? (lucroLiquido / receitaConfirmada) * 100 : 0,
    pontoEquilibrio: totalDespesas,
    clientesFaturados,
    clientesInadimplentes,
    valorInadimplente: receitaPendente,
    taxaInadimplencia: receitaPrevista > 0 ? (receitaPendente / receitaPrevista) * 100 : 0,
    ticketMedioRecebido: clientesFaturados > 0 ? receitaConfirmada / clientesFaturados : 0,
  };
}

export interface CashFlowMonth {
  month: string;
  label: string;
  shortLabel: string;
  entradas: number;
  saidas: number;
  fluxoLiquido: number;
  saldoInicial: number;
  saldoFinal: number;
}

export interface CashFlow {
  months: CashFlowMonth[];
  atual: CashFlowMonth;
  entradasPorOrigem: { label: string; value: number }[];
  saidasPorCategoria: { label: string; value: number; fixo: boolean }[];
  aReceberNoMes: number;
}

// DFC (fluxo de caixa): entradas confirmadas menos saídas pagas, mês a mês,
// com saldo acumulado. O saldo inicial de cada mês é tudo que entrou menos
// tudo que saiu antes dele — o sistema não tem saldo bancário de abertura,
// então o acumulado começa do primeiro lançamento registrado.
export async function getCashFlow(refDate: Date, monthsBack = 6): Promise<CashFlow> {
  const monthStart = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 1));
  const windowStart = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - (monthsBack - 1), 1));

  const [paid, expenses, pendingThisMonth] = await Promise.all([
    prisma.revenue.findMany({
      where: { status: "PAGO", dueDate: { lt: monthEnd } },
      select: { value: true, dueDate: true, description: true },
    }),
    prisma.expense.findMany({
      where: { date: { lt: monthEnd } },
      select: { value: true, date: true, category: true, fixedExpenseId: true },
    }),
    prisma.revenue.findMany({
      where: { status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { gte: monthStart, lt: monthEnd } },
      select: { value: true },
    }),
  ]);

  const key = (d: Date) => d.toISOString().slice(0, 7);
  const entradasPorMes = new Map<string, number>();
  const saidasPorMes = new Map<string, number>();

  for (const r of paid) {
    const k = key(r.dueDate);
    entradasPorMes.set(k, (entradasPorMes.get(k) ?? 0) + Number(r.value));
  }
  for (const e of expenses) {
    const k = key(e.date);
    saidasPorMes.set(k, (saidasPorMes.get(k) ?? 0) + Number(e.value));
  }

  // Saldo acumulado antes da janela exibida.
  let saldo = 0;
  for (const r of paid) if (r.dueDate < windowStart) saldo += Number(r.value);
  for (const e of expenses) if (e.date < windowStart) saldo -= Number(e.value);

  const months: CashFlowMonth[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + i, 1));
    const k = key(d);
    const entradas = entradasPorMes.get(k) ?? 0;
    const saidas = saidasPorMes.get(k) ?? 0;
    const saldoInicial = saldo;
    const fluxoLiquido = entradas - saidas;
    saldo = saldoInicial + fluxoLiquido;

    const labelRaw = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
    months.push({
      month: k,
      label: labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1),
      shortLabel: d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", ""),
      entradas,
      saidas,
      fluxoLiquido,
      saldoInicial,
      saldoFinal: saldo,
    });
  }

  const atual = months[months.length - 1];

  // Separa mensalidade recorrente de entradas avulsas no mês exibido.
  const mrrTag = "[MRR]";
  let recorrente = 0;
  let avulso = 0;
  for (const r of paid) {
    if (key(r.dueDate) !== atual.month) continue;
    if (r.description.startsWith(mrrTag)) recorrente += Number(r.value);
    else avulso += Number(r.value);
  }

  const catMap = new Map<string, { value: number; fixo: boolean }>();
  for (const e of expenses) {
    if (key(e.date) !== atual.month) continue;
    const entry = catMap.get(e.category) ?? { value: 0, fixo: false };
    entry.value += Number(e.value);
    if (e.fixedExpenseId) entry.fixo = true;
    catMap.set(e.category, entry);
  }

  return {
    months,
    atual,
    entradasPorOrigem: [
      { label: "Mensalidades (recorrente)", value: recorrente },
      { label: "Entradas avulsas", value: avulso },
    ].filter((x) => x.value > 0),
    saidasPorCategoria: [...catMap.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.value - a.value),
    aReceberNoMes: pendingThisMonth.reduce((s, r) => s + Number(r.value), 0),
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

// Painel de números do Comercial — vendas e churn, atualizado automaticamente
// a cada cliente adicionado, cancelado ou excluído (ver src/lib/actions/clients.ts).
export async function getCommercialPanel() {
  const month = new Date().toISOString().slice(0, 7);
  const monthStart = new Date(month + "-01");

  const [vendasMes, churnMes, vendasTotal, churnTotal, goal] = await Promise.all([
    prisma.commercialEvent.findMany({ where: { type: "VENDA", createdAt: { gte: monthStart } } }),
    prisma.commercialEvent.findMany({ where: { type: "CHURN", createdAt: { gte: monthStart } } }),
    prisma.commercialEvent.findMany({ where: { type: "VENDA" } }),
    prisma.commercialEvent.findMany({ where: { type: "CHURN" } }),
    prisma.monthlyGoal.findUnique({ where: { month } }),
  ]);

  const sum = (events: { value: unknown }[]) => events.reduce((s, e) => s + Number(e.value), 0);

  return {
    month,
    mes: {
      vendasQtd: vendasMes.length,
      vendasValor: sum(vendasMes),
      churnQtd: churnMes.length,
      churnValor: sum(churnMes),
    },
    total: {
      vendasQtd: vendasTotal.length,
      vendasValor: sum(vendasTotal),
      churnQtd: churnTotal.length,
      churnValor: sum(churnTotal),
    },
    goal: {
      targetSalesQty: goal?.targetSalesQty ?? 0,
      targetSalesValue: goal ? Number(goal.targetSalesValue ?? 0) : 0,
    },
  };
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
