"use client";

import { useActionState, useRef } from "react";
import { Plus } from "lucide-react";
import { createExpense } from "@/lib/actions/financeiro";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

const CATEGORIES = ["Salários", "Aluguel", "Ferramentas/Software", "Impostos", "Marketing", "Comissões", "Outros"];

export function ExpenseForm() {
  const [state, formAction, pending] = useActionState(createExpense, undefined);
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
      <div className="grid sm:grid-cols-4 gap-2">
        <input name="description" placeholder="Descrição" required className={inputClass} />
        <select name="category" required className={inputClass} defaultValue="">
          <option value="" disabled>
            Categoria
          </option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input name="value" type="number" step="0.01" min="0" placeholder="Valor (R$)" required className={inputClass} />
        <input name="date" type="date" required className={inputClass} />
      </div>
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start inline-flex items-center gap-1.5 px-3.5 py-2 bg-surface-muted border border-border rounded-lg text-xs font-medium hover:bg-border/60 disabled:opacity-60"
      >
        <Plus size={14} />
        {pending ? "Salvando..." : "Lançar despesa"}
      </button>
    </form>
  );
}
