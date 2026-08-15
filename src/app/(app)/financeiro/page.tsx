import Link from "next/link";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Scale,
  Trash2,
  Repeat,
  Landmark,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { formatCurrency, formatDate } from "@/lib/labels";
import { getCashFlow } from "@/lib/metrics";
import { deleteRevenue, deleteExpense } from "@/lib/actions/financeiro";
import { ensureMonthlyMrrRevenues } from "@/lib/mrr-revenue";
import { ensureMonthlyFixedExpenses } from "@/lib/fixed-expenses";
import { RevenueForm } from "./revenue-form";
import { ExpenseForm } from "./expense-form";
import { FinanceTabs } from "./finance-tabs";

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

  const now = new Date();
  await Promise.all([ensureMonthlyMrrRevenues(now), ensureMonthlyFixedExpenses(now)]);

  const refDate = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00Z`) : now;
  const monthStart = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 1));
  const prevMonth = monthParam(new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - 1, 1)));
  const nextMonth = monthParam(new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 1)));
  const isCurrentMonth = monthParam(refDate) === monthParam(now);
  const monthLabelRaw = refDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);

  const [cashFlow, entradas, pendentes, saidas, clients] = await Promise.all([
    getCashFlow(refDate, 1),
    // Entrada = dinheiro que entrou de verdade (cobrança confirmada).
    prisma.revenue.findMany({
      where: { status: "PAGO", dueDate: { gte: monthStart, lt: monthEnd } },
      include: { client: { select: { companyName: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.revenue.findMany({
      where: { status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { gte: monthStart, lt: monthEnd } },
      select: { id: true, value: true },
    }),
    prisma.expense.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      orderBy: { date: "asc" },
    }),
    prisma.client.findMany({ select: { id: true, companyName: true }, orderBy: { companyName: "asc" } }),
  ]);

  const totalEntradas = entradas.reduce((s, r) => s + Number(r.value), 0);
  const totalSaidas = saidas.reduce((s, e) => s + Number(e.value), 0);
  const aReceber = pendentes.reduce((s, r) => s + Number(r.value), 0);
  const saldo = totalEntradas - totalSaidas;
  const saldoEmCaixa = cashFlow.months[0]?.saldoFinal ?? null;

  // Barras proporcionais ao maior dos dois, pra dar leitura visual imediata.
  const maior = Math.max(totalEntradas, totalSaidas, 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Financeiro</h1>
          <p className="text-sm text-foreground-muted mt-0.5">O que entrou e o que saiu no mês</p>
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
        </div>
      </div>

      <FinanceTabs month={monthParam(refDate)} />

      {/* Resumo visual: entrou, saiu, sobrou, quanto tem em banco */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2 text-emerald-500 mb-2">
            <ArrowUpCircle size={17} />
            <span className="text-xs font-semibold uppercase tracking-wide">Entrou</span>
          </div>
          <p className="text-2xl font-bold text-emerald-500">{formatCurrency(totalEntradas)}</p>
          <div className="h-1.5 rounded-full bg-emerald-500/15 overflow-hidden mt-3">
            <div className="h-full bg-emerald-500" style={{ width: `${(totalEntradas / maior) * 100}%` }} />
          </div>
          <p className="text-xs text-foreground-muted mt-2">{entradas.length} recebimento(s) confirmado(s)</p>
        </div>

        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
          <div className="flex items-center gap-2 text-red-500 mb-2">
            <ArrowDownCircle size={17} />
            <span className="text-xs font-semibold uppercase tracking-wide">Saiu</span>
          </div>
          <p className="text-2xl font-bold text-red-500">{formatCurrency(totalSaidas)}</p>
          <div className="h-1.5 rounded-full bg-red-500/15 overflow-hidden mt-3">
            <div className="h-full bg-red-500" style={{ width: `${(totalSaidas / maior) * 100}%` }} />
          </div>
          <p className="text-xs text-foreground-muted mt-2">{saidas.length} pagamento(s)</p>
        </div>

        <div
          className={`rounded-2xl border p-5 ${
            saldo >= 0 ? "border-accent/40 bg-accent/5" : "border-red-500/40 bg-red-500/10"
          }`}
        >
          <div className={`flex items-center gap-2 mb-2 ${saldo >= 0 ? "text-accent" : "text-red-500"}`}>
            <Scale size={17} />
            <span className="text-xs font-semibold uppercase tracking-wide">Sobrou (saldo)</span>
          </div>
          <p className={`text-2xl font-bold ${saldo >= 0 ? "" : "text-red-500"}`}>{formatCurrency(saldo)}</p>
          <p className="text-xs text-foreground-muted mt-3 flex items-center gap-1.5">
            <Clock size={12} /> Ainda a receber neste mês: {formatCurrency(aReceber)}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 text-foreground-muted mb-2">
            <Landmark size={17} />
            <span className="text-xs font-semibold uppercase tracking-wide">Saldo em caixa</span>
          </div>
          {saldoEmCaixa === null ? (
            <>
              <p className="text-2xl font-bold text-foreground-muted">—</p>
              <Link href="/financeiro/dfc" className="text-xs text-accent hover:underline mt-3 inline-block">
                Informar saldo do banco
              </Link>
            </>
          ) : (
            <>
              <p className={`text-2xl font-bold ${saldoEmCaixa < 0 ? "text-red-500" : ""}`}>
                {formatCurrency(saldoEmCaixa)}
              </p>
              <p className="text-xs text-foreground-muted mt-3">Saldo informado + entradas − saídas</p>
            </>
          )}
        </div>
      </div>

      {/* Listas lado a lado: entradas x saídas */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ENTRADAS */}
        <div className="rounded-2xl border border-border bg-surface overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-border bg-emerald-500/5">
            <span className="flex items-center gap-2 font-semibold text-emerald-500">
              <ArrowUpCircle size={16} /> Entradas
            </span>
            <span className="text-sm font-bold text-emerald-500">{formatCurrency(totalEntradas)}</span>
          </div>

          {entradas.length === 0 ? (
            <p className="text-sm text-foreground-muted px-5 py-8 text-center">
              Nenhuma entrada confirmada neste mês.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {entradas.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.client.companyName}</p>
                    <p className="text-xs text-foreground-muted truncate">
                      {r.description} · {formatDate(r.dueDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-emerald-500">+{formatCurrency(r.value.toString())}</span>
                    <form action={deleteRevenue.bind(null, r.id)}>
                      <button type="submit" className="p-1.5 rounded-lg hover:bg-red-500/10 text-foreground-muted hover:text-red-500" title="Excluir">
                        <Trash2 size={13} />
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-auto border-t border-border p-5">
            <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-3">Registrar entrada</p>
            <RevenueForm clients={clients} />
          </div>
        </div>

        {/* SAÍDAS */}
        <div className="rounded-2xl border border-border bg-surface overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-border bg-red-500/5">
            <span className="flex items-center gap-2 font-semibold text-red-500">
              <ArrowDownCircle size={16} /> Saídas
            </span>
            <span className="text-sm font-bold text-red-500">{formatCurrency(totalSaidas)}</span>
          </div>

          {saidas.length === 0 ? (
            <p className="text-sm text-foreground-muted px-5 py-8 text-center">Nenhuma saída neste mês.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {saidas.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate flex items-center gap-1.5">
                      {e.description}
                      {e.fixedExpenseId && (
                        <span
                          title="Despesa fixa — lançada automaticamente todo mês"
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-muted text-foreground-muted shrink-0"
                        >
                          <Repeat size={9} /> fixa
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-foreground-muted truncate">
                      {e.category} · {formatDate(e.date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-red-500">−{formatCurrency(e.value.toString())}</span>
                    <form action={deleteExpense.bind(null, e.id)}>
                      <button type="submit" className="p-1.5 rounded-lg hover:bg-red-500/10 text-foreground-muted hover:text-red-500" title="Excluir">
                        <Trash2 size={13} />
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-auto border-t border-border p-5">
            <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-3">Registrar saída</p>
            <ExpenseForm />
          </div>
        </div>
      </div>
    </div>
  );
}
