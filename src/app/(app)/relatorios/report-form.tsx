"use client";

import { useActionState, useRef } from "react";
import { Plus } from "lucide-react";
import { createReport } from "@/lib/actions/reports";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

export function ReportForm({ clients }: { clients: { id: string; companyName: string }[] }) {
  const [state, formAction, pending] = useActionState(createReport, undefined);
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
      <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <select name="clientId" required className={inputClass}>
          <option value="">Cliente</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.companyName}
            </option>
          ))}
        </select>
        <input name="periodLabel" placeholder="Período (ex: Junho/2026)" required className={inputClass} />
        <input name="investment" type="number" step="0.01" min="0" placeholder="Investimento (R$)" required className={inputClass} />
        <input name="leads" type="number" min="0" placeholder="Leads" required className={inputClass} />
        <input name="reach" type="number" min="0" placeholder="Alcance" required className={inputClass} />
        <input name="impressions" type="number" min="0" placeholder="Impressões" required className={inputClass} />
      </div>
      <textarea name="recommendations" rows={2} placeholder="Recomendações..." className={inputClass} />
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start inline-flex items-center gap-1.5 px-3.5 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-60"
      >
        <Plus size={14} />
        {pending ? "Gerando..." : "Gerar relatório"}
      </button>
    </form>
  );
}
