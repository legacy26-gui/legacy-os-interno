"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

// A rede de proteção da seção Meta Ads.
//
// Sem isto, qualquer erro aqui dentro vira a tela preta do Next — "This page
// couldn't load", um código e nada mais. Esse código (o digest) só se lê no
// painel da Vercel, o que na prática quer dizer que ninguém lê.
//
// Aqui pelo menos a pessoa sabe em que tela estava, que o resto do sistema
// continua de pé, e tem o código à mão pra me passar.

export default function ErroNoMetaAds({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-2xl rounded-2xl border border-red-500/50 bg-red-500/5 p-6 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
        <div>
          <h1 className="font-semibold">A tela do Meta Ads não carregou</h1>
          <p className="text-sm text-foreground-muted mt-1">
            O resto do sistema continua funcionando normalmente — é só esta tela.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-muted"
        >
          <RefreshCw size={14} /> Tentar de novo
        </button>
      </div>

      {/* O Next apaga a mensagem do erro em produção e deixa só este código.
          Mostrar ele aqui é o que permite alguém dizer QUAL erro foi. */}
      {error.digest && (
        <p className="text-xs text-foreground-muted font-mono border-t border-border pt-3">
          código do erro: {error.digest}
        </p>
      )}
    </div>
  );
}
