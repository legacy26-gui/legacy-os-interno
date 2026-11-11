"use client";

import { useEffect, useRef, useTransition } from "react";
import { BellOff, Bell, RefreshCw } from "lucide-react";
import {
  lembrarAmanha,
  voltarAVer,
  rodarAgora,
  marcarAlertasComoVistos,
} from "@/lib/actions/alertas";

// Os botões da central.
//
// "Lembrar amanhã" e não "dispensar": tirar da frente é diferente de dizer que
// está resolvido. O que está resolvido o sistema descobre sozinho.

/**
 * Abriu a tela, viu: tira o "novo" e cala o aviso de canto.
 *
 * Em componente de navegador porque marcar é uma escrita, e escrita não pode
 * acontecer enquanto a página está sendo desenhada. Dispara uma vez só: o
 * próprio marcar redesenha a tela, e sem a trava isso viraria laço.
 */
export function MarcarVistos({ temNovos }: { temNovos: boolean }) {
  const jaMarcou = useRef(false);

  useEffect(() => {
    if (!temNovos || jaMarcou.current) return;
    jaMarcou.current = true;
    void marcarAlertasComoVistos();
  }, [temNovos]);

  return null;
}

export function AcoesDoAlerta({
  chave,
  silenciado,
  critico,
  podeAdiar,
}: {
  chave: string;
  silenciado: boolean;
  critico: boolean;
  /** No nível máximo não se adia: é pra resolver hoje. */
  podeAdiar: boolean;
}) {
  const [salvando, iniciar] = useTransition();

  // Sem botão, e com a razão escrita: botão ausente sem explicação parece
  // defeito, e a pessoa fica procurando onde clicou errado.
  if (!podeAdiar && !silenciado) {
    return (
      <span className="text-[11px] font-semibold px-2 py-1 text-red-100 whitespace-nowrap">
        Resolver hoje
      </span>
    );
  }

  const estilo = critico
    ? "text-red-100 hover:bg-red-700/60"
    : "text-foreground-muted hover:bg-surface hover:text-foreground";

  return (
    <button
      type="button"
      disabled={salvando}
      onClick={() => iniciar(() => void (silenciado ? voltarAVer(chave) : lembrarAmanha(chave)))}
      title={silenciado ? "Voltar a mostrar" : "Lembrar amanhã — não marca como resolvido"}
      className={`text-xs px-2 py-1.5 rounded-lg inline-flex items-center gap-1 transition-colors disabled:opacity-50 ${estilo}`}
    >
      {silenciado ? <Bell size={12} /> : <BellOff size={12} />}
      <span className="hidden sm:inline">{silenciado ? "Voltar a ver" : "Lembrar amanhã"}</span>
    </button>
  );
}

/**
 * Dispara a conferência na hora, em vez de esperar a manhã seguinte.
 *
 * Não tem confirmação porque não destrói nada e não enche o celular de
 * ninguém: o robô só avisa o que ainda não avisou, então apertar dez vezes
 * seguidas manda a mesma coisa que apertar uma.
 */
export function RodarAgora() {
  const [rodando, iniciar] = useTransition();

  return (
    <button
      type="button"
      disabled={rodando}
      onClick={() => iniciar(() => void rodarAgora())}
      title="Confere tudo agora e manda os avisos que ainda não foram"
      className="text-xs px-3 py-2 rounded-lg border border-border bg-surface-muted hover:bg-border/60 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60 shrink-0"
    >
      <RefreshCw size={13} className={rodando ? "animate-spin" : ""} />
      {rodando ? "Conferindo..." : "Conferir agora"}
    </button>
  );
}
