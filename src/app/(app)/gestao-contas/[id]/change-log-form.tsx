"use client";

import { useRef } from "react";
import { Plus } from "lucide-react";
import { logCampaignChange } from "@/lib/actions/account-management";
import { CAMPAIGN_CHANGE_TYPE_LABELS } from "@/lib/labels";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

export function ChangeLogForm({ clientId }: { clientId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await logCampaignChange(clientId, fd);
        formRef.current?.reset();
      }}
      className="flex flex-col sm:flex-row gap-2"
    >
      <select name="type" defaultValue="ORCAMENTO_ALTERADO" className={inputClass} required>
        {Object.entries(CAMPAIGN_CHANGE_TYPE_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <input name="description" placeholder="Descrição (opcional)" className={`${inputClass} flex-1`} />
      <button
        type="submit"
        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90"
      >
        <Plus size={15} />
        Registrar alteração
      </button>
    </form>
  );
}
