"use client";

import { useActionState, useRef } from "react";
import { Plus } from "lucide-react";
import { upsertAquilaMetric } from "@/lib/actions/aquila";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

export function MetricForm() {
  const [state, formAction, pending] = useActionState(upsertAquilaMetric, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await formAction(fd);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-3"
    >
      <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <input name="storeName" placeholder="Loja" required className={inputClass} />
        <input name="periodMonth" type="month" defaultValue={currentMonth} required className={inputClass} />
        <input name="conversations" type="number" min="0" placeholder="Conversas" required className={inputClass} />
        <input name="leadsCaptured" type="number" min="0" placeholder="Leads capturados" required className={inputClass} />
        <input name="avgLeadScore" type="number" min="0" max="100" placeholder="Score médio (0-100)" required className={inputClass} />
        <input name="visitsGenerated" type="number" min="0" placeholder="Visitas geradas" required className={inputClass} />
        <input name="testDrivesGenerated" type="number" min="0" placeholder="Test drives" required className={inputClass} />
        <input name="conversions" type="number" min="0" placeholder="Conversões" required className={inputClass} />
        <input name="topSalesperson" placeholder="Vendedor destaque" className={inputClass} />
      </div>
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start inline-flex items-center gap-1.5 px-3.5 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-60"
      >
        <Plus size={14} />
        {pending ? "Salvando..." : "Registrar métricas do mês"}
      </button>
    </form>
  );
}
