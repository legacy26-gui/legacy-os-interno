"use client";

import { useState, useTransition } from "react";
import { updateRevenueDueDate } from "@/lib/actions/financeiro";

export function DueDateInput({ revenueId, dueDate }: { revenueId: string; dueDate: Date }) {
  // Estado local (controlado) — evita o mesmo race de refresh que fazia o
  // valor "voltar ao normal" (ver ManagerSelect).
  const [value, setValue] = useState(new Date(dueDate).toISOString().slice(0, 10));
  const [, startTransition] = useTransition();

  return (
    <input
      type="date"
      value={value}
      onChange={(e) => {
        const newValue = e.target.value;
        setValue(newValue);
        startTransition(async () => {
          await updateRevenueDueDate(revenueId, newValue);
        });
      }}
      className="text-sm rounded-md border border-border bg-surface px-2 py-1 outline-none focus:ring-2 focus:ring-accent/40"
    />
  );
}
