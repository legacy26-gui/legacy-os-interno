"use client";

import { useActionState } from "react";
import { setMonthlyGoal } from "@/lib/actions/financeiro";

export function GoalForm({ month, currentTarget }: { month: string; currentTarget: number }) {
  const [state, formAction, pending] = useActionState(setMonthlyGoal, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="month" value={month} />
      <input
        name="targetRevenue"
        type="number"
        step="0.01"
        min="0"
        defaultValue={currentTarget || ""}
        placeholder="Meta do mês (R$)"
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
