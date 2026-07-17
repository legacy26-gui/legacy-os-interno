"use client";

import { Trash2 } from "lucide-react";

export function DeletePlaybookButton({ action, title }: { action: () => Promise<void>; title: string }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Excluir o playbook "${title}"? Essa ação não pode ser desfeita.`)) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-red-500/30 text-red-500 bg-red-500/5 rounded-lg text-sm hover:bg-red-500/10"
      >
        <Trash2 size={14} /> Excluir
      </button>
    </form>
  );
}
