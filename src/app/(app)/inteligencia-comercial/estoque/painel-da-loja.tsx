"use client";

import { useState, useTransition } from "react";
import { Check, AlertTriangle, RefreshCw, Link2, Unplug } from "lucide-react";
import { conectarSiteDaLoja, desligarSiteDaLoja, lerEstoqueAgora } from "@/lib/actions/estoque";

// Os controles de uma loja: ligar o site, ler agora, desligar.

export function ControlesDaLoja({
  clientId,
  siteUrl,
  podeLigar,
}: {
  clientId: string;
  siteUrl: string | null;
  podeLigar: boolean;
}) {
  const [endereco, setEndereco] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; erro?: string }>({});
  const [pendente, comecar] = useTransition();

  const rodar = (f: () => Promise<{ ok?: string; erro?: string }>) => {
    setMsg({});
    comecar(async () => setMsg(await f()));
  };

  return (
    <div className="flex flex-col gap-3">
      {siteUrl ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pendente}
            onClick={() => rodar(() => lerEstoqueAgora(clientId))}
            className="inline-flex items-center gap-2 px-4 min-h-11 rounded-lg border border-border bg-surface-muted text-sm font-medium hover:bg-border/60 disabled:opacity-50"
          >
            <RefreshCw size={14} className={pendente ? "animate-spin" : ""} />
            {pendente ? "Lendo o site…" : "Ler agora"}
          </button>
          {podeLigar && (
            <button
              type="button"
              disabled={pendente}
              onClick={() => rodar(() => desligarSiteDaLoja(clientId))}
              className="inline-flex items-center gap-2 px-3 min-h-11 rounded-lg text-sm text-foreground-muted hover:text-foreground disabled:opacity-50"
            >
              <Unplug size={14} /> Desligar leitura
            </button>
          )}
        </div>
      ) : podeLigar ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            rodar(() => conectarSiteDaLoja(clientId, endereco));
          }}
        >
          <label className="flex flex-col gap-1 flex-1 min-w-[16rem]">
            <span className="text-xs text-foreground-muted">Endereço do site da loja</span>
            <input
              id={`site-${clientId}`}
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="https://r2multimarcas.com.br"
              inputMode="url"
              className="rounded-lg border border-border bg-surface px-3 min-h-11 text-sm outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
          <button
            type="submit"
            disabled={pendente || !endereco.trim()}
            className="inline-flex items-center gap-2 px-4 min-h-11 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50"
          >
            <Link2 size={14} /> {pendente ? "Conferindo…" : "Ligar site"}
          </button>
        </form>
      ) : (
        <p className="text-sm text-foreground-muted">Site ainda não ligado. O administrador liga por aqui.</p>
      )}
      {msg.ok && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-start gap-1.5">
          <Check size={15} className="shrink-0 mt-0.5" /> {msg.ok}
        </p>
      )}
      {msg.erro && (
        <p className="text-sm text-red-500 flex items-start gap-1.5">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {msg.erro}
        </p>
      )}
    </div>
  );
}
