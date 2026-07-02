"use client";

import { useActionState, useRef } from "react";
import { Plus } from "lucide-react";
import { createLead } from "@/lib/actions/leads";
import { LEAD_ORIGIN_LABELS } from "@/lib/labels";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

export function LeadForm() {
  const [state, formAction, pending] = useActionState(createLead, undefined);
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
        <input name="companyName" placeholder="Empresa" required className={inputClass} />
        <input name="contactName" placeholder="Contato" required className={inputClass} />
        <input name="city" placeholder="Cidade" className={inputClass} />
        <input name="phone" placeholder="Telefone" className={inputClass} />
        <select name="origin" required className={inputClass} defaultValue="">
          <option value="" disabled>
            Origem
          </option>
          {Object.entries(LEAD_ORIGIN_LABELS).map(([v, l]) => (
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
        {pending ? "Salvando..." : "Novo lead"}
      </button>
    </form>
  );
}
