import { CheckCircle2, Wallet, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/labels";
import { markRevenuePaid } from "@/lib/actions/financeiro";
import type { MrrRevenueGroup } from "@/lib/mrr-revenue";

export function MrrBoard({
  monthLabel,
  groups,
  totalMonth,
  paidTotal,
  pendingTotal,
}: {
  monthLabel: string;
  groups: MrrRevenueGroup[];
  totalMonth: number;
  paidTotal: number;
  pendingTotal: number;
}) {
  const percent = totalMonth > 0 ? Math.min(100, (paidTotal / totalMonth) * 100) : 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">Faturamento do mês (MRR)</p>
          <p className="text-sm text-foreground-muted mt-0.5 capitalize">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-emerald-500">
            <CheckCircle2 size={14} /> {formatCurrency(paidTotal)} confirmado
          </span>
          <span className="flex items-center gap-1.5 text-amber-500">
            <Clock size={14} /> {formatCurrency(pendingTotal)} pendente
          </span>
        </div>
      </div>

      <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
        <div className="h-full bg-emerald-500" style={{ width: `${percent}%` }} />
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-foreground-muted">Nenhum cliente com mensalidade ativa este mês.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.day} className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wide">
                Dia {String(g.day).padStart(2, "0")}
              </p>
              <div className="rounded-xl border border-border overflow-hidden">
                {g.items.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors"
                  >
                    <span className="text-sm">{r.client.companyName}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{formatCurrency(r.value.toString())}</span>
                      {r.status === "PAGO" ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-500 px-2.5 py-1 rounded-full bg-emerald-500/15">
                          <CheckCircle2 size={12} /> Pago
                        </span>
                      ) : (
                        <form action={markRevenuePaid.bind(null, r.id)}>
                          <button
                            type="submit"
                            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-accent text-accent-foreground hover:opacity-90"
                          >
                            <Wallet size={12} /> Confirmar pagamento
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
