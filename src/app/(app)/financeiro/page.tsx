import { AlertTriangle, TrendingUp, TrendingDown, Wallet, Target, Trash2, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { getFinanceOverview, getRevenueByClient, getRevenueByCity } from "@/lib/metrics";
import { formatCurrency, formatDate, REVENUE_STATUS_LABELS, REVENUE_STATUS_COLORS } from "@/lib/labels";
import { markRevenuePaid, deleteRevenue, deleteExpense } from "@/lib/actions/financeiro";
import { RevenueForm } from "./revenue-form";
import { ExpenseForm } from "./expense-form";
import { GoalForm } from "./goal-form";

export default async function FinanceiroPage() {
  await requireModuleAccess("financeiro");

  const overview = await getFinanceOverview();
  const [revenueByClient, revenueByCity, clients, revenues, expenses] = await Promise.all([
    getRevenueByClient(),
    getRevenueByCity(),
    prisma.client.findMany({ select: { id: true, companyName: true }, orderBy: { companyName: "asc" } }),
    prisma.revenue.findMany({ include: { client: { select: { companyName: true } } }, orderBy: { dueDate: "desc" }, take: 30 }),
    prisma.expense.findMany({ orderBy: { date: "desc" }, take: 30 }),
  ]);

  const { overdue, dueToday, dueSoon } = overview.alerts;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Financeiro</h1>
        <p className="text-sm text-foreground-muted mt-0.5">Receitas, despesas e indicadores da agência</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={TrendingUp} label="Receita recorrente (MRR)" value={formatCurrency(overview.mrr)} />
        <MetricCard icon={Wallet} label="Faturamento do mês" value={formatCurrency(overview.faturamentoMensal)} />
        <MetricCard icon={Wallet} label="Faturamento anual" value={formatCurrency(overview.faturamentoAnual)} />
        <MetricCard
          icon={overview.lucroEstimado >= 0 ? TrendingUp : TrendingDown}
          label="Lucro estimado (mês)"
          value={formatCurrency(overview.lucroEstimado)}
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

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium px-5 pt-5 pb-2">Receitas</p>
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
                <td className="px-5 py-3 text-foreground-muted">{formatDate(r.dueDate)}</td>
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

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium px-5 pt-5 pb-2">Despesas</p>
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

function MetricCard({ icon: Icon, label, value }: { icon: typeof TrendingUp; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-foreground-muted mb-2">
        <Icon size={15} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
