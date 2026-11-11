"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Camera, AlertTriangle, Loader2 } from "lucide-react";
import {
  conferirCliente,
  desconferirCliente,
  type ConferirState,
} from "@/lib/actions/conferencia";
import { ESTILO_DO_SELO, ROTULO_DO_TOM, type TomDaVenda } from "@/lib/controle-vendas";

// Uma linha por cliente, baixa o bastante pra a carteira inteira caber na
// tela de uma vez. Era um cartão grande com o formulário dentro — pra ver o
// décimo cliente a pessoa rolava a página, e o que não se vê não se cobra.
//
// A caixinha é a lista de chamada do dia. Na segunda-feira ela vira câmera: é
// o dia da foto da campanha, e sem foto a conferência não fecha.

export interface ClienteDoDia {
  id: string;
  companyName: string;
  conferidoHoje: boolean;
  /** Quem marcou a caixinha hoje — primeiro nome. */
  conferidoPor: string | null;
  temFoto: boolean;
  diasSemVender: number;
  tomDaVenda: TomDaVenda;
  textoDaVenda: string;
}

export function LinhaDoCliente({
  cliente,
  diaDaFoto,
}: {
  cliente: ClienteDoDia;
  /** Hoje é segunda: a caixinha pede a foto da campanha. */
  diaDaFoto: boolean;
}) {
  const marcar = conferirCliente.bind(null, cliente.id);
  const [estado, enviar, enviando] = useActionState<ConferirState, FormData>(marcar, undefined);
  const [desmarcando, iniciarDesmarcar] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  const urgente = cliente.tomDaVenda === "critico";
  const ocupado = enviando || desmarcando;
  const erro = estado?.erro ?? erroLocal;

  function desmarcar() {
    setErroLocal(null);
    iniciarDesmarcar(() => void desconferirCliente(cliente.id));
  }

  return (
    <div
      className={`rounded-xl border bg-surface ${
        // A borda só grita quando é urgente. Se toda linha pendente gritasse,
        // a tela inteira ficaria vermelha e ninguém olharia pra nenhuma.
        urgente && !cliente.conferidoHoje ? "border-red-500/60" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        {cliente.conferidoHoje ? (
          <button
            type="button"
            onClick={desmarcar}
            disabled={ocupado}
            aria-pressed
            title={`Conferido hoje${cliente.conferidoPor ? ` por ${cliente.conferidoPor}` : ""} — clique pra desmarcar`}
            className="shrink-0 w-5 h-5 rounded-md border bg-emerald-500 border-emerald-500 text-white flex items-center justify-center disabled:opacity-50"
          >
            {ocupado ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />}
          </button>
        ) : (
          <form ref={form} action={enviar} className="shrink-0 flex items-center">
            {/* Na segunda a caixinha é um seletor de foto: escolheu, envia
                sozinho. Um passo só — pedir foto E depois pedir pra confirmar
                seria dois cliques pra uma coisa que se faz vinte vezes. */}
            {diaDaFoto ? (
              <>
                <input
                  type="file"
                  name="foto"
                  accept="image/*"
                  capture="environment"
                  id={`foto-${cliente.id}`}
                  className="sr-only"
                  onChange={(e) => {
                    setErroLocal(null);
                    if (e.target.files?.length) form.current?.requestSubmit();
                  }}
                />
                <label
                  htmlFor={`foto-${cliente.id}`}
                  title="Segunda-feira é o dia da foto: anexe a foto da campanha"
                  className={`w-5 h-5 rounded-md border flex items-center justify-center cursor-pointer transition-colors ${
                    ocupado
                      ? "opacity-50"
                      : "border-amber-500/70 text-amber-500 hover:bg-amber-500/10"
                  }`}
                >
                  {ocupado ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Camera size={12} />
                  )}
                </label>
              </>
            ) : (
              <button
                type="submit"
                disabled={ocupado}
                aria-pressed={false}
                title="Marcar que você olhou este cliente hoje"
                className="w-5 h-5 rounded-md border border-border hover:border-accent hover:bg-surface-muted flex items-center justify-center transition-colors disabled:opacity-50"
              >
                {ocupado && <Loader2 size={12} className="animate-spin" />}
              </button>
            )}
          </form>
        )}

        <Link
          href={`/gestao-contas/${cliente.id}`}
          className={`font-medium text-sm truncate hover:text-accent transition-colors min-w-0 flex-1 ${
            cliente.conferidoHoje ? "text-foreground-muted" : ""
          }`}
        >
          {cliente.companyName}
        </Link>

        {cliente.conferidoHoje && cliente.temFoto && (
          <Camera size={12} className="shrink-0 text-emerald-500" aria-label="foto da semana enviada" />
        )}

        {/* O mesmo selo e as mesmas cores do Controle de Vendas: quem já leu
            aquela tela não aprende outro código aqui. */}
        <span
          className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${ESTILO_DO_SELO[cliente.tomDaVenda]}`}
          title={`${ROTULO_DO_TOM[cliente.tomDaVenda]} — ${cliente.textoDaVenda}`}
        >
          {urgente && <AlertTriangle size={11} className="shrink-0" />}
          {cliente.diasSemVender}d
        </span>
      </div>

      {erro && <p className="px-3 pb-2 text-[11px] text-red-500">{erro}</p>}
    </div>
  );
}
