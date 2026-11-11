"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Loader2, Paintbrush, Phone, Users, X } from "lucide-react";
import {
  marcarArteRenovada,
  definirDataDaArte,
  registrarContato,
  registrarReuniao,
  type ResgateState,
} from "@/lib/actions/resgate";

// Os botões do Resolver. Cada um registra uma coisa só e diz o que aconteceu.

export function ArteRenovada({ clientId, dataForm }: { clientId: string; dataForm: string }) {
  const [editando, setEditando] = useState(false);
  const [salvando, iniciar] = useTransition();

  if (editando) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          defaultValue={dataForm}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => {
            const v = e.target.value;
            iniciar(() => void definirDataDaArte(clientId, v));
            setEditando(false);
          }}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-muted"
          title="Cancelar"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={salvando}
        onClick={() => iniciar(() => void marcarArteRenovada(clientId))}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-50"
      >
        {salvando ? <Loader2 size={13} className="animate-spin" /> : <Paintbrush size={13} />}
        Renovei a arte hoje
      </button>
      <button
        type="button"
        onClick={() => setEditando(true)}
        title="Foi outro dia"
        className="text-xs text-foreground-muted underline hover:text-foreground px-1"
      >
        outro dia
      </button>
    </div>
  );
}

/**
 * O passo do comercial.
 *
 * "Marcar reunião" e "avisar o Guilherme" são um botão só de propósito: é um
 * movimento só na cabeça de quem faz, e separar garantiria que um dia alguém
 * faz o primeiro e esquece o segundo.
 */
export function PassoComercial({
  clientId,
  passo,
}: {
  clientId: string;
  passo: "tranquilo" | "contato" | "reuniao";
}) {
  const ehReuniao = passo === "reuniao";
  const acao = ehReuniao ? registrarReuniao : registrarContato;
  const [estado, enviar, enviando] = useActionState<ResgateState, FormData>(
    acao.bind(null, clientId),
    undefined
  );
  const [aberto, setAberto] = useState(false);

  if (passo === "tranquilo" && !aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-xs text-foreground-muted underline hover:text-foreground"
      >
        Registrar um contato mesmo assim
      </button>
    );
  }

  if (estado?.ok) {
    return (
      <p className="text-sm text-emerald-500 flex items-center gap-1.5">
        <Check size={14} className="shrink-0" /> {estado.ok}
      </p>
    );
  }

  return (
    <form action={enviar} className="flex flex-col sm:flex-row gap-2 sm:items-center">
      <input
        name="observacao"
        placeholder={ehReuniao ? "O que ficou decidido (opcional)" : "O que o dono falou (opcional)"}
        className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
      />
      <button
        type="submit"
        disabled={enviando}
        className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
          ehReuniao
            ? "bg-red-600 text-white hover:bg-red-700"
            : "bg-accent text-white hover:bg-accent/90"
        }`}
      >
        {enviando ? (
          <Loader2 size={14} className="animate-spin" />
        ) : ehReuniao ? (
          <Users size={14} />
        ) : (
          <Phone size={14} />
        )}
        {ehReuniao ? "Marquei a reunião e avisar o Guilherme" : "Registrar o contato"}
      </button>
      {estado?.erro && <p className="text-xs text-red-500">{estado.erro}</p>}
    </form>
  );
}
