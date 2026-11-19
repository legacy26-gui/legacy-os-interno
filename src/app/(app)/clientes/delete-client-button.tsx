"use client";

import { useState, useTransition } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import type { ExclusaoDeCliente } from "@/lib/actions/clients";

// O botão de excluir cliente.
//
// ── Por que não é mais um window.confirm ─────────────────────────────────
//
// Porque o aviso do navegador dizia sempre a mesma frase — "essa ação não
// pode ser desfeita" — sem saber o que ia ser desfeito. E o que vai embora
// junto com um cliente é muito mais que a ficha dele: as vendas registradas,
// as receitas, os contratos e o histórico de anúncios. Isso muda número de
// mês já fechado.
//
// Agora quem confirma lê o tamanho do estrago, contado no servidor, com os
// números daquele cliente. "Apagar leva junto 14 vendas e 9 receitas" é uma
// frase que faz a pessoa parar; "não pode ser desfeita" é uma que ela já
// aprendeu a clicar sem ler.
//
// ── Por que a confirmação vem do servidor ────────────────────────────────
//
// Porque só ele sabe contar. E porque a mesma função que conta é a que
// apaga: não existe a chance de a tela avisar sobre um estrago e o servidor
// fazer outro.

export function DeleteClientButton({
  action,
  companyName,
  compact = false,
}: {
  /** A ação já presa ao cliente. Recebe `confirmado`. */
  action: (confirmado?: boolean) => Promise<ExclusaoDeCliente>;
  companyName: string;
  compact?: boolean;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();

  function perguntar() {
    setErro(null);
    comecar(async () => {
      const r = await action(false);
      if (r?.erro) setErro(r.erro);
      else if (r?.precisaConfirmar) setAviso(r.precisaConfirmar);
    });
  }

  function apagar() {
    setErro(null);
    comecar(async () => {
      // Deu certo? A ação redireciona pra lista e isto nem volta.
      const r = await action(true);
      if (r?.erro) {
        setErro(r.erro);
        setAviso(null);
      }
    });
  }

  if (aviso) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-3 flex flex-col gap-2.5 max-w-md">
        <p className="text-xs text-red-500 flex items-start gap-1.5">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          {aviso}
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            disabled={pendente}
            onClick={apagar}
            className="min-h-10 px-3.5 rounded-lg bg-red-600 text-white text-xs font-medium
              hover:opacity-90 disabled:opacity-50"
          >
            {pendente ? "Apagando…" : "Apagar mesmo assim"}
          </button>
          <button
            type="button"
            onClick={() => setAviso(null)}
            className="min-h-10 px-3.5 rounded-lg border border-border text-xs
              text-foreground-muted hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={perguntar}
        disabled={pendente}
        title={`Excluir ${companyName}`}
        className={
          compact
            ? "p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 disabled:opacity-50"
            : "inline-flex items-center gap-1.5 px-3.5 py-2 border border-red-500/30 text-red-500 bg-red-500/5 rounded-lg text-sm hover:bg-red-500/10 disabled:opacity-50"
        }
      >
        <Trash2 size={14} />
        {!compact && (pendente ? "Conferindo…" : "Excluir")}
      </button>
      {erro && <span className="text-[11px] text-red-500">{erro}</span>}
    </div>
  );
}
