"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, Plus } from "lucide-react";
import { marcarVenda, type MarcarVendaState } from "@/lib/actions/marcar-venda";
import { SeletorDeLoja, type LojaDaLista } from "@/components/seletor-de-loja";

// O formulário de marcar venda.
//
// A loja é ESCOLHIDA, nunca digitada: o que se digita serve só pra achar na
// lista. Digitar o nome da loja criaria "Jânio", "Janio Multimarcas" e "janio
// multi" como se fossem três lojas, e o controle de vendas passaria a contar
// errado sem ninguém perceber.

export type { LojaDaLista };

export function MarcarVendaForm({ lojas, hoje }: { lojas: LojaDaLista[]; hoje: string }) {
  const [estado, enviar, enviando] = useActionState<MarcarVendaState, FormData>(
    marcarVenda,
    undefined
  );
  const [escolhida, setEscolhida] = useState<LojaDaLista | null>(null);
  const form = useRef<HTMLFormElement>(null);

  // Salvou: limpa pra marcar a próxima. A loja também sai — marcar duas vendas
  // seguidas pra lojas diferentes é o caso comum, e deixar a anterior
  // escolhida convida ao engano.
  useEffect(() => {
    if (estado?.ok) {
      form.current?.reset();
      setEscolhida(null);
    }
  }, [estado]);

  return (
    <form ref={form} action={enviar} className="flex flex-col gap-4">
      <div>
        <label className="block text-xs font-medium text-foreground-muted mb-1.5">Loja</label>
        <SeletorDeLoja lojas={lojas} escolhida={escolhida} aoEscolher={setEscolhida} />
        {/* O id só existe quando houve escolha de verdade. O servidor confere
            de novo se a loja é desta pessoa — isto aqui é conveniência. */}
        <input type="hidden" name="clientId" value={escolhida?.id ?? ""} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="value" className="block text-xs font-medium text-foreground-muted mb-1.5">
            Valor da venda
          </label>
          <input
            id="value"
            name="value"
            type="number"
            step="0.01"
            min="0"
            required
            inputMode="decimal"
            placeholder="45000"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div>
          <label htmlFor="soldAt" className="block text-xs font-medium text-foreground-muted mb-1.5">
            Dia da venda
          </label>
          <input
            id="soldAt"
            name="soldAt"
            type="date"
            required
            defaultValue={hoje}
            max={hoje}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div>
          <label htmlFor="adSpend" className="block text-xs font-medium text-foreground-muted mb-1.5">
            Investimento <span className="font-normal">(opcional)</span>
          </label>
          <input
            id="adSpend"
            name="adSpend"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-xs font-medium text-foreground-muted mb-1.5"
        >
          Observação <span className="font-normal">(opcional)</span>
        </label>
        <input
          id="description"
          name="description"
          placeholder="Ex: Onix 2020 — veio pelo anúncio do fim de semana"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      {estado?.erro && (
        <p className="text-sm text-red-500 flex items-center gap-1.5">
          <CircleAlert size={14} className="shrink-0" /> {estado.erro}
        </p>
      )}
      {estado?.ok && (
        <p className="text-sm text-emerald-500 flex items-center gap-1.5">
          <Check size={14} className="shrink-0" /> Venda marcada para {estado.loja}.
        </p>
      )}

      <button
        type="submit"
        // Sem loja escolhida não dá pra enviar: barrar aqui evita a ida ao
        // servidor só pra voltar com "escolha a loja".
        disabled={enviando || !escolhida}
        className="self-start inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus size={15} />
        {enviando ? "Marcando..." : "Marcar venda"}
      </button>
    </form>
  );
}
