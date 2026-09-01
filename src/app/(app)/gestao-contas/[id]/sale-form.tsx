"use client";

import { useActionState, useEffect, useRef } from "react";
import { Car } from "lucide-react";
import { createClientSale } from "@/lib/actions/client-sales";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

export function SaleForm({ clientId, defaultDate }: { clientId: string; defaultDate: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(createClientSale.bind(null, clientId), undefined);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">O que foi vendido</span>
          <input name="description" placeholder="Ex: Onix 2020" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">Valor da venda (R$)</span>
          <input name="value" type="number" step="0.01" min="0" required placeholder="65000" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">Investido no anúncio (R$)</span>
          <input name="adSpend" type="number" step="0.01" min="0" placeholder="300" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">Data da venda</span>
          <input name="soldAt" type="date" required defaultValue={defaultDate} className={inputClass} />
        </label>
      </div>
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
      >
        <Car size={15} />
        {pending ? "Salvando..." : "Registrar venda"}
      </button>
    </form>
  );
}
