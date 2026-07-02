"use client";

import { useActionState, useRef } from "react";
import { Paperclip } from "lucide-react";
import { addClientAttachment } from "@/lib/actions/clients";

export function AttachmentForm({ clientId }: { clientId: string }) {
  const action = addClientAttachment.bind(null, clientId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await formAction(fd);
        formRef.current?.reset();
      }}
      className="flex flex-col sm:flex-row gap-2"
    >
      <input
        name="fileName"
        required
        placeholder="Nome do anexo"
        className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
      />
      <input
        name="url"
        required
        placeholder="Link (Drive, PDF, etc.)"
        className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-surface-muted border border-border rounded-lg text-xs font-medium hover:bg-border/60 disabled:opacity-60 whitespace-nowrap"
      >
        <Paperclip size={13} />
        Anexar
      </button>
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
    </form>
  );
}
