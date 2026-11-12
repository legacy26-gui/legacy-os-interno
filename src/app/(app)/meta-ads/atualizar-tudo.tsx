"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { atualizarCarteira, type MetaAdsState } from "@/lib/actions/meta-ads";

/**
 * Busca saldo e números de todas as contas que a pessoa enxerga.
 *
 * O botão fica desabilitado enquanto roda, e o texto muda: são duas chamadas
 * de rede por conta, em sequência, e pode levar alguns segundos. Botão que não
 * dá sinal de vida é botão que a pessoa aperta três vezes.
 */
export function BotaoAtualizarTudo() {
  const [estado, setEstado] = useState<MetaAdsState>({});
  const [pendente, comecar] = useTransition();

  return (
    <div className="flex flex-col items-start sm:items-end gap-1.5">
      <button
        type="button"
        onClick={() => comecar(async () => setEstado(await atualizarCarteira()))}
        disabled={pendente}
        className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-muted disabled:opacity-60"
      >
        <RefreshCw size={15} className={pendente ? "animate-spin" : ""} />
        {pendente ? "Buscando na Meta…" : "Atualizar tudo"}
      </button>
      {estado.erro && <p className="text-xs text-red-500 max-w-xs sm:text-right">{estado.erro}</p>}
      {estado.ok && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 max-w-xs sm:text-right">
          {estado.ok}
        </p>
      )}
    </div>
  );
}
