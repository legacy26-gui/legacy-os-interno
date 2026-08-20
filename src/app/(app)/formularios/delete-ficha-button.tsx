"use client";

import { Trash2 } from "lucide-react";

export function DeleteFichaButton({ action, companyName }: { action: () => Promise<void>; companyName: string }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Excluir a ficha de "${companyName}"? As respostas se perdem.`)) e.preventDefault();
      }}
    >
      <button type="submit" title="Excluir ficha" className="p-2 rounded-lg hover:bg-red-500/10 text-red-500">
        <Trash2 size={14} />
      </button>
    </form>
  );
}
