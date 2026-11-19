"use client";

import { useState, useTransition } from "react";
import { Check, X, Send, AlertTriangle } from "lucide-react";
import {
  aprovarRelatorio,
  recusarRelatorio,
  type AprovacaoState,
} from "@/lib/actions/aprovar-relatorio";

// Os dois botões de cada relatório que espera.
//
// ── Por que recusar pede um motivo e aprovar não ─────────────────────────
//
// Porque aprovar é o caminho esperado: o relatório existe pra ir. Pedir
// justificativa pra ele seria atrito em cima do caminho certo.
//
// Recusar é o caminho que deixa um cliente sem relatório na semana. Daqui a
// dois meses alguém vai perguntar "por que a loja X não recebeu naquela
// semana?", e a resposta precisa estar gravada em algum lugar que não seja a
// memória de quem clicou.

export function DecidirRelatorio({
  id,
  loja,
}: {
  id: string;
  loja: string;
}) {
  const [estado, setEstado] = useState<AprovacaoState>({});
  const [recusando, setRecusando] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [pendente, comecar] = useTransition();

  // Depois de decidido, a linha some da lista na próxima pintura. Até lá, a
  // confirmação fica na tela: some sem aviso seria indistinguível de "o
  // clique não funcionou".
  if (estado.ok) {
    return (
      <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
        <Check size={15} className="shrink-0" />
        {estado.ok}
      </p>
    );
  }

  if (recusando) {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-xs text-foreground-muted" htmlFor={`obs-${id}`}>
          Por que a {loja} não recebe esta semana?
        </label>
        <textarea
          id={`obs-${id}`}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          placeholder="Ex.: campanha nova começou quinta, a semana não representa."
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            disabled={pendente}
            onClick={() =>
              comecar(async () => setEstado(await recusarRelatorio(id, observacao)))
            }
            className="min-h-10 px-4 rounded-lg bg-red-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {pendente ? "Guardando…" : "Confirmar a recusa"}
          </button>
          <button
            type="button"
            onClick={() => setRecusando(false)}
            className="min-h-10 px-4 rounded-lg border border-border text-sm text-foreground-muted hover:text-foreground"
          >
            Voltar
          </button>
        </div>
        {estado.erro && (
          <p className="text-xs text-red-500 flex items-start gap-1.5">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            {estado.erro}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            comecar(async () => setEstado(await aprovarRelatorio(id)))
          }
          className="min-h-10 px-4 rounded-lg bg-accent text-white text-sm font-medium
            hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Send size={14} />
          {pendente ? "Mandando…" : "Aprovar e mandar no grupo"}
        </button>
        <button
          type="button"
          disabled={pendente}
          onClick={() => setRecusando(true)}
          className="min-h-10 px-4 rounded-lg border border-border text-sm
            text-foreground-muted hover:text-foreground disabled:opacity-50
            inline-flex items-center gap-1.5"
        >
          <X size={14} /> Não mandar
        </button>
      </div>
      {estado.erro && (
        <p className="text-xs text-red-500 flex items-start gap-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          {estado.erro}
        </p>
      )}
    </div>
  );
}
