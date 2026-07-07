"use client";

import { useRef } from "react";
import { Plus } from "lucide-react";
import { createClientTask } from "@/lib/actions/operations";

export function ClientTaskAdd({ clientId }: { clientId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await createClientTask(clientId, fd);
        formRef.current?.reset();
      }}
      className="flex items-center gap-2"
    >
      <input
        name="title"
        placeholder="Nova tarefa para este cliente..."
        className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-accent/40"
      />
      <button
        type="submit"
        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-surface-muted border border-border rounded-lg text-xs font-medium hover:bg-border/60"
      >
        <Plus size={13} />
        Add
      </button>
    </form>
  );
}
