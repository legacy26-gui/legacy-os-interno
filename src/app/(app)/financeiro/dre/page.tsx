import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { requireModuleAccess } from "@/lib/dal";
import { getDreMonth, type DreMonth } from "@/lib/metrics";
import { formatCurrency } from "@/lib/labels";

function monthParam(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function pct(value: number) {
  return `${value >= 0 ? "" : "-"}${Math.abs(value).toFixed(1)}%`;
}

// Evita "-R$ 0,00" quando o valor é zero negativo (ex: -0 de uma despesa vazia).
function money(value: number) {
  return formatCurrency(value === 0 ? 0 : value);
}

// Variação percentual contra o mês anterior. Sem base de comparação (mês
// anterior zerado) não existe variação calculável.
function variation(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
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
  const prevDate = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - 1, 1));
  const nextDate = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 1));
  const isCurrentMonth = monthParam(refDate) === monthParam(now);

  const [cur, prev] = await Promise.all([getDreMonth(refDate), getDreMonth(prevDate)]);

  // Todas as categorias que aparecem em qualquer um dos dois meses, pra que a
  // planilha compare linha a linha mesmo quando uma categoria só existe em um.
  const allCategories = [
    ...new Set([
      ...cur.despesasPorCategoria.map((d) => d.category),
      ...prev.despesasPorCategoria.map((d) => d.category),
    ]),
  ].filter((c) => c !== "Impostos");

  function catValue(m: DreMonth, category: string) {
    return m.despesasPorCategoria.find((d) => d.category === category)?.value ?? 0;
  }
  function catSplit(m: DreMonth, category: string) {
    const found = m.despesasPorCategoria.find((d) => d.category === category);
    return { fixo: found?.fixo ?? 0, variavel: found?.variavel ?? 0 };
  }

  const base = cur.receitaConfirmada;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/financeiro" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground mb-2">
          <ArrowLeft size={15} /> Voltar para Financeiro
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">DRE — Demonstrativo de Resultado</h1>
            <p className="text-sm text-foreground-muted mt-0.5">
              Regime de caixa confirmado · {cur.monthLabel} comparado com {prev.monthLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/financeiro/dre?month=${monthParam(prevDate)}`}
              className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors"
              title="Mês anterior"
            >
              <ChevronLeft size={16} />
            </Link>
            <span className="px-3 py-2 rounded-lg border border-border bg-surface text-sm font-medium min-w-[9rem] text-center">
              {cur.monthLabel}
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
              href={`/financeiro/dre?month=${monthParam(nextDate)}`}
              className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors"
              title="Próximo mês"
            >
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </div>

      {/* Destaques */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Highlight label="Receita líquida" value={cur.receitaLiquida} previous={prev.receitaLiquida} />
        <Highlight label="EBITDA" value={cur.ebitda} previous={prev.ebitda} sub={`${pct(cur.margemEbitda)} de margem`} />
        <Highlight label="Lucro líquido" value={cur.lucroLiquido} previous={prev.lucroLiquido} sub={`${pct(cur.margemLiquida)} de margem`} />
        <Highlight label="Total de despesas" value={cur.totalDespesas} previous={prev.totalDespesas} invert />
      </div>

      {/* Planilha do DRE */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[46rem]">
            <thead>
              <tr className="border-b border-border text-foreground-muted text-xs uppercase tracking-wide">
                <th className="px-5 py-3 font-medium text-left">Conta</th>
                <th className="px-5 py-3 font-medium text-right">{cur.monthLabel}</th>
                <th className="px-5 py-3 font-medium text-right">{prev.monthLabel}</th>
                <th className="px-5 py-3 font-medium text-right">Var.</th>
                <th className="px-5 py-3 font-medium text-right">% Rec.</th>
              </tr>
            </thead>
            <tbody>
              <GroupRow label="Receita operacional" />
              <Row label="Receita bruta confirmada" current={cur.receitaConfirmada} previous={prev.receitaConfirmada} base={base} />
              <Row
                label="A receber no mês (não confirmado)"
                current={cur.receitaPendente}
                previous={prev.receitaPendente}
                base={base}
                muted
              />
              <Row label="Receita prevista (bruta + a receber)" current={cur.receitaPrevista} previous={prev.receitaPrevista} base={base} muted />
              <Row label="(−) Impostos" current={-cur.impostos} previous={-prev.impostos} base={base} expense />
              <Row label="(=) Receita líquida" current={cur.receitaLiquida} previous={prev.receitaLiquida} base={base} total />

              <GroupRow label="Custos e despesas operacionais" />
              {allCategories.map((c) => {
                const split = catSplit(cur, c);
                const detail =
                  split.fixo > 0 && split.variavel > 0
                    ? `fixa ${formatCurrency(split.fixo)} · variável ${formatCurrency(split.variavel)}`
                    : split.fixo > 0
                      ? "fixa"
                      : split.variavel > 0
                        ? "variável"
                        : undefined;
                return (
                  <Row
                    key={c}
                    label={c}
                    detail={detail}
                    current={-catValue(cur, c)}
                    previous={-catValue(prev, c)}
                    base={base}
                    indent
                    expense
                  />
                );
              })}
              {allCategories.length === 0 && (
                <tr className="border-b border-border">
                  <td colSpan={5} className="px-5 py-3 text-foreground-muted">
                    Nenhuma despesa operacional lançada neste mês.
                  </td>
                </tr>
              )}
              <Row
                label="(=) Total despesas operacionais"
                current={-cur.despesasOperacionais}
                previous={-prev.despesasOperacionais}
                base={base}
                total
                expense
              />
              <Row
                label="Das quais fixas"
                current={-cur.fixasOperacionais}
                previous={-prev.fixasOperacionais}
                base={base}
                muted
                indent
                expense
              />
              <Row
                label="Das quais variáveis"
                current={-cur.variaveisOperacionais}
                previous={-prev.variaveisOperacionais}
                base={base}
                muted
                indent
                expense
              />

              <GroupRow label="Resultado" />
              <Row label="(=) EBITDA" current={cur.ebitda} previous={prev.ebitda} base={base} total highlight />
              <PercentRow label="Margem EBITDA" current={cur.margemEbitda} previous={prev.margemEbitda} />
              <Row label="(−) Depreciação e amortização" current={-cur.depreciacao} previous={-prev.depreciacao} base={base} muted expense />
              <Row label="(=) EBIT (resultado operacional)" current={cur.ebit} previous={prev.ebit} base={base} total />
              <Row label="(+/−) Resultado financeiro" current={cur.resultadoFinanceiro} previous={prev.resultadoFinanceiro} base={base} muted />
              <Row label="(=) Lucro líquido" current={cur.lucroLiquido} previous={prev.lucroLiquido} base={base} total highlight />
              <PercentRow label="Margem líquida" current={cur.margemLiquida} previous={prev.margemLiquida} />
            </tbody>
          </table>
        </div>
        <p className="text-xs text-foreground-muted px-5 py-3 border-t border-border">
          Receita reconhecida pelo que foi confirmado como recebido no mês de vencimento. D&amp;A e resultado financeiro
          ficam zerados porque o sistema não controla imobilizado nem empréstimos — nesse cenário EBITDA, EBIT e lucro
          líquido coincidem.
        </p>
      </div>

      {/* Indicadores operacionais */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium px-5 pt-5 pb-1">
          Indicadores — {cur.monthLabel}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <IndicatorRow
                label="Ponto de equilíbrio (quanto precisa receber pra empatar)"
                value={formatCurrency(cur.pontoEquilibrio)}
              />
              <IndicatorRow
                label="Quanto falta pro ponto de equilíbrio"
                value={
                  cur.receitaConfirmada >= cur.pontoEquilibrio
                    ? "Atingido"
                    : formatCurrency(cur.pontoEquilibrio - cur.receitaConfirmada)
                }
              />
              <IndicatorRow label="Clientes que pagaram no mês" value={String(cur.clientesFaturados)} />
              <IndicatorRow label="Ticket médio recebido" value={formatCurrency(cur.ticketMedioRecebido)} />
              <IndicatorRow label="Clientes em aberto no mês" value={String(cur.clientesInadimplentes)} />
              <IndicatorRow
                label="Valor em aberto no mês"
                value={`${formatCurrency(cur.valorInadimplente)} (${pct(cur.taxaInadimplencia)} do previsto)`}
              />
              <IndicatorRow
                label="Despesa fixa sobre receita"
                value={cur.receitaConfirmada > 0 ? pct((cur.despesasFixas / cur.receitaConfirmada) * 100) : "—"}
              />
              <IndicatorRow
                label="Despesa total sobre receita"
                value={cur.receitaConfirmada > 0 ? pct((cur.totalDespesas / cur.receitaConfirmada) * 100) : "—"}
              />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GroupRow({ label }: { label: string }) {
  return (
    <tr className="bg-surface-muted/50 border-y border-border">
      <td colSpan={5} className="px-5 py-2 text-xs uppercase tracking-wide font-semibold text-foreground-muted">
        {label}
      </td>
    </tr>
  );
}

function Row({
  label,
  detail,
  current,
  previous,
  base,
  total,
  muted,
  indent,
  highlight,
  expense,
}: {
  label: string;
  detail?: string;
  current: number;
  previous: number;
  base: number;
  total?: boolean;
  muted?: boolean;
  indent?: boolean;
  highlight?: boolean;
  // Linha de despesa: a variação é calculada sobre o valor absoluto, então
  // "+75%" significa que gastou 75% MAIS (vermelho) — e não o contrário.
  expense?: boolean;
}) {
  const v = expense
    ? variation(Math.abs(current), Math.abs(previous))
    : variation(current, previous);
  const share = base > 0 ? (Math.abs(current) / base) * 100 : 0;
  const valueColor = highlight ? (current >= 0 ? "text-emerald-500" : "text-red-500") : "";
  const varGood = v === null ? null : expense ? v <= 0 : v >= 0;

  return (
    <tr className={`border-b border-border ${total ? "font-semibold" : ""}`}>
      <td className={`px-5 py-2.5 ${muted ? "text-foreground-muted" : ""} ${indent ? "pl-9" : ""}`}>
        {label}
        {detail && <span className="text-xs text-foreground-muted ml-2">({detail})</span>}
      </td>
      <td className={`px-5 py-2.5 text-right tabular-nums ${valueColor}`}>{money(current)}</td>
      <td className="px-5 py-2.5 text-right tabular-nums text-foreground-muted">{money(previous)}</td>
      <td className="px-5 py-2.5 text-right tabular-nums">
        {v === null ? (
          <span className="text-foreground-muted">—</span>
        ) : (
          <span className={varGood ? "text-emerald-500" : "text-red-500"}>
            {v > 0 ? "+" : ""}
            {pct(v)}
          </span>
        )}
      </td>
      <td className="px-5 py-2.5 text-right tabular-nums text-foreground-muted">
        {base > 0 ? `${share.toFixed(1)}%` : "—"}
      </td>
    </tr>
  );
}

function PercentRow({ label, current, previous }: { label: string; current: number; previous: number }) {
  const diff = current - previous;
  return (
    <tr className="border-b border-border">
      <td className="px-5 py-2.5 text-foreground-muted pl-9">{label}</td>
      <td className="px-5 py-2.5 text-right tabular-nums">{pct(current)}</td>
      <td className="px-5 py-2.5 text-right tabular-nums text-foreground-muted">{pct(previous)}</td>
      <td className="px-5 py-2.5 text-right tabular-nums">
        <span className={diff >= 0 ? "text-emerald-500" : "text-red-500"}>
          {diff >= 0 ? "+" : ""}
          {diff.toFixed(1)} p.p.
        </span>
      </td>
      <td className="px-5 py-2.5" />
    </tr>
  );
}

function IndicatorRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-t border-border">
      <td className="px-5 py-2.5 text-foreground-muted">{label}</td>
      <td className="px-5 py-2.5 text-right font-medium tabular-nums">{value}</td>
    </tr>
  );
}

function Highlight({
  label,
  value,
  previous,
  sub,
  invert,
}: {
  label: string;
  value: number;
  previous: number;
  sub?: string;
  invert?: boolean;
}) {
  const v = variation(value, previous);
  // Em despesa, crescer é ruim — inverte a cor da variação.
  const good = v === null ? null : invert ? v <= 0 : v >= 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted mb-2">{label}</p>
      <p className={`text-xl font-semibold ${!invert && value < 0 ? "text-red-500" : ""}`}>{money(value)}</p>
      <div className="flex items-center gap-1.5 mt-1 text-xs">
        {v === null ? (
          <span className="text-foreground-muted flex items-center gap-1">
            <Minus size={12} /> sem base anterior
          </span>
        ) : (
          <span className={`flex items-center gap-1 ${good ? "text-emerald-500" : "text-red-500"}`}>
            {v >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {pct(v)} vs mês anterior
          </span>
        )}
      </div>
      {sub && <p className="text-xs text-foreground-muted mt-1">{sub}</p>}
    </div>
  );
}
