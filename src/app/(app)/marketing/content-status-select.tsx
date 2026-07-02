"use client";

import { useRef } from "react";
import { updateContentStatus } from "@/lib/actions/content";
import { CONTENT_STATUS_LABELS } from "@/lib/labels";
import type { ContentStatus } from "@/generated/prisma/enums";

export function ContentStatusSelect({ itemId, status }: { itemId: string; status: ContentStatus }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={async (fd) => updateContentStatus(itemId, fd.get("status") as string)}>
      <select
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        className="text-xs rounded-md border border-border bg-surface px-2 py-1.5 outline-none"
      >
        {Object.entries(CONTENT_STATUS_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </form>
  );
}
