"use client";

import { useRef } from "react";
import { updateTaskStatus } from "@/lib/actions/tasks";
import { TASK_STATUS_LABELS } from "@/lib/labels";
import type { TaskStatus } from "@/generated/prisma/enums";

export function TaskStatusSelect({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={async (fd) => updateTaskStatus(taskId, fd.get("status") as string)}>
      <select
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        className="text-xs rounded-md border border-border bg-surface px-2 py-1.5 outline-none"
      >
        {Object.entries(TASK_STATUS_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </form>
  );
}
