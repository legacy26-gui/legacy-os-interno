"use client";

import { useActionState, useRef } from "react";
import { Plus } from "lucide-react";
import { createRevenue } from "@/lib/actions/financeiro";
import { REVENUE_STATUS_LABELS } from "@/lib/labels";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

export function RevenueForm({ clients }: { clients: { id: string; companyName: string }[] }) {
  const [state, formAction, pending] = useActionState(createRevenue, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await formAction(fd);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-3"
    >
      <div className="grid sm:grid-cols-5 gap-2">
        <select name="clientId" required className={inputClass}>
          <option value="">Cliente</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.companyName}
            </option>
          ))}
        </select>
        <input name="description" placeholder="Descrição" required className={inputClass} />
        <input name="value" type="number" step="0.01" min="0" placeholder="Valor (R$)" required className={inputClass} />
        <input name="dueDate" type="date" required className={inputClass} />
        <select name="status" defaultValue="PENDENTE" className={inputClass}>
          {Object.entries(REVENUE_STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start inline-flex items-center gap-1.5 px-3.5 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-60"
      >
        <Plus size={14} />
        {pending ? "Salvando..." : "Lançar receita"}
      </button>
    </form>
  );
}
