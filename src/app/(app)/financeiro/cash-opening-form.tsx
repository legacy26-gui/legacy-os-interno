"use client";

import { useActionState } from "react";
import { Landmark } from "lucide-react";
import { setCashOpeningBalance } from "@/lib/actions/financeiro";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

export function CashOpeningForm({
  currentBalance,
  currentMonth,
}: {
  currentBalance?: number;
  currentMonth?: string;
}) {
  const [state, formAction, pending] = useActionState(setCashOpeningBalance, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">Saldo em banco (R$)</span>
          <input
            name="openingBalance"
            type="number"
            step="0.01"
            required
            defaultValue={currentBalance ?? ""}
            placeholder="2089,00"
            className={`${inputClass} w-36`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">No dia 1º de</span>
          <input
            name="openingMonth"
            type="month"
            required
            defaultValue={currentMonth ?? ""}
            className={`${inputClass} w-44`}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          <Landmark size={14} />
          {pending ? "Salvando..." : "Salvar saldo"}
        </button>
      </div>
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
    </form>
  );
}
