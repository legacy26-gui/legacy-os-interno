"use client";

import { useState, useTransition } from "react";
import { Trash2, Check, X } from "lucide-react";
import { apagarVendaQueMarquei } from "@/lib/actions/marcar-venda";

/**
 * Desfazer uma venda que a própria pessoa marcou.
 *
 * Pede confirmação no lugar, e a confirmação diz o que vai acontecer com
 * todas as letras: apagar venda mexe no Controle de Vendas e no Ranking, e
 * quem marcou às pressas tem que entender isso antes de clicar, não depois.
 */
export function ApagarVenda({ saleId, loja }: { saleId: string; loja: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [apagando, iniciar] = useTransition();

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        title="Apagar esta venda"
        aria-label={`Apagar a venda de ${loja}`}
        className="p-1.5 rounded-lg text-foreground-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 size={14} />
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[11px] text-foreground-muted">Apagar?</span>
      <button
        type="button"
        disabled={apagando}
        onClick={() => iniciar(() => void apagarVendaQueMarquei(saleId))}
        className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 disabled:opacity-50"
        title="Sim, apagar"
      >
        <Check size={14} />
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-muted"
        title="Cancelar"
      >
        <X size={14} />
      </button>
    </span>
  );
}
