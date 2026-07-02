"use client";

import { useActionState, useRef } from "react";
import { Send } from "lucide-react";
import { addClientHistory } from "@/lib/actions/clients";

export function HistoryForm({ clientId }: { clientId: string }) {
  const action = addClientHistory.bind(null, clientId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await formAction(fd);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-2"
    >
      <textarea
        name="note"
        rows={2}
        required
        placeholder="Registrar uma interação, decisão ou observação..."
        className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
      />
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-end inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-60"
      >
        <Send size={13} />
        {pending ? "Enviando..." : "Adicionar"}
      </button>
    </form>
  );
}
