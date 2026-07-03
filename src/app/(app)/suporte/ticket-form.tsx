"use client";

import { useActionState, useRef } from "react";
import { Plus } from "lucide-react";
import { createTicket } from "@/lib/actions/support";
import { TASK_PRIORITY_LABELS } from "@/lib/labels";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

export function TicketForm({
  clients,
  users,
}: {
  clients: { id: string; companyName: string }[];
  users: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(createTicket, undefined);
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
      <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <select name="clientId" required className={inputClass} defaultValue="">
          <option value="">Cliente</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.companyName}
            </option>
          ))}
        </select>
        <input name="subject" placeholder="Assunto" required className={`${inputClass} lg:col-span-2`} />
        <select name="assigneeId" className={inputClass} defaultValue="">
          <option value="">Responsável</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select name="priority" defaultValue="MEDIA" className={inputClass}>
          {Object.entries(TASK_PRIORITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <textarea
        name="description"
        placeholder="Descrição do problema (opcional)"
        rows={2}
        className={inputClass}
      />
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start inline-flex items-center gap-1.5 px-3.5 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-60"
      >
        <Plus size={14} />
        {pending ? "Salvando..." : "Abrir chamado"}
      </button>
    </form>
  );
}
