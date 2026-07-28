"use client";

import { useState, useTransition } from "react";
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
  // Estado local (controlado) em vez de depender do refresh do RSC depois da
  // action — evitava um race onde a tela mostrava o valor certo por um
  // instante e depois "voltava" pro valor antigo.
  const [value, setValue] = useState(managerId ?? "");
  const [, startTransition] = useTransition();

  return (
    <select
      value={value}
      onChange={(e) => {
        const newValue = e.target.value;
        setValue(newValue);
        startTransition(async () => {
          await assignClientManager(clientId, newValue);
        });
      }}
      className="text-xs rounded-md border border-border bg-surface px-2 py-1.5 outline-none focus:ring-2 focus:ring-accent/40"
    >
      <option value="">Sem operador</option>
      {operators.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
