"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Store } from "lucide-react";

// A escolha da loja: digita pra achar, clica (ou aperta Enter) pra escolher.
//
// Não é um campo de texto que vira nome. Enquanto nada for escolhido da
// lista, não existe loja nenhuma no formulário. É o que impede a mesma loja
// de entrar no sistema escrita de três jeitos diferentes — "Jânio", "Janio
// Multimarcas" e "janio multi" viravam três lojas, e as contas passavam a
// errar sem ninguém perceber.
//
// Vive em components/ e não dentro de uma tela porque é usado em mais de uma
// (Marcar Venda e Gravações): duas buscas de loja diferentes envelheceriam
// diferente, e a equipe teria que aprender duas.

export interface LojaDaLista {
  id: string;
  nome: string;
  /** Cidade/UF, pra separar duas lojas de nome parecido. */
  onde: string | null;
}

export function SeletorDeLoja({
  lojas,
  escolhida,
  aoEscolher,
  rotulo = "Procurar a loja",
  vazio = "Você ainda não tem loja nenhuma na sua carteira.",
}: {
  lojas: LojaDaLista[];
  escolhida: LojaDaLista | null;
  aoEscolher: (l: LojaDaLista | null) => void;
  rotulo?: string;
  vazio?: string;
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
          aria-label={rotulo}
          className="flex-1 bg-transparent text-sm outline-none min-w-0"
        />
      </div>

      {aberto && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-surface shadow-xl">
          {achadas.length === 0 ? (
            <p className="px-3 py-3 text-sm text-foreground-muted">
              {lojas.length === 0 ? vazio : "Nenhuma loja com esse nome na sua lista."}
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
