"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { formatCurrency } from "@/lib/labels";
import { updateRevenueValue } from "@/lib/actions/financeiro";

// O valor de uma cobrança, com o lápis pra corrigir: "o cliente pagou a menos / a mais do que o combinado".
// Numa cobrança já paga, o caixa e o faturamento passam a contar o valor novo.

export function ValorEditavel({ revenueId, value, className = "" }: { revenueId: string; value: string; className?: string }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(() => String(Number(value)).replace(".", ","));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();

  function salvar() {
    const n = Number(texto.replace(/\./g, "").replace(",", "."));
    comecar(async () => {
      const r = await updateRevenueValue(revenueId, n);
      if (r.ok) {
        setErro(null);
        setEditando(false);
      } else setErro(r.erro ?? "Não consegui salvar.");
    });
  }

  if (!editando) {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`}>
        {formatCurrency(value)}
        <button
          type="button"
          onClick={() => {
            setTexto(String(Number(value)).replace(".", ","));
            setEditando(true);
          }}
          title="Corrigir o valor (o cliente pagou a menos ou a mais)"
          className="p-0.5 rounded text-foreground-muted/60 hover:text-accent"
        >
          <Pencil size={12} />
        </button>
      </span>
    );
  }
  return (
    <span className={`inline-flex flex-col items-end gap-0.5 ${className}`}>
      <span className="inline-flex items-center gap-1">
        <span className="text-xs text-foreground-muted">R$</span>
        <input
          autoFocus
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") setEditando(false);
          }}
          className="w-24 text-sm text-right rounded-md border border-border bg-surface px-2 py-1 outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button type="button" disabled={pendente} onClick={salvar} title="Salvar" className="p-1 rounded text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50">
          <Check size={14} />
        </button>
        <button type="button" onClick={() => setEditando(false)} title="Cancelar" className="p-1 rounded text-foreground-muted hover:bg-surface-muted">
          <X size={14} />
        </button>
      </span>
      {erro && <span className="text-xs text-red-500">{erro}</span>}
    </span>
  );
}
