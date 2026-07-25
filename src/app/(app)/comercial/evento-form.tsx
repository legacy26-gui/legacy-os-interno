"use client";

import { useActionState } from "react";
import type { CommercialEventModel as CommercialEvent } from "@/generated/prisma/models";
import type { CommercialEventFormState } from "@/lib/actions/commercial";

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent";
const labelClass = "text-sm font-medium text-foreground-muted mb-1.5 block";

export function EventoForm({
  event,
  action,
}: {
  event?: CommercialEvent;
  action: (state: CommercialEventFormState, formData: FormData) => Promise<CommercialEventFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Tipo *</label>
          <select name="type" defaultValue={event?.type ?? "VENDA"} required className={inputClass}>
            <option value="VENDA">Venda</option>
            <option value="CHURN">Churn</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Valor (R$) *</label>
          <input
            name="value"
            type="number"
            step="0.01"
            min="0"
            defaultValue={event ? event.value.toString() : ""}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Descrição / Empresa *</label>
          <input name="companyName" defaultValue={event?.companyName ?? ""} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Data *</label>
          <input
            name="date"
            type="date"
            defaultValue={event ? new Date(event.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)}
            required
            className={inputClass}
          />
        </div>
      </div>

      {state?.error && (
        <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-accent text-accent-foreground font-medium rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}
