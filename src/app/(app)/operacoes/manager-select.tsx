"use client";

import { useRef } from "react";
import { assignClientManager } from "@/lib/actions/operations";

export function ManagerSelect({
  clientId,
  managerId,
  operators,
}: {
  clientId: string;
  managerId: string | null;
  operators: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={async (fd) => assignClientManager(clientId, fd.get("managerId") as string)}>
      <select
        name="managerId"
        defaultValue={managerId ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className="text-xs rounded-md border border-border bg-surface px-2 py-1.5 outline-none focus:ring-2 focus:ring-accent/40"
      >
        <option value="">Sem operador</option>
        {operators.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </form>
  );
}
