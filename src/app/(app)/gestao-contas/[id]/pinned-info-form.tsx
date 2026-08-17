"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pin, Plus, X } from "lucide-react";
import { createPinnedInfo } from "@/lib/actions/client-sales";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

export function PinnedInfoForm({ clientId }: { clientId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createPinnedInfo.bind(null, clientId), undefined);

  useEffect(() => {
    if (state && !state.error) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-border text-xs font-medium text-foreground-muted hover:bg-surface-muted"
      >
        <Plus size={13} /> Fixar informação
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-foreground-muted">Informação</span>
        <input name="label" required placeholder="Verba" className={`${inputClass} w-32`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-foreground-muted">Conteúdo</span>
        <input name="value" required placeholder="R$ 30/dia" className={`${inputClass} w-44`} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 px-3 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
      >
        <Pin size={13} />
        {pending ? "Salvando..." : "Fixar"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="p-2 rounded-lg hover:bg-surface-muted text-foreground-muted"
        aria-label="Cancelar"
      >
        <X size={15} />
      </button>
      {state?.error && <p className="text-xs text-red-500 w-full">{state.error}</p>}
    </form>
  );
}
