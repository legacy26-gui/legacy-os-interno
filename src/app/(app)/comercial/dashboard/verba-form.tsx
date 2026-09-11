"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { salvarVerbaDoMes } from "@/lib/actions/comercial-canais";
import { LEAD_CHANNEL_LABELS, LEAD_CHANNEL_COLORS } from "@/lib/labels";
import type { LeadChannel } from "@/generated/prisma/enums";

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

/** Impressão e verba do mês, canal por canal — a base de todo custo do painel. */
export function VerbaForm({
  month,
  linhas,
}: {
  month: string;
  linhas: { canal: LeadChannel; impressions: number; investment: number }[];
}) {
  const [state, formAction, pending] = useActionState(salvarVerbaDoMes.bind(null, month), undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-foreground-muted text-xs uppercase tracking-wide">
              <th className="pb-2 font-medium">Canal</th>
              <th className="pb-2 font-medium w-[38%]">Impressões</th>
              <th className="pb-2 font-medium w-[38%]">Investimento (R$)</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.canal}>
                <td className="py-1.5 pr-3">
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${LEAD_CHANNEL_COLORS[l.canal]}`}
                  >
                    {LEAD_CHANNEL_LABELS[l.canal]}
                  </span>
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    name={`impressions_${l.canal}`}
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={l.impressions}
                    className={inputClass}
                  />
                </td>
                <td className="py-1.5">
                  <input
                    name={`investment_${l.canal}`}
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={l.investment}
                    className={inputClass}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Salvar o mês"}
        </button>
        {state?.ok && !pending && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
            <Check size={14} /> salvo
          </span>
        )}
      </div>
    </form>
  );
}
