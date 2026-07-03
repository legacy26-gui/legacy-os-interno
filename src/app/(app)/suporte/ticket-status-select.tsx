"use client";

import { useRef } from "react";
import { updateTicketStatus } from "@/lib/actions/support";
import { TICKET_STATUS_LABELS } from "@/lib/labels";
import type { TicketStatus } from "@/generated/prisma/enums";

export function TicketStatusSelect({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={async (fd) => updateTicketStatus(ticketId, fd.get("status") as string)}>
      <select
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        className="text-xs rounded-md border border-border bg-surface px-2 py-1.5 outline-none"
      >
        {Object.entries(TICKET_STATUS_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </form>
  );
}
