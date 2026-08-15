import Link from "next/link";
import { AlertTriangle, TrendingUp, TrendingDown, Wallet, Target, Trash2, CheckCircle2, Clock, ChevronLeft, ChevronRight, FileBarChart, Pause, Play, UserCheck, Repeat, Receipt, Percent } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { getFinanceOverview, getRevenueByClient, getRevenueByCity } from "@/lib/metrics";
import { formatCurrency, formatDate, REVENUE_STATUS_LABELS, REVENUE_STATUS_COLORS } from "@/lib/labels";
import {
  markRevenuePaid,
  deleteRevenue,
  deleteExpense,
  toggleFixedExpenseActive,
  deleteFixedExpense,
  includeClientInBilling,
} from "@/lib/actions/financeiro";
import { ensureMonthlyMrrRevenues, getMonthlyMrrRevenues } from "@/lib/mrr-revenue";
import { ensureMonthlyFixedExpenses } from "@/lib/fixed-expenses";
import { RevenueForm } from "./revenue-form";
import { ExpenseForm } from "./expense-form";
import { FixedExpenseForm } from "./fixed-expense-form";
import { GoalForm } from "./goal-form";
import { MrrBoard } from "./mrr-board";
import { DueDateInput } from "./due-date-input";

function monthParam(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireModuleAccess("financeiro");
  const { month } = await searchParams;

  // Gera automaticamente (idempotente) a receita do mês para cada cliente
  // ativo com mensalidade, e a despesa do mês para cada despesa fixa ativa —
  // sempre pro mês real de hoje, independente de qual mês está sendo
  // visualizado abaixo.
  const now = new Date();
  await Promise.all([ensureMonthlyMrrRevenues(now), ensureMonthlyFixedExpenses(now)]);

  const refDate = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00Z`) : now;
  const monthStart = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 1));
  const prevMonth = monthParam(new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - 1, 1)));
  const nextMonth = monthParam(new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 1)));
  const isCurrentMonth = monthParam(refDate) === monthParam(now);

  const mrrBoard = await getMonthlyMrrRevenues(refDate);
  const monthLabelRaw = refDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);

  const overview = await getFinanceOverview(refDate);
  const [revenueByClient, revenueByCity, clients, revenues, expenses, fixedExpenses, excludedFromBilling] = await Promise.all([
    getRevenueByClient(),
    getRevenueByCity(),
    prisma.client.findMany({ select: { id: true, companyName: true }, orderBy: { companyName: "asc" } }),
    prisma.revenue.findMany({
      where: { dueDate: { gte: monthStart, lt: monthEnd } },
      include: { client: { select: { companyName: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.expense.findMany({ where: { date: { gte: monthStart, lt: monthEnd } }, orderBy: { date: "asc" } }),
    prisma.fixedExpense.findMany({ orderBy: { description: "asc" } }),
    prisma.client.findMany({
      where: { billingActive: false, status: "ATIVO" },
      select: { id: true, companyName: true, monthlyValue: true },
      orderBy: { companyName: "asc" },
    }),
  ]);

  const { overdue, dueToday, dueSoon } = overview.alerts;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Financeiro</h1>
          <p className="text-sm text-foreground-muted mt-0.5">Receitas, despesas e indicadores da agência</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/financeiro?month=${prevMonth}`}
            className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors"
            title="Mês anterior"
          >
            <ChevronLeft size={16} />
          </Link>
          <span className="px-3 py-2 rounded-lg border border-border bg-surface text-sm font-medium min-w-[9rem] text-center">
            {monthLabel}
          </span>
          {!isCurrentMonth && (
            <Link
              href="/financeiro"
              className="px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors text-sm font-medium"
            >
              Hoje
            </Link>
          )}
          <Link
            href={`/financeiro?month=${nextMonth}`}
            className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors"
            title="Próximo mês"
          >
            <ChevronRight size={16} />
          </Link>
          <Link
            href={`/financeiro/dre?month=${monthParam(refDate)}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors text-sm font-medium"
          >
            <FileBarChart size={15} />
            DRE
          </Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard icon={TrendingUp} label="Receita recorrente (MRR)" value={formatCurrency(overview.mrr)} />
        <MetricCard
          icon={Wallet}
          label={`Faturado — ${monthLabel}`}
          value={formatCurrency(overview.faturamentoMensal)}
          hint="Só o que já foi confirmado como recebido neste mês"
        />
        <MetricCard icon={Wallet} label="Faturamento anual" value={formatCurrency(overview.faturamentoAnual)} />
        <MetricCard
          icon={overview.lucroEstimado >= 0 ? TrendingUp : TrendingDown}
          label="Lucro estimado (mês)"
          value={formatCurrency(overview.lucroEstimado)}
          hint="Faturado menos despesas fixas e variáveis"
        />
        <MetricCard icon={Clock} label={`A receber — ${monthLabel}`} value={formatCurrency(overview.aReceber)} alert={overview.aReceber > 0} />
      </div>

      {/* Custos do mês */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={Repeat} label="Custos fixos (mês)" value={formatCurrency(overview.despesasFixas)} />
        <MetricCard icon={Receipt} label="Custos variáveis (mês)" value={formatCurrency(overview.despesasVariaveis)} />
        <MetricCard
          icon={TrendingDown}
          label="Custo total (mês)"
          value={formatCurrency(overview.despesasMes)}
          alert={overview.despesasMes > overview.faturamentoMensal}
        />
        <MetricCard
          icon={Percent}
          label="Custo sobre faturado"
          value={
            overview.faturamentoMensal > 0
              ? `${((overview.despesasMes / overview.faturamentoMensal) * 100).toFixed(0)}%`
              : "—"
          }
          alert={overview.faturamentoMensal > 0 && overview.despesasMes > overview.faturamentoMensal}
        />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-accent" />
          <div>
            <p className="text-sm font-medium">Meta do mês</p>
            <p className="text-xs text-foreground-muted">
              {formatCurrency(overview.faturamentoMensal)} de {formatCurrency(overview.targetRevenue)} ({overview.percentAtingido.toFixed(0)}%)
            </p>
          </div>
        </div>
        <div className="w-full sm:w-64">
          <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${Math.min(100, overview.percentAtingido)}%` }} />
          </div>
        </div>
        <GoalForm month={overview.month} currentTarget={overview.targetRevenue} />
      </div>

      <MrrBoard
        monthLabel={monthLabel}
        groups={mrrBoard.groups}
        totalMonth={mrrBoard.totalMonth}
        paidTotal={mrrBoard.paidTotal}
        pendingTotal={mrrBoard.pendingTotal}
      />

      {excludedFromBilling.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
          <div>
            <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">Excluídos do fluxo de pagamento</p>
            <p className="text-xs text-foreground-muted mt-0.5">Clientes ativos que não entram mais na cobrança mensal automática.</p>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {excludedFromBilling.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{c.companyName}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-foreground-muted">{formatCurrency(c.monthlyValue.toString())}</span>
                  <form action={includeClientInBilling.bind(null, c.id)}>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border hover:bg-surface-muted text-xs font-medium"
                      title="Voltar pro fluxo de pagamento"
                    >
                      <UserCheck size={13} /> Reativar
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(overdue.length > 0 || dueToday.length > 0 || dueSoon.length > 0) && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-500 mb-3">
            <AlertTriangle size={16} /> Alertas de vencimento
          </p>
          <div className="flex flex-col gap-1.5 text-sm">
            {overdue.map((r) => (
              <p key={r.id}>
                <span className="text-red-500 font-medium">Atrasado:</span> {r.client.companyName} — {formatCurrency(r.value.toString())} (venceu {formatDate(r.dueDate)})
              </p>
            ))}
            {dueToday.map((r) => (
              <p key={r.id}>
                <span className="text-amber-500 font-medium">Vence hoje:</span> {r.client.companyName} — {formatCurrency(r.value.toString())}
              </p>
            ))}
            {dueSoon.filter((r) => !dueToday.some((d) => d.id === r.id)).map((r) => (
              <p key={r.id}>
                <span className="text-foreground-muted font-medium">Vence em breve:</span> {r.client.companyName} — {formatCurrency(r.value.toString())} ({formatDate(r.dueDate)})
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">Nova receita</p>
          <RevenueForm clients={clients} />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">Nova despesa</p>
          <ExpenseForm />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
        <div>
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">Despesas fixas</p>
          <p className="text-xs text-foreground-muted mt-0.5">
            Lançadas automaticamente todo mês (salários, aluguel, ferramentas...) — igual à mensalidade dos clientes.
          </p>
        </div>
        <FixedExpenseForm />
        {fixedExpenses.length > 0 && (
          <div className="flex flex-col divide-y divide-border">
            {fixedExpenses.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className={f.active ? "" : "text-foreground-muted line-through"}>
                  {f.description} <span className="text-foreground-muted">— {f.category}</span>
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-medium">{formatCurrency(f.value.toString())}</span>
                  <form action={toggleFixedExpenseActive.bind(null, f.id, !f.active)}>
                    <button
                      type="submit"
                      className="p-1.5 rounded-lg hover:bg-surface-muted text-foreground-muted hover:text-foreground"
                      title={f.active ? "Pausar (não gera mais todo mês)" : "Reativar"}
                    >
                      {f.active ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                  </form>
                  <form action={deleteFixedExpense.bind(null, f.id)}>
                    <button type="submit" className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500" title="Excluir">
                      <Trash2 size={14} />
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium px-5 pt-5 pb-2">
          Receitas — {monthLabel}
        </p>
        {revenues.length === 0 ? (
          <p className="text-sm text-foreground-muted px-5 pb-5">Nenhuma receita neste mês.</p>
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
              <th className="px-5 py-2.5 font-medium">Cliente</th>
              <th className="px-5 py-2.5 font-medium">Descrição</th>
              <th className="px-5 py-2.5 font-medium">Vencimento</th>
              <th className="px-5 py-2.5 font-medium text-right">Valor</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {revenues.map((r) => (
              <tr key={r.id} className="hover:bg-surface-muted transition-colors">
                <td className="px-5 py-3">{r.client.companyName}</td>
                <td className="px-5 py-3 text-foreground-muted">{r.description}</td>
                <td className="px-5 py-3 text-foreground-muted">
                  <DueDateInput revenueId={r.id} dueDate={r.dueDate} />
                </td>
                <td className="px-5 py-3 text-right font-medium">{formatCurrency(r.value.toString())}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${REVENUE_STATUS_COLORS[r.status]}`}>
                    {REVENUE_STATUS_LABELS[r.status]}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    {r.status !== "PAGO" && (
                      <form action={markRevenuePaid.bind(null, r.id)}>
                        <button type="submit" className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-500" title="Marcar como pago">
                          <CheckCircle2 size={15} />
                        </button>
                      </form>
                    )}
                    <form action={deleteRevenue.bind(null, r.id)}>
                      <button type="submit" className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500" title="Excluir">
                        <Trash2 size={15} />
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium px-5 pt-5 pb-2">
          Despesas — {monthLabel}
        </p>
        {expenses.length === 0 ? (
          <p className="text-sm text-foreground-muted px-5 pb-5">Nenhuma despesa neste mês.</p>
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
              <th className="px-5 py-2.5 font-medium">Descrição</th>
              <th className="px-5 py-2.5 font-medium">Categoria</th>
              <th className="px-5 py-2.5 font-medium">Data</th>
              <th className="px-5 py-2.5 font-medium text-right">Valor</th>
              <th className="px-5 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {expenses.map((e) => (
              <tr key={e.id} className="hover:bg-surface-muted transition-colors">
                <td className="px-5 py-3">{e.description}</td>
                <td className="px-5 py-3 text-foreground-muted">{e.category}</td>
                <td className="px-5 py-3 text-foreground-muted">{formatDate(e.date)}</td>
                <td className="px-5 py-3 text-right font-medium">{formatCurrency(e.value.toString())}</td>
                <td className="px-5 py-3">
                  <div className="flex justify-end">
                    <form action={deleteExpense.bind(null, e.id)}>
                      <button type="submit" className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500" title="Excluir">
                        <Trash2 size={15} />
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-3">Receita por cliente</p>
          <div className="flex flex-col gap-1.5 text-sm">
            {revenueByClient.length === 0 && <p className="text-foreground-muted">Sem dados ainda.</p>}
            {revenueByClient.slice(0, 8).map((c) => (
              <div key={c.clientId} className="flex justify-between">
                <span>{c.companyName}</span>
                <span className="font-medium">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-3">Receita por cidade</p>
          <div className="flex flex-col gap-1.5 text-sm">
            {revenueByCity.length === 0 && <p className="text-foreground-muted">Sem dados ainda.</p>}
            {revenueByCity.slice(0, 8).map((c) => (
              <div key={c.city} className="flex justify-between">
                <span>{c.city}</span>
                <span className="font-medium">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  alert,
  hint,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  alert?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className={`flex items-center gap-2 mb-2 ${alert ? "text-amber-500" : "text-foreground-muted"}`}>
        <Icon size={15} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-xl font-semibold ${alert ? "text-amber-500" : ""}`}>{value}</p>
      {hint && <p className="text-xs text-foreground-muted mt-1">{hint}</p>}
    </div>
  );
}
