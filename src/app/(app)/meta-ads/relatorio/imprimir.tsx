"use client";

import { Printer } from "lucide-react";

/**
 * Imprimir — que no navegador também é "salvar em PDF".
 *
 * Sem gerar arquivo no servidor: o navegador já faz isso, com a fonte certa e
 * o tamanho de papel que a pessoa escolher. Gerar PDF aqui dentro seria uma
 * biblioteca a mais pra manter e um desenho a mais pra divergir do que a tela
 * mostra.
 */
export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-muted"
    >
      <Printer size={15} /> Imprimir ou salvar em PDF
    </button>
  );
}
