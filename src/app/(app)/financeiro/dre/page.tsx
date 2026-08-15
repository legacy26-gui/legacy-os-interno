import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Repeat,
  Receipt,
  Landmark,
  PiggyBank,
} from "lucide-react";
import { requireModuleAccess } from "@/lib/dal";
import { getDreMonth, type DreMonth } from "@/lib/metrics";
import { formatCurrency } from "@/lib/labels";
import { FinanceTabs } from "../finance-tabs";

function monthParam(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function pct(value: number) {
  return `${value >= 0 ? "" : "-"}${Math.abs(value).toFixed(1)}%`;
}

// Evita "-R$ 0,00" quando o valor é zero negativo.
function money(value: number) {
  return formatCurrency(value === 0 ? 0 : value);
}

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

  const receita = cur.receitaConfirmada;
  const lucro = cur.lucroLiquido;

  // "Pra onde foi cada real": divide a receita entre impostos, custos e lucro.
  // Quando dá prejuízo, os custos passam da receita — a base da barra vira o
  // total gasto, pra proporção continuar honesta.
  const gastoTotal = cur.impostos + cur.fixasOperacionais + cur.variaveisOperacionais;
  const baseBarra = Math.max(receita, gastoTotal, 1);
  const fatias = [
    { label: "Impostos", value: cur.impostos, color: "bg-amber-500", icon: Landmark },
    { label: "Custos fixos", value: cur.fixasOperacionais, color: "bg-red-500", icon: Repeat },
    { label: "Custos variáveis", value: cur.variaveisOperacionais, color: "bg-orange-500", icon: Receipt },
    ...(lucro > 0
      ? [{ label: "Lucro", value: lucro, color: "bg-emerald-500", icon: PiggyBank }]
      : []),
  ].filter((f) => f.value > 0);

  // Cascata: cada degrau parte da receita e vai descontando até o lucro.
  const cascata = [
    { label: "Receita recebida", value: receita, tone: "in" as const },
    { label: "(−) Impostos", value: -cur.impostos, tone: "out" as const },
    { label: "(=) Receita líquida", value: cur.receitaLiquida, tone: "step" as const },
    { label: "(−) Custos fixos", value: -cur.fixasOperacionais, tone: "out" as const },
    { label: "(−) Custos variáveis", value: -cur.variaveisOperacionais, tone: "out" as const },
    { label: "(=) EBITDA", value: cur.ebitda, tone: "result" as const },
    { label: "(=) Lucro líquido", value: lucro, tone: "final" as const },
  ];
  const maxCascata = Math.max(...cascata.map((c) => Math.abs(c.value)), 1);

  const despesasVisiveis = cur.despesasPorCategoria.filter((d) => d.category !== "Impostos");
  const maxCategoria = Math.max(...despesasVisiveis.map((d) => d.value), 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">DRE — Resultado do mês</h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Quanto entrou, quanto custou e quanto sobrou · {cur.monthLabel}
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

      <FinanceTabs month={monthParam(refDate)} />

      {/* Resultado em destaque */}
      <div
        className={`rounded-2xl border p-6 ${
          lucro >= 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted mb-1">
              {lucro >= 0 ? "Sobrou no mês (lucro)" : "Faltou no mês (prejuízo)"}
            </p>
            <p className={`text-4xl font-bold ${lucro >= 0 ? "text-emerald-500" : "text-red-500"}`}>{money(lucro)}</p>
            <p className="text-sm text-foreground-muted mt-1.5">
              De cada R$ 100 recebidos, {lucro >= 0 ? "sobraram" : "faltaram"}{" "}
              <span className={lucro >= 0 ? "text-emerald-500 font-medium" : "text-red-500 font-medium"}>
                R$ {Math.abs(cur.margemLiquida).toFixed(0)}
              </span>
            </p>
          </div>
          <ComparisonBadge current={lucro} previous={prev.lucroLiquido} previousLabel={prev.monthLabel} />
        </div>
      </div>

      {/* Onde foi cada real recebido */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-1">
          Pra onde foi cada real recebido
        </p>
        <p className="text-sm text-foreground-muted mb-4">
          Recebido no mês: <span className="font-medium text-foreground">{money(receita)}</span>
        </p>

        {fatias.length === 0 ? (
          <p className="text-sm text-foreground-muted">Sem movimentação neste mês.</p>
        ) : (
          <>
            <div className="flex h-6 rounded-lg overflow-hidden bg-surface-muted">
              {fatias.map((f) => (
                <div
                  key={f.label}
                  className={f.color}
                  style={{ width: `${(f.value / baseBarra) * 100}%` }}
                  title={`${f.label}: ${money(f.value)}`}
                />
              ))}
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
              {fatias.map(({ label, value, color, icon: Icon }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${color}`} />
                  <div className="min-w-0">
                    <p className="text-xs text-foreground-muted flex items-center gap-1">
                      <Icon size={11} /> {label}
                    </p>
                    <p className="text-sm font-semibold tabular-nums">
                      {money(value)}
                      <span className="text-xs text-foreground-muted font-normal ml-1.5">
                        {receita > 0 ? `${((value / receita) * 100).toFixed(0)}%` : ""}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {lucro < 0 && (
              <p className="text-xs text-red-500 mt-4">
                Os custos passaram da receita em {money(Math.abs(lucro))} — foi isso que gerou o prejuízo.
              </p>
            )}
          </>
        )}
      </div>

      {/* Cascata do resultado */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-4">
          Da receita até o lucro, passo a passo
        </p>

        <div className="flex flex-col gap-2.5">
          {cascata.map((c) => {
            const width = (Math.abs(c.value) / maxCascata) * 100;
            const barColor =
              c.tone === "in"
                ? "bg-emerald-500"
                : c.tone === "out"
                  ? "bg-red-500"
                  : c.value >= 0
                    ? "bg-accent"
                    : "bg-red-500";
            const isBold = c.tone === "result" || c.tone === "final" || c.tone === "step";

            return (
              <div key={c.label} className="flex items-center gap-3">
                <span
                  className={`text-sm w-44 shrink-0 ${isBold ? "font-semibold" : "text-foreground-muted"}`}
                >
                  {c.label}
                </span>
                <div className="flex-1 h-6 rounded bg-surface-muted overflow-hidden">
                  <div className={`h-full ${barColor} transition-all`} style={{ width: `${width}%` }} />
                </div>
                <span
                  className={`text-sm tabular-nums w-32 text-right shrink-0 ${
                    isBold ? "font-semibold" : ""
                  } ${c.value < 0 ? "text-red-500" : c.tone === "final" || c.tone === "result" ? "text-emerald-500" : ""}`}
                >
                  {money(c.value)}
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-foreground-muted mt-4 pt-3 border-t border-border">
          EBITDA = resultado operacional antes de impostos sobre lucro, juros e depreciação. Como não controlamos
          imobilizado nem empréstimos, EBITDA e lucro líquido dão o mesmo valor aqui.
        </p>
      </div>

      {/* Custos por categoria */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-4">
          Maiores custos do mês
        </p>
        {despesasVisiveis.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nenhum custo lançado neste mês.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {despesasVisiveis.map((d) => (
              <div key={d.category} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    {d.category}
                    {d.fixo > 0 && d.variavel === 0 && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-muted text-foreground-muted">
                        fixa
                      </span>
                    )}
                    {d.fixo > 0 && d.variavel > 0 && (
                      <span className="text-[10px] text-foreground-muted">
                        (fixa {money(d.fixo)} + variável {money(d.variavel)})
                      </span>
                    )}
                  </span>
                  <span className="font-medium tabular-nums">
                    {money(d.value)}
                    <span className="text-xs text-foreground-muted font-normal ml-1.5">
                      {receita > 0 ? `${((d.value / receita) * 100).toFixed(0)}% da receita` : ""}
                    </span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                  <div className="h-full bg-red-500" style={{ width: `${(d.value / maxCategoria) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comparativo e metas de saúde */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CompareCard label="Receita recebida" current={receita} previous={prev.receitaConfirmada} />
        <CompareCard label="Custo total" current={cur.totalDespesas} previous={prev.totalDespesas} invert />
        <CompareCard label="EBITDA" current={cur.ebitda} previous={prev.ebitda} />
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 text-foreground-muted mb-2">
            <Target size={15} />
            <span className="text-xs font-semibold uppercase tracking-wide">Ponto de equilíbrio</span>
          </div>
          <p className="text-lg font-semibold">{money(cur.pontoEquilibrio)}</p>
          <p className={`text-xs mt-1 ${receita >= cur.pontoEquilibrio ? "text-emerald-500" : "text-amber-500"}`}>
            {receita >= cur.pontoEquilibrio
              ? "Atingido neste mês"
              : `Faltam ${money(cur.pontoEquilibrio - receita)}`}
          </p>
        </div>
      </div>

      {/* Detalhe técnico, pra quem quiser conferir linha a linha */}
      <details className="rounded-2xl border border-border bg-surface overflow-hidden">
        <summary className="px-5 py-4 text-sm font-medium cursor-pointer hover:bg-surface-muted transition-colors">
          Ver detalhe técnico (linha a linha, com mês anterior)
        </summary>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-sm min-w-[40rem]">
            <thead>
              <tr className="border-b border-border text-foreground-muted text-xs uppercase tracking-wide">
                <th className="px-5 py-3 font-medium text-left">Conta</th>
                <th className="px-5 py-3 font-medium text-right">{cur.monthLabel}</th>
                <th className="px-5 py-3 font-medium text-right">{prev.monthLabel}</th>
                <th className="px-5 py-3 font-medium text-right">% Rec.</th>
              </tr>
            </thead>
            <tbody>
              <TechRow label="Receita bruta confirmada" cur={receita} prev={prev.receitaConfirmada} base={receita} />
              <TechRow label="A receber no mês" cur={cur.receitaPendente} prev={prev.receitaPendente} base={receita} muted />
              <TechRow label="(−) Impostos" cur={-cur.impostos} prev={-prev.impostos} base={receita} />
              <TechRow label="(=) Receita líquida" cur={cur.receitaLiquida} prev={prev.receitaLiquida} base={receita} bold />
              <TechRow
                label="(−) Despesas operacionais"
                cur={-cur.despesasOperacionais}
                prev={-prev.despesasOperacionais}
                base={receita}
              />
              <TechRow label="Das quais fixas" cur={-cur.fixasOperacionais} prev={-prev.fixasOperacionais} base={receita} muted />
              <TechRow
                label="Das quais variáveis"
                cur={-cur.variaveisOperacionais}
                prev={-prev.variaveisOperacionais}
                base={receita}
                muted
              />
              <TechRow label="(=) EBITDA" cur={cur.ebitda} prev={prev.ebitda} base={receita} bold />
              <TechRow label="Margem EBITDA" cur={cur.margemEbitda} prev={prev.margemEbitda} base={0} isPercent muted />
              <TechRow label="(−) Depreciação e amortização" cur={-cur.depreciacao} prev={-prev.depreciacao} base={receita} muted />
              <TechRow label="(=) EBIT" cur={cur.ebit} prev={prev.ebit} base={receita} bold />
              <TechRow
                label="(+/−) Resultado financeiro"
                cur={cur.resultadoFinanceiro}
                prev={prev.resultadoFinanceiro}
                base={receita}
                muted
              />
              <TechRow label="(=) Lucro líquido" cur={lucro} prev={prev.lucroLiquido} base={receita} bold />
              <TechRow label="Margem líquida" cur={cur.margemLiquida} prev={prev.margemLiquida} base={0} isPercent muted />
              <TechRow label="Clientes que pagaram" cur={cur.clientesFaturados} prev={prev.clientesFaturados} base={0} isCount muted />
              <TechRow label="Ticket médio recebido" cur={cur.ticketMedioRecebido} prev={prev.ticketMedioRecebido} base={receita} muted />
              <TechRow label="Clientes em aberto" cur={cur.clientesInadimplentes} prev={prev.clientesInadimplentes} base={0} isCount muted />
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function TechRow({
  label,
  cur,
  prev,
  base,
  bold,
  muted,
  isPercent,
  isCount,
}: {
  label: string;
  cur: number;
  prev: number;
  base: number;
  bold?: boolean;
  muted?: boolean;
  isPercent?: boolean;
  isCount?: boolean;
}) {
  const fmt = (v: number) => (isPercent ? pct(v) : isCount ? String(v) : money(v));
  return (
    <tr className={`border-b border-border ${bold ? "font-semibold" : ""}`}>
      <td className={`px-5 py-2.5 ${muted ? "text-foreground-muted" : ""}`}>{label}</td>
      <td className="px-5 py-2.5 text-right tabular-nums">{fmt(cur)}</td>
      <td className="px-5 py-2.5 text-right tabular-nums text-foreground-muted">{fmt(prev)}</td>
      <td className="px-5 py-2.5 text-right tabular-nums text-foreground-muted">
        {base > 0 && !isPercent && !isCount ? `${((Math.abs(cur) / base) * 100).toFixed(1)}%` : "—"}
      </td>
    </tr>
  );
}

function ComparisonBadge({
  current,
  previous,
  previousLabel,
}: {
  current: number;
  previous: number;
  previousLabel: string;
}) {
  const v = variation(current, previous);
  return (
    <div className="text-sm">
      {v === null ? (
        <span className="text-foreground-muted flex items-center gap-1.5">
          <Minus size={13} /> sem comparação com {previousLabel}
        </span>
      ) : (
        <span className={`flex items-center gap-1.5 font-medium ${v >= 0 ? "text-emerald-500" : "text-red-500"}`}>
          {v >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
          {pct(v)} vs {previousLabel}
        </span>
      )}
      <p className="text-xs text-foreground-muted mt-0.5">
        {previousLabel}: {money(previous)}
      </p>
    </div>
  );
}

function CompareCard({
  label,
  current,
  previous,
  invert,
}: {
  label: string;
  current: number;
  previous: number;
  invert?: boolean;
}) {
  const v = variation(current, previous);
  const good = v === null ? null : invert ? v <= 0 : v >= 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted mb-2">{label}</p>
      <p className={`text-lg font-semibold ${!invert && current < 0 ? "text-red-500" : ""}`}>{money(current)}</p>
      {v === null ? (
        <p className="text-xs text-foreground-muted mt-1 flex items-center gap-1">
          <Minus size={11} /> sem base anterior
        </p>
      ) : (
        <p className={`text-xs mt-1 flex items-center gap-1 ${good ? "text-emerald-500" : "text-red-500"}`}>
          {v >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {pct(v)} vs mês anterior
        </p>
      )}
    </div>
  );
}
