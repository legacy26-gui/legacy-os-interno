"use client";

import { Trash2 } from "lucide-react";

export function DeleteClientButton({
  action,
  companyName,
  compact = false,
}: {
  action: () => Promise<void>;
  companyName: string;
  compact?: boolean;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Excluir o cliente "${companyName}"? Essa ação não pode ser desfeita.`)) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        title="Excluir cliente"
        className={
          compact
            ? "p-1.5 rounded-lg hover:bg-red-500/10 text-red-500"
            : "inline-flex items-center gap-1.5 px-3.5 py-2 border border-red-500/30 text-red-500 bg-red-500/5 rounded-lg text-sm hover:bg-red-500/10"
        }
      >
        <Trash2 size={compact ? 14 : 14} />
        {!compact && "Excluir"}
      </button>
    </form>
  );
}
