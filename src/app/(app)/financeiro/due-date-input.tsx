"use client";

import { useRef } from "react";
import { updateRevenueDueDate } from "@/lib/actions/financeiro";

export function DueDateInput({ revenueId, dueDate }: { revenueId: string; dueDate: Date }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={async (fd) => updateRevenueDueDate(revenueId, fd.get("dueDate") as string)}>
      <input
        type="date"
        name="dueDate"
        defaultValue={new Date(dueDate).toISOString().slice(0, 10)}
        onChange={() => formRef.current?.requestSubmit()}
        className="text-sm rounded-md border border-border bg-surface px-2 py-1 outline-none focus:ring-2 focus:ring-accent/40"
      />
    </form>
  );
}
