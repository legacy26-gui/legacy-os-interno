"use client";

import { useState, useTransition } from "react";
import { MapPinCheck, Pencil, Check, X } from "lucide-react";
import { marcarVisitaHoje, definirDataDaVisita } from "@/lib/actions/visitas";
import { estadoDaVisita, COR_DA_VISITA } from "@/lib/visitas";

// Última visita na loja: quando foi, e o botão que marca hoje.
//
// Um clique e pronto — é pra ser apertado na calçada, saindo da loja. A data
// na mão fica atrás do lápis, pro caso de lembrar depois que foi terça.

export function VisitaCliente({
  clientId,
  ultimaVisitaEm,
  dataForm,
  dataLabel,
  compacto = false,
}: {
  clientId: string;
  /** ISO da última visita, ou null. É o que manda no "há X dias". */
  ultimaVisitaEm: string | null;
  /** aaaa-mm-dd pro campo de data, formatado no servidor. */
  dataForm: string;
  /** dd/mm/aaaa pra mostrar. */
  dataLabel: string;
  /** Na tabela de clientes o espaço é curto; na ficha dá pra respirar. */
  compacto?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [salvando, iniciar] = useTransition();

  const estado = estadoDaVisita(ultimaVisitaEm);
  const cor = COR_DA_VISITA[estado.tom];

  function marcarHoje() {
    iniciar(() => void marcarVisitaHoje(clientId));
  }

  function salvarData(valor: string) {
    setEditando(false);
    iniciar(() => void definirDataDaVisita(clientId, valor));
  }

  if (editando) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="date"
          defaultValue={dataForm}
          max={new Date().toISOString().slice(0, 10)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") salvarData((e.target as HTMLInputElement).value);
            if (e.key === "Escape") setEditando(false);
          }}
          id={`visita-${clientId}`}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-accent/40"
          aria-label="Data da última visita"
        />
        <button
          type="button"
          title="Salvar data"
          onClick={() => {
            const el = document.getElementById(`visita-${clientId}`) as HTMLInputElement | null;
            salvarData(el?.value ?? "");
          }}
          className="p-1 rounded-lg text-emerald-500 hover:bg-emerald-500/10"
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          title="Cancelar"
          onClick={() => setEditando(false)}
          className="p-1 rounded-lg text-foreground-muted hover:bg-surface-muted"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 ${salvando ? "opacity-60" : ""}`}>
      <div className="min-w-0">
        <p className={`text-xs font-medium whitespace-nowrap ${cor}`}>{estado.texto}</p>
        {estado.dias !== null && !compacto && (
          <p className="text-[11px] text-foreground-muted whitespace-nowrap">{dataLabel}</p>
        )}
        {estado.dias !== null && compacto && estado.dias > 1 && (
          <p className="text-[11px] text-foreground-muted whitespace-nowrap">{dataLabel}</p>
        )}
      </div>

      <button
        type="button"
        onClick={marcarHoje}
        disabled={salvando || estado.dias === 0}
        title={estado.dias === 0 ? "Visita de hoje já registrada" : "Marcar que visitei hoje"}
        className={`inline-flex items-center gap-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
          compacto ? "px-2 py-1" : "px-3 py-1.5"
        } ${
          estado.dias === 0
            ? "text-emerald-500 bg-emerald-500/10 cursor-default"
            : "border border-border bg-surface-muted hover:bg-border/60"
        } disabled:opacity-60`}
      >
        <MapPinCheck size={13} className="shrink-0" />
        {estado.dias === 0 ? "Visitado" : compacto ? "Visitei" : "Visitei hoje"}
      </button>

      <button
        type="button"
        onClick={() => setEditando(true)}
        disabled={salvando}
        title="Escrever outra data"
        className="p-1 rounded-lg text-foreground-muted hover:bg-surface-muted shrink-0"
      >
        <Pencil size={12} />
      </button>
    </div>
  );
}
