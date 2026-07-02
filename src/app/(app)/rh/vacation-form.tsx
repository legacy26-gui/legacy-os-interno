"use client";

import { useActionState, useRef } from "react";
import { addVacation } from "@/lib/actions/employees";

export function VacationForm({ employeeId }: { employeeId: string }) {
  const action = addVacation.bind(null, employeeId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await formAction(fd);
        formRef.current?.reset();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input name="startDate" type="date" required className="rounded-md border border-border bg-surface px-2 py-1 text-xs" />
      <span className="text-xs text-foreground-muted">até</span>
      <input name="endDate" type="date" required className="rounded-md border border-border bg-surface px-2 py-1 text-xs" />
      <button
        type="submit"
        disabled={pending}
        className="px-2.5 py-1 bg-surface-muted border border-border rounded-md text-xs hover:bg-border/60 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Registrar férias"}
      </button>
      {state?.error && <span className="text-xs text-red-500">{state.error}</span>}
    </form>
  );
}
