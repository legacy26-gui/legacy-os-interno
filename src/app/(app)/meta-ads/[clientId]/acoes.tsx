"use client";

import { useState, useTransition } from "react";
import { RefreshCw, SlidersHorizontal } from "lucide-react";
import {
  atualizarCampanhasAgora,
  atualizarSaldoAgora,
  definirTipoDeLead,
  type MetaAdsState,
} from "@/lib/actions/meta-ads";
import { TIPOS_DE_LEAD } from "@/lib/meta/insights";

interface ContaConfig {
  id: string;
  metaAccountId: string;
  leadActionType: string;
}

/**
 * Os botões da tela da loja.
 *
 * Saldo e números em botões separados aqui (e juntos na lista) de propósito:
 * na tela da loja a pessoa já sabe o que veio ver, e buscar as duas coisas
 * toda vez seria chamada de rede à toa.
 */
export function AcoesDaLoja({
  clientId,
  contas,
  podeConfigurar,
}: {
  clientId: string;
  contas: ContaConfig[];
  podeConfigurar: boolean;
}) {
  const [estado, setEstado] = useState<MetaAdsState>({});
  const [pendente, comecar] = useTransition();
  const [abrirConfig, setAbrirConfig] = useState(false);

  return (
    <div className="flex flex-col items-start sm:items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pendente}
          onClick={() => comecar(async () => setEstado(await atualizarCampanhasAgora(clientId)))}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-muted disabled:opacity-60"
        >
          <RefreshCw size={14} className={pendente ? "animate-spin" : ""} />
          Atualizar números
        </button>
        <button
          type="button"
          disabled={pendente}
          onClick={() => comecar(async () => setEstado(await atualizarSaldoAgora(clientId)))}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-surface border border-border rounded-lg text-sm hover:bg-surface-muted disabled:opacity-60"
        >
          Atualizar saldo
        </button>
        {podeConfigurar && contas.length > 0 && (
          <button
            type="button"
            onClick={() => setAbrirConfig((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-border rounded-lg text-sm text-foreground-muted hover:text-foreground hover:bg-surface-muted"
          >
            <SlidersHorizontal size={14} /> O que é lead
          </button>
        )}
      </div>

      {estado.erro && <p className="text-xs text-red-500 max-w-md sm:text-right">{estado.erro}</p>}
      {estado.ok && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 max-w-md sm:text-right">
          {estado.ok}
        </p>
      )}

      {abrirConfig && podeConfigurar && (
        <div className="w-full sm:w-96 rounded-xl border border-border bg-surface p-4 flex flex-col gap-3">
          <p className="text-xs text-foreground-muted">
            Qual ação da Meta conta como lead nesta loja. Trocar aqui não reescreve o que já está
            gravado — aperte “Atualizar números” depois pra recontar os 30 dias.
          </p>
          {contas.map((c) => (
            <label key={c.id} className="flex flex-col gap-1.5">
              <span className="text-xs font-mono text-foreground-muted">{c.metaAccountId}</span>
              <select
                defaultValue={c.leadActionType}
                disabled={pendente}
                onChange={(e) =>
                  comecar(async () =>
                    setEstado(await definirTipoDeLead(clientId, c.id, e.target.value))
                  )
                }
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
              >
                {TIPOS_DE_LEAD.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
