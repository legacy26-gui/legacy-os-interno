"use client";

import { useState, useTransition } from "react";
import { updateTaskStatus } from "@/lib/actions/tasks";
import { TASK_STATUS_LABELS } from "@/lib/labels";
import type { TaskStatus } from "@/generated/prisma/enums";

export function TaskStatusSelect({ taskId, status }: { taskId: string; status: TaskStatus }) {
  // Estado local (controlado) — evita o mesmo race de refresh que fazia o
  // valor selecionado "voltar ao normal" (ver ManagerSelect).
  const [value, setValue] = useState(status);
  const [, startTransition] = useTransition();

  return (
    <select
      value={value}
      onChange={(e) => {
        const newValue = e.target.value as TaskStatus;
        setValue(newValue);
        startTransition(async () => {
          await updateTaskStatus(taskId, newValue);
        });
      }}
      className="text-xs rounded-md border border-border bg-surface px-2 py-1.5 outline-none"
    >
      {Object.entries(TASK_STATUS_LABELS).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
