"use client";

import { useActionState } from "react";
import { setSalesGoal } from "@/lib/actions/commercial";

export function SalesGoalForm({
  month,
  currentQty,
  currentValue,
}: {
  month: string;
  currentQty: number;
  currentValue: number;
}) {
  const [state, formAction, pending] = useActionState(setSalesGoal, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="month" value={month} />
      <input
        name="targetSalesQty"
        type="number"
        min="0"
        defaultValue={currentQty || ""}
        placeholder="Meta de vendas (qtd)"
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm w-40 outline-none focus:ring-2 focus:ring-accent/40"
      />
      <input
        name="targetSalesValue"
        type="number"
        step="0.01"
        min="0"
        defaultValue={currentValue || ""}
        placeholder="Meta de vendas (R$)"
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm w-40 outline-none focus:ring-2 focus:ring-accent/40"
      />
      <button
        type="submit"
        disabled={pending}
        className="px-3 py-1.5 bg-surface-muted border border-border rounded-lg text-xs font-medium hover:bg-border/60 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Definir meta"}
      </button>
      {state?.error && <span className="text-xs text-red-500">{state.error}</span>}
    </form>
  );
}
