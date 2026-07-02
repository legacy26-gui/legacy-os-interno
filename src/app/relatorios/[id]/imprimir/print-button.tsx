"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:opacity-90"
      type="button"
    >
      <Printer size={15} />
      Imprimir / Salvar como PDF
    </button>
  );
}
