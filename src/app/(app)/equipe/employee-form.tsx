"use client";

import { useActionState, useRef } from "react";
import { Plus } from "lucide-react";
import { createEmployee } from "@/lib/actions/employees";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

export function EmployeeForm() {
  const [state, formAction, pending] = useActionState(createEmployee, undefined);
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
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <input name="name" placeholder="Nome" required className={inputClass} />
        <input name="position" placeholder="Função" required className={inputClass} />
        <input name="salary" type="number" step="0.01" min="0" placeholder="Salário (R$)" required className={inputClass} />
        <input name="hiredAt" type="date" required className={inputClass} title="Data de admissão" />
      </div>
      <textarea name="notes" rows={2} placeholder="Observações..." className={inputClass} />
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start inline-flex items-center gap-1.5 px-3.5 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-60"
      >
        <Plus size={14} />
        {pending ? "Salvando..." : "Novo colaborador"}
      </button>
    </form>
  );
}
