"use client";

import { useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteExpense, deleteGastoPessoal } from "@/lib/actions/financeiro";

// Excluir um lançamento da lista de gastos (marcou duas vezes, duplicado…). Pergunta antes: apagar não volta.

export function ExcluirLancamento({ id, tipo, descricao, valor }: { id: string; tipo: "empresa" | "pessoal"; descricao: string; valor: string }) {
  const [pendente, comecar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      title="Excluir este lançamento"
      aria-label={`Excluir ${descricao}`}
      onClick={() => {
        if (!confirm(`Excluir este gasto?\n\n${descricao} — ${valor}\n\nEle sai dos gastos, do DRE e do caixa. Não dá pra desfazer.`)) return;
        comecar(async () => {
          if (tipo === "pessoal") await deleteGastoPessoal(id);
          else await deleteExpense(id);
        });
      }}
      className="p-1.5 rounded-lg text-foreground-muted/60 hover:text-red-500 hover:bg-red-500/10 disabled:opacity-50"
    >
      {pendente ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
    </button>
  );
}
