"use client";

import { Trash2 } from "lucide-react";

export function DeleteEventoButton({ action, label }: { action: () => Promise<void>; label: string }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Excluir o evento "${label}"?`)) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500" title="Excluir">
        <Trash2 size={14} />
      </button>
    </form>
  );
}
