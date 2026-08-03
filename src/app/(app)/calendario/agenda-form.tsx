"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { createAgendaItem } from "@/lib/actions/agenda";

const TYPE_OPTIONS = [
  ["AGENDAMENTO", "Agendamento"],
  ["REUNIAO", "Reunião"],
  ["TEMPO", "Bloqueio de tempo"],
] as const;

export function AgendaForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, saving] = useActionState(createAgendaItem, undefined);

  useEffect(() => {
    if (state && !state.error) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <input
          name="title"
          placeholder="Título (ex: Reunião com cliente X)"
          required
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <select
          name="type"
          defaultValue="AGENDAMENTO"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        >
          {TYPE_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <input
          type="date"
          name="date"
          required
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <input
          type="time"
          name="startTime"
          required
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <input
          type="time"
          name="endTime"
          placeholder="Até (opcional)"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>
      <input
        name="notes"
        placeholder="Observações (opcional)"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
      />
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="self-start inline-flex items-center gap-1.5 px-3.5 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
      >
        <Plus size={14} />
        {saving ? "Adicionando..." : "Adicionar à minha agenda"}
      </button>
    </form>
  );
}
