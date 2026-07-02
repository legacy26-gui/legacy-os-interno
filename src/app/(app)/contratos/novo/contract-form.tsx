"use client";

import { useActionState } from "react";
import { createContract } from "@/lib/actions/contracts";
import { CONTRACT_TEMPLATE_TYPE_LABELS } from "@/lib/labels";

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40";
const labelClass = "text-sm font-medium text-foreground-muted mb-1.5 block";

export function ContractForm({
  clients,
  templates,
}: {
  clients: { id: string; companyName: string; monthlyValue: string }[];
  templates: { id: string; name: string; type: string }[];
}) {
  const [state, formAction, pending] = useActionState(createContract, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>Cliente *</label>
        <select name="clientId" required className={inputClass}>
          <option value="">Selecione o cliente</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.companyName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Modelo de contrato *</label>
        <select name="templateId" required className={inputClass}>
          <option value="">Selecione o modelo</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({CONTRACT_TEMPLATE_TYPE_LABELS[t.type as keyof typeof CONTRACT_TEMPLATE_TYPE_LABELS]})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Valor do contrato (R$) *</label>
        <input name="value" type="number" step="0.01" min="0" required className={inputClass} />
      </div>

      {state?.error && (
        <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start px-5 py-2.5 bg-accent text-accent-foreground font-medium rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {pending ? "Gerando..." : "Gerar contrato"}
      </button>
    </form>
  );
}
