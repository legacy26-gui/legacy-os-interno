import Link from "next/link";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronLeft,
  ChevronRight,
  Scale,
  Wallet,
  Clock,
  Repeat,
} from "lucide-react";
import { requireModuleAccess } from "@/lib/dal";
import { getCashFlow } from "@/lib/metrics";
import { formatCurrency } from "@/lib/labels";
import { FinanceTabs } from "../finance-tabs";
import { CashOpeningForm } from "../cash-opening-form";

function money(v: number | null) {
  return v === null ? "—" : formatCurrency(v === 0 ? 0 : v);
}

function monthParam(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function DfcPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireModuleAccess("financeiro");
  const { month } = await searchParams;

  const now = new Date();
  const refDate = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00Z`) : now;
  const prevDate = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - 1, 1));
  const nextDate = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 1));
  const isCurrentMonth = monthParam(refDate) === monthParam(now);

  const cf = await getCashFlow(refDate, 6);
  const { atual } = cf;

  // Escala comum pras barras do histórico, pra comparação visual honesta.
  const maxBar = Math.max(...cf.months.flatMap((m) => [m.entradas, m.saidas]), 1);
  const maxEntrada = Math.max(...cf.entradasPorOrigem.map((e) => e.value), 1);
  const maxSaida = Math.max(...cf.saidasPorCategoria.map((e) => e.value), 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">DFC — Fluxo de Caixa</h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Quanto entrou, quanto saiu e quanto sobrou de caixa · {atual.label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/financeiro/dfc?month=${monthParam(prevDate)}`}
            className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors"
            title="Mês anterior"
          >
            <ChevronLeft size={16} />
          </Link>
          <span className="px-3 py-2 rounded-lg border border-border bg-surface text-sm font-medium min-w-[9rem] text-center">
            {atual.label}
          </span>
          {!isCurrentMonth && (
            <Link
              href="/financeiro/dfc"
              className="px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors text-sm font-medium"
            >
              Hoje
            </Link>
          )}
          <Link
            href={`/financeiro/dfc?month=${monthParam(nextDate)}`}
            className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors"
            title="Próximo mês"
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      <FinanceTabs month={monthParam(refDate)} />

      {/* A conta do mês, em ordem de leitura */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <div className="p-5">
            <div className="flex items-center gap-2 text-foreground-muted mb-2">
              <Wallet size={15} />
              <span className="text-xs font-semibold uppercase tracking-wide">Saldo inicial</span>
            </div>
            <p className={`text-xl font-bold ${(atual.saldoInicial ?? 0) < 0 ? "text-red-500" : ""}`}>
              {money(atual.saldoInicial)}
            </p>
            <p className="text-xs text-foreground-muted mt-1">
              {atual.saldoInicial === null
                ? "Informe o saldo em banco abaixo"
                : cf.opening?.month === atual.month
                  ? "Saldo em banco que você informou"
                  : "Acumulado até o mês anterior"}
            </p>
          </div>

          <div className="p-5">
            <div className="flex items-center gap-2 text-emerald-500 mb-2">
              <ArrowUpCircle size={15} />
              <span className="text-xs font-semibold uppercase tracking-wide">(+) Entradas</span>
            </div>
            <p className="text-xl font-bold text-emerald-500">{formatCurrency(atual.entradas)}</p>
            <p className="text-xs text-foreground-muted mt-1 flex items-center gap-1">
              <Clock size={11} /> a receber: {formatCurrency(cf.aReceberNoMes)}
            </p>
          </div>

          <div className="p-5">
            <div className="flex items-center gap-2 text-red-500 mb-2">
              <ArrowDownCircle size={15} />
              <span className="text-xs font-semibold uppercase tracking-wide">(−) Saídas</span>
            </div>
            <p className="text-xl font-bold text-red-500">{formatCurrency(atual.saidas)}</p>
            <p className="text-xs text-foreground-muted mt-1">Tudo que foi pago no mês</p>
          </div>

          <div className={`p-5 ${(atual.saldoFinal ?? 0) >= 0 ? "bg-accent/5" : "bg-red-500/10"}`}>
            <div
              className={`flex items-center gap-2 mb-2 ${(atual.saldoFinal ?? 0) >= 0 ? "text-accent" : "text-red-500"}`}
            >
              <Scale size={15} />
              <span className="text-xs font-semibold uppercase tracking-wide">(=) Saldo final</span>
            </div>
            <p className={`text-xl font-bold ${(atual.saldoFinal ?? 0) < 0 ? "text-red-500" : ""}`}>
              {money(atual.saldoFinal)}
            </p>
            <p className={`text-xs mt-1 ${atual.fluxoLiquido >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {atual.fluxoLiquido >= 0 ? "Gerou" : "Consumiu"} {formatCurrency(Math.abs(atual.fluxoLiquido))} de caixa
            </p>
          </div>
        </div>
      </div>

      {/* Histórico visual dos últimos meses */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-4">
          Últimos 6 meses — entradas x saídas
        </p>

        <div className="flex flex-col gap-3">
          {cf.months.map((m) => (
            <div key={m.month} className={`flex flex-col gap-1.5 ${m.month === atual.month ? "" : "opacity-80"}`}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className={`font-medium capitalize ${m.month === atual.month ? "text-accent" : ""}`}>
                  {m.shortLabel}
                </span>
                <span className={m.fluxoLiquido >= 0 ? "text-emerald-500" : "text-red-500"}>
                  {m.fluxoLiquido >= 0 ? "+" : "−"}
                  {formatCurrency(Math.abs(m.fluxoLiquido))}
                  {m.saldoFinal !== null && (
                    <span className="text-foreground-muted"> · saldo {formatCurrency(m.saldoFinal)}</span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-3 rounded bg-surface-muted overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${(m.entradas / maxBar) * 100}%` }}
                    title={`Entradas: ${formatCurrency(m.entradas)}`}
                  />
                </div>
                <span className="text-xs text-emerald-500 tabular-nums w-24 text-right shrink-0">
                  {formatCurrency(m.entradas)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-3 rounded bg-surface-muted overflow-hidden">
                  <div
                    className="h-full bg-red-500"
                    style={{ width: `${(m.saidas / maxBar) * 100}%` }}
                    title={`Saídas: ${formatCurrency(m.saidas)}`}
                  />
                </div>
                <span className="text-xs text-red-500 tabular-nums w-24 text-right shrink-0">
                  {formatCurrency(m.saidas)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border text-xs text-foreground-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Entradas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Saídas
          </span>
        </div>
      </div>

      {/* De onde veio e pra onde foi */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-4">
            De onde veio o dinheiro
          </p>
          {cf.entradasPorOrigem.length === 0 ? (
            <p className="text-sm text-foreground-muted">Nenhuma entrada confirmada neste mês.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {cf.entradasPorOrigem.map((e) => (
                <div key={e.label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>{e.label}</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(e.value)}
                      <span className="text-xs text-foreground-muted ml-1.5">
                        {atual.entradas > 0 ? `${((e.value / atual.entradas) * 100).toFixed(0)}%` : ""}
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${(e.value / maxEntrada) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-4">
            Pra onde foi o dinheiro
          </p>
          {cf.saidasPorCategoria.length === 0 ? (
            <p className="text-sm text-foreground-muted">Nenhuma saída neste mês.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {cf.saidasPorCategoria.map((e) => (
                <div key={e.label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5">
                      {e.label}
                      {e.fixo && (
                        <span
                          title="Inclui despesa fixa"
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-muted text-foreground-muted"
                        >
                          <Repeat size={9} /> fixa
                        </span>
                      )}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(e.value)}
                      <span className="text-xs text-foreground-muted ml-1.5">
                        {atual.saidas > 0 ? `${((e.value / atual.saidas) * 100).toFixed(0)}%` : ""}
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                    <div className="h-full bg-red-500" style={{ width: `${(e.value / maxSaida) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Saldo em banco informado manualmente */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
        <div>
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">Saldo em banco</p>
          <p className="text-xs text-foreground-muted mt-0.5">
            {cf.opening
              ? `Partindo de ${formatCurrency(cf.opening.balance)} no dia 1º de ${cf.opening.label.toLowerCase()}. As entradas e saídas lançadas depois disso ajustam o saldo automaticamente.`
              : "O sistema não lê o extrato do Itaú. Informe o saldo em banco pra que o acumulado abaixo fique fiel — depois basta ir lançando entradas e saídas."}
          </p>
        </div>
        <CashOpeningForm currentBalance={cf.opening?.balance} currentMonth={cf.opening?.month} />
      </div>
    </div>
  );
}
