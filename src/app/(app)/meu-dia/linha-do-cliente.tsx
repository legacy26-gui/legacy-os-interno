"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  Camera,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import {
  conferirCliente,
  desconferirCliente,
  type ConferirState,
} from "@/lib/actions/conferencia";
import { ESTILO_DO_SELO, ROTULO_DO_TOM, type TomDaVenda } from "@/lib/controle-vendas";
import { DailyReviewForm } from "../gestao-contas/[id]/daily-review-form";

// Uma linha por cliente, baixa o bastante pra a carteira inteira caber na
// tela de uma vez.
//
// A caixinha é a lista de chamada do dia, e é grande de propósito: um
// quadradinho de 20px numa lista de dez linhas não parece botão, e o que não
// parece botão ninguém aperta.
//
// A setinha abre o resto da revisão ali mesmo. Antes era preciso entrar no
// cliente — e cada ida e volta é um motivo pra deixar pra depois.

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
  /**
   * Se esta conta entra no Controle de Vendas.
   *
   * Consórcio e banco não vendem carro: marcar "há 32 dias sem vender" neles
   * é cobrar uma coisa que não existe, e cobrança que não faz sentido ensina
   * a equipe a ignorar o resto.
   */
  controlaVendas: boolean;
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
  const [aberto, setAberto] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  const urgente = cliente.controlaVendas && cliente.tomDaVenda === "critico";
  const ocupado = enviando || desmarcando;
  const erro = estado?.erro ?? erroLocal;

  function desmarcar() {
    setErroLocal(null);
    iniciarDesmarcar(() => void desconferirCliente(cliente.id));
  }

  // Tamanho do alvo de toque. Grande, e com borda forte quando falta marcar:
  // é o botão mais apertado do sistema, vinte vezes por dia.
  const caixa = "w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0";

  return (
    <div
      className={`rounded-xl border bg-surface ${
        urgente && !cliente.conferidoHoje ? "border-red-500/60" : "border-border"
      }`}
    >
      <div className="flex items-center gap-3 px-2.5 py-2">
        {cliente.conferidoHoje ? (
          <button
            type="button"
            onClick={desmarcar}
            disabled={ocupado}
            aria-pressed
            title={`Conferido hoje${cliente.conferidoPor ? ` por ${cliente.conferidoPor}` : ""} — clique pra desmarcar`}
            className={`${caixa} bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50`}
          >
            {ocupado ? <Loader2 size={16} className="animate-spin" /> : <Check size={18} />}
          </button>
        ) : (
          <form ref={form} action={enviar} className="shrink-0 flex items-center">
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
                  className={`${caixa} cursor-pointer border-2 ${
                    ocupado
                      ? "opacity-50 border-border"
                      : "border-amber-500 text-amber-500 hover:bg-amber-500/15"
                  }`}
                >
                  {ocupado ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                </label>
              </>
            ) : (
              <button
                type="submit"
                disabled={ocupado}
                aria-pressed={false}
                title="Marcar que você olhou este cliente hoje"
                className={`${caixa} border-2 border-foreground-muted/50 text-transparent hover:border-accent hover:bg-accent/10 hover:text-accent/40 disabled:opacity-50`}
              >
                {ocupado ? (
                  <Loader2 size={16} className="animate-spin text-foreground-muted" />
                ) : (
                  <Check size={18} />
                )}
              </button>
            )}
          </form>
        )}

        <div className="min-w-0 flex-1">
          <p
            className={`font-medium text-sm truncate ${
              cliente.conferidoHoje ? "text-foreground-muted" : ""
            }`}
          >
            {cliente.companyName}
          </p>
        </div>

        {cliente.conferidoHoje && cliente.temFoto && (
          <Camera size={13} className="shrink-0 text-emerald-500" aria-label="foto da semana enviada" />
        )}

        {/* O mesmo selo e as mesmas cores do Controle de Vendas. Conta fora do
            controle não ganha selo de dias: não vende carro, e cobrar isso
            dela ensina a equipe a ignorar o selo nas que vendem. */}
        {cliente.controlaVendas ? (
          <span
            className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${ESTILO_DO_SELO[cliente.tomDaVenda]}`}
            title={`${ROTULO_DO_TOM[cliente.tomDaVenda]} — ${cliente.textoDaVenda}`}
          >
            {urgente && <AlertTriangle size={11} className="shrink-0" />}
            {cliente.diasSemVender}d
          </span>
        ) : (
          <span
            className="shrink-0 text-[11px] text-foreground-muted"
            title="Fora do Controle de Vendas — não é loja de carro"
          >
            sem venda a cobrar
          </span>
        )}

        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          title={aberto ? "Fechar" : "Abrir o resto da revisão aqui mesmo"}
          className="shrink-0 w-8 h-8 rounded-lg text-foreground-muted hover:bg-surface-muted hover:text-foreground flex items-center justify-center transition-colors"
        >
          {aberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {erro && <p className="px-3 pb-2 text-[11px] text-red-500">{erro}</p>}

      {aberto && (
        <div className="px-3 pb-3 pt-1 border-t border-border">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[11px] text-foreground-muted">
              A revisão completa, sem sair daqui. A caixinha ao lado do nome é outra coisa: só diz
              que você olhou o cliente hoje.
            </p>
            <Link
              href={`/gestao-contas/${cliente.id}`}
              className="shrink-0 text-[11px] text-foreground-muted hover:text-foreground inline-flex items-center gap-1"
            >
              Abrir a conta <ExternalLink size={11} />
            </Link>
          </div>
          <DailyReviewForm clientId={cliente.id} />
        </div>
      )}
    </div>
  );
}
