"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, X, Store, CircleAlert, Plus } from "lucide-react";
import { marcarVenda, type MarcarVendaState } from "@/lib/actions/marcar-venda";

// O formulário de marcar venda.
//
// A loja é ESCOLHIDA, nunca digitada: o que se digita serve só pra achar na
// lista. Digitar o nome da loja criaria "Jânio", "Janio Multimarcas" e "janio
// multi" como se fossem três lojas, e o controle de vendas passaria a contar
// errado sem ninguém perceber.

export interface LojaDaLista {
  id: string;
  nome: string;
  /** Cidade/UF, pra separar duas lojas de nome parecido. */
  onde: string | null;
}

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

/**
 * A escolha da loja: digita pra achar, clica (ou aperta Enter) pra escolher.
 *
 * Não é um campo de texto que vira nome: enquanto nada for escolhido da lista,
 * não existe loja nenhuma no formulário. É o que impede a mesma loja de entrar
 * no sistema escrita de três jeitos diferentes.
 */
function SeletorDeLoja({
  lojas,
  escolhida,
  aoEscolher,
}: {
  lojas: LojaDaLista[];
  escolhida: LojaDaLista | null;
  aoEscolher: (l: LojaDaLista | null) => void;
}) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);

  const achadas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return lojas;
    // Procura no nome e na cidade: a equipe chama as lojas pelos dois.
    return lojas.filter(
      (l) => l.nome.toLowerCase().includes(t) || (l.onde ?? "").toLowerCase().includes(t)
    );
  }, [busca, lojas]);

  useEffect(() => setDestaque(0), [busca]);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  function escolher(l: LojaDaLista) {
    aoEscolher(l);
    setBusca("");
    setAberto(false);
  }

  if (escolhida) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2">
        <Store size={15} className="text-accent shrink-0" />
        <span className="text-sm font-medium min-w-0 truncate">{escolhida.nome}</span>
        {escolhida.onde && (
          <span className="text-xs text-foreground-muted truncate">{escolhida.onde}</span>
        )}
        <button
          type="button"
          onClick={() => aoEscolher(null)}
          className="ml-auto p-1 rounded-lg text-foreground-muted hover:bg-surface shrink-0"
          aria-label="Trocar de loja"
          title="Trocar de loja"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={caixa}>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 focus-within:ring-2 focus-within:ring-accent/40">
        <Search size={15} className="text-foreground-muted shrink-0" />
        <input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAberto(true);
              setDestaque((d) => Math.min(d + 1, achadas.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setDestaque((d) => Math.max(d - 1, 0));
            } else if (e.key === "Enter") {
              // Enter escolhe o que está em destaque — e nunca envia o
              // formulário por engano com a loja ainda em branco.
              e.preventDefault();
              const l = achadas[destaque];
              if (l) escolher(l);
            } else if (e.key === "Escape") {
              setAberto(false);
            }
          }}
          placeholder="Digite pra achar a loja..."
          aria-label="Procurar a loja"
          className="flex-1 bg-transparent text-sm outline-none min-w-0"
        />
      </div>

      {aberto && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-surface shadow-xl">
          {achadas.length === 0 ? (
            <p className="px-3 py-3 text-sm text-foreground-muted">
              {lojas.length === 0
                ? "Você ainda não tem loja nenhuma na sua carteira."
                : "Nenhuma loja com esse nome na sua lista."}
            </p>
          ) : (
            achadas.map((l, i) => (
              <button
                key={l.id}
                type="button"
                onMouseEnter={() => setDestaque(i)}
                onClick={() => escolher(l)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                  i === destaque ? "bg-surface-muted" : ""
                }`}
              >
                <Store size={14} className="text-foreground-muted shrink-0" />
                <span className="text-sm min-w-0 truncate">{l.nome}</span>
                {l.onde && (
                  <span className="text-xs text-foreground-muted ml-auto shrink-0">{l.onde}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
