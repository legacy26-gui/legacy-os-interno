"use client";

import { useActionState } from "react";
import { BR_STATES } from "@/lib/br-states";
import { CLIENT_STATUS_LABELS } from "@/lib/labels";
import type { ClientModel as Client } from "@/generated/prisma/models";
import type { ClientFormState } from "@/lib/actions/clients";

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent";
const labelClass = "text-sm font-medium text-foreground-muted mb-1.5 block";

export function ClientForm({
  client,
  action,
}: {
  client?: Client;
  action: (state: ClientFormState, formData: FormData) => Promise<ClientFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Nome da empresa *</label>
          <input name="companyName" defaultValue={client?.companyName} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Nome do responsável *</label>
          <input name="contactName" defaultValue={client?.contactName} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Telefone</label>
          <input name="phone" defaultValue={client?.phone ?? ""} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>WhatsApp</label>
          <input name="whatsapp" defaultValue={client?.whatsapp ?? ""} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>E-mail</label>
          <input name="email" type="email" defaultValue={client?.email ?? ""} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>CNPJ</label>
          <input name="cnpj" defaultValue={client?.cnpj ?? ""} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Cidade</label>
          <input name="city" defaultValue={client?.city ?? ""} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Estado</label>
          <select name="state" defaultValue={client?.state ?? ""} className={inputClass}>
            <option value="">Selecione</option>
            {BR_STATES.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Data de início</label>
          <input
            name="startDate"
            type="date"
            defaultValue={client?.startDate ? new Date(client.startDate).toISOString().slice(0, 10) : ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Plano contratado</label>
          <input name="plan" defaultValue={client?.plan ?? ""} placeholder="Ex: Gestão Completa" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Valor mensal (R$) *</label>
          <input
            name="monthlyValue"
            type="number"
            step="0.01"
            min="0"
            defaultValue={client ? client.monthlyValue.toString() : ""}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Dia de vencimento</label>
          <input
            name="dueDay"
            type="number"
            min="1"
            max="31"
            defaultValue={client?.dueDay ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Status *</label>
          <select name="status" defaultValue={client?.status ?? "IMPLANTACAO"} required className={inputClass}>
            {Object.entries(CLIENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Observações internas</label>
        <textarea
          name="internalNotes"
          defaultValue={client?.internalNotes ?? ""}
          rows={4}
          className={inputClass}
          placeholder="Notas visíveis apenas para a equipe interna..."
        />
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
