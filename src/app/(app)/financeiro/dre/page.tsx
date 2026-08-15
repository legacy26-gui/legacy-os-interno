import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { formatCurrency } from "@/lib/labels";

function monthParam(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireModuleAccess("financeiro");
  const { month } = await searchParams;

  const now = new Date();
  const refDate = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00Z`) : now;
  const monthStart = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 1));
  const prevMonth = monthParam(new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - 1, 1)));
  const nextMonth = monthParam(new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 1)));
  const isCurrentMonth = monthParam(refDate) === monthParam(now);
  const monthLabelRaw = refDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);

  const [revenuesPaid, expenses] = await Promise.all([
    prisma.revenue.findMany({
      where: { status: "PAGO", paidDate: { gte: monthStart, lt: monthEnd } },
      include: { client: { select: { companyName: true } } },
      orderBy: { paidDate: "asc" },
    }),
    prisma.expense.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      orderBy: { category: "asc" },
    }),
  ]);

  const receita = revenuesPaid.reduce((s, r) => s + Number(r.value), 0);

  const despesasPorCategoria = new Map<string, number>();
  for (const e of expenses) {
    despesasPorCategoria.set(e.category, (despesasPorCategoria.get(e.category) ?? 0) + Number(e.value));
  }
  const categorias = [...despesasPorCategoria.entries()].sort((a, b) => b[1] - a[1]);
  const despesasFixas = expenses.filter((e) => e.fixedExpenseId).reduce((s, e) => s + Number(e.value), 0);
  const despesasVariaveis = expenses.filter((e) => !e.fixedExpenseId).reduce((s, e) => s + Number(e.value), 0);
  const totalDespesas = despesasFixas + despesasVariaveis;

  const resultado = receita - totalDespesas;
  const margem = receita > 0 ? (resultado / receita) * 100 : 0;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <Link href="/financeiro" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground mb-2">
          <ArrowLeft size={15} /> Voltar para Financeiro
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">DRE</h1>
            <p className="text-sm text-foreground-muted mt-0.5">Demonstrativo de resultado — receita recebida menos despesas do mês</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/financeiro/dre?month=${prevMonth}`}
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
                href="/financeiro/dre"
                className="px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors text-sm font-medium"
              >
                Hoje
              </Link>
            )}
            <Link
              href={`/financeiro/dre?month=${nextMonth}`}
              className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors"
              title="Próximo mês"
            >
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-sm font-medium">Receita recebida</span>
          <span className="text-sm font-semibold text-emerald-500">{formatCurrency(receita)}</span>
        </div>

        <div className="px-5 py-3 border-b border-border">
          <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium mb-2">Despesas por categoria</p>
          {categorias.length === 0 ? (
            <p className="text-sm text-foreground-muted">Nenhuma despesa neste mês.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {categorias.map(([cat, value]) => (
                <div key={cat} className="flex items-center justify-between text-sm">
                  <span className="text-foreground-muted">{cat}</span>
                  <span>{formatCurrency(value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-border text-sm text-foreground-muted">
          <span>Despesas fixas</span>
          <span>{formatCurrency(despesasFixas)}</span>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border text-sm text-foreground-muted">
          <span>Despesas variáveis</span>
          <span>{formatCurrency(despesasVariaveis)}</span>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-sm font-medium">Total de despesas</span>
          <span className="text-sm font-semibold text-red-500">{formatCurrency(totalDespesas)}</span>
        </div>

        <div className="flex items-center justify-between px-5 py-5 bg-surface-muted/40">
          <div className="flex items-center gap-2">
            {resultado >= 0 ? (
              <TrendingUp size={17} className="text-emerald-500" />
            ) : (
              <TrendingDown size={17} className="text-red-500" />
            )}
            <span className="text-sm font-semibold">Resultado do mês</span>
          </div>
          <div className="text-right">
            <p className={`text-lg font-bold ${resultado >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {formatCurrency(resultado)}
            </p>
            <p className="text-xs text-foreground-muted">{margem.toFixed(1)}% de margem</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-3">
          Receitas recebidas no mês ({revenuesPaid.length})
        </p>
        {revenuesPaid.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nenhuma receita recebida neste mês.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {revenuesPaid.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {r.client.companyName} <span className="text-foreground-muted">— {r.description}</span>
                </span>
                <span className="font-medium shrink-0">{formatCurrency(r.value.toString())}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
