"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { updateClientSale, deleteClientSale } from "@/lib/actions/client-sales";
import { formatCurrency, formatDate } from "@/lib/labels";

// Venda já lançada, no formato que o navegador entende (nada de Decimal/Date,
// que não atravessam do servidor pro componente de tela).
export interface VendaEditavel {
  id: string;
  clientId: string;
  description: string | null;
  value: number;
  adSpend: number;
  soldAt: string; // aaaa-mm-dd
}

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

/**
 * Formulário de correção da venda. Monta e desmonta junto com o modo de edição
 * de propósito: assim o resultado do salvamento anterior não fica pendurado e
 * fechando o formulário na cara de quem acabou de abrir de novo.
 */
function FormularioDaVenda({
  venda,
  aoTerminar,
}: {
  venda: VendaEditavel;
  aoTerminar: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateClientSale.bind(null, venda.id), undefined);
  const [removendo, iniciarRemocao] = useTransition();

  useEffect(() => {
    if (state?.ok) aoTerminar();
  }, [state, aoTerminar]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">O que foi vendido</span>
          <input
            name="description"
            defaultValue={venda.description ?? ""}
            placeholder="Ex: Onix 2020"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">Valor da venda (R$)</span>
          <input
            name="value"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={venda.value}
            className={inputClass}
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">Investido no anúncio (R$)</span>
          <input
            name="adSpend"
            type="number"
            step="0.01"
            min="0"
            defaultValue={venda.adSpend}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">Data da venda</span>
          <input name="soldAt" type="date" required defaultValue={venda.soldAt} className={inputClass} />
        </label>
      </div>

      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending || removendo}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Salvar alteração"}
        </button>
        <button
          type="button"
          onClick={aoTerminar}
          disabled={pending || removendo}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-border rounded-lg text-sm hover:bg-surface-muted disabled:opacity-60"
        >
          <X size={14} /> Cancelar
        </button>
        <button
          type="button"
          disabled={pending || removendo}
          onClick={() => {
            if (!window.confirm("Excluir esta venda? Essa ação não pode ser desfeita.")) return;
            iniciarRemocao(async () => {
              await deleteClientSale(venda.clientId, venda.id);
            });
          }}
          className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 border border-red-500/30 text-red-500 bg-red-500/5 rounded-lg text-sm hover:bg-red-500/10 disabled:opacity-60"
        >
          <Trash2 size={14} /> {removendo ? "Excluindo..." : "Excluir venda"}
        </button>
      </div>
    </form>
  );
}

function BotaoEditar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Editar venda"
      className="p-1.5 rounded-lg hover:bg-surface-muted text-foreground-muted hover:text-foreground"
    >
      <Pencil size={13} />
    </button>
  );
}

/** Venda na lista da página do cliente (Gestão de Contas). */
export function VendaItem({ venda }: { venda: VendaEditavel }) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <div className="px-5 py-4 bg-surface-muted/40">
        <FormularioDaVenda venda={venda} aoTerminar={() => setEditando(false)} />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{venda.description ?? "Venda"}</p>
        <p className="text-xs text-foreground-muted">
          {formatDate(venda.soldAt)} · investido {formatCurrency(venda.adSpend)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold text-emerald-500">{formatCurrency(venda.value)}</span>
        <BotaoEditar onClick={() => setEditando(true)} />
      </div>
    </div>
  );
}

/** Venda na tabela "Todas as vendas" do Ranking de Lojas. */
export function VendaLinha({
  venda,
  loja,
  colunas,
}: {
  venda: VendaEditavel;
  loja: React.ReactNode;
  colunas: number;
}) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <tr className="bg-surface-muted/40">
        <td colSpan={colunas} className="px-5 py-4">
          <p className="text-xs text-foreground-muted mb-2">Editando a venda de {formatDate(venda.soldAt)}</p>
          <FormularioDaVenda venda={venda} aoTerminar={() => setEditando(false)} />
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-surface-muted transition-colors">
      <td className="px-5 py-3 text-foreground-muted whitespace-nowrap">{formatDate(venda.soldAt)}</td>
      <td className="px-5 py-3">{loja}</td>
      <td className="px-5 py-3 text-foreground-muted hidden md:table-cell">{venda.description ?? "Venda"}</td>
      <td className="px-5 py-3 text-right text-foreground-muted hidden sm:table-cell">
        {formatCurrency(venda.adSpend)}
      </td>
      <td className="px-5 py-3 text-right font-medium text-emerald-500">{formatCurrency(venda.value)}</td>
      <td className="px-5 py-3 text-right">
        <BotaoEditar onClick={() => setEditando(true)} />
      </td>
    </tr>
  );
}
