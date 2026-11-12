"use client";

import { useState } from "react";

// A chave de liga/desliga, igual à do Gerenciador.
//
// ── Por que ela existe antes de funcionar ─────────────────────────────────
//
// Porque metade do valor dela já é só MOSTRAR. Hoje, pra saber se uma
// campanha está pausada, alguém abre o Gerenciador. Com a chave na tela, isso
// se vê de relance.
//
// ── E por que ela não finge ───────────────────────────────────────────────
//
// Uma chave que parece clicável e não faz nada é pior que chave nenhuma:
// a pessoa clica, vê a animação, e vai embora achando que pausou uma campanha
// que continua gastando. Então, enquanto a escrita não estiver liberada, ela
// não se move — e dizer por quê é parte do trabalho dela.
//
// Quando o acesso de escrita chegar: tira o `travada`, liga no servidor.
// O desenho não muda.

export function ChaveDeStatus({
  ligado,
  nome,
  motivoDaTrava,
}: {
  ligado: boolean;
  nome: string;
  /** Null quando der pra mexer de verdade. */
  motivoDaTrava: string | null;
}) {
  const [avisando, setAvisando] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={`${nome} está ${ligado ? "ativo" : "pausado"}`}
        title={motivoDaTrava ?? undefined}
        onClick={() => {
          if (motivoDaTrava) {
            setAvisando(true);
            setTimeout(() => setAvisando(false), 3200);
          }
        }}
        className={`w-9 h-5 rounded-full transition-colors shrink-0 relative ${
          ligado ? "bg-accent" : "bg-surface-muted border border-border"
        } ${motivoDaTrava ? "cursor-help" : "cursor-pointer"}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
            ligado ? "left-[1.1rem] bg-white" : "left-0.5 bg-foreground-muted"
          }`}
        />
      </button>

      {avisando && motivoDaTrava && (
        <span className="absolute left-0 top-7 z-20 w-56 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground-muted shadow-lg">
          {motivoDaTrava}
        </span>
      )}
    </span>
  );
}
