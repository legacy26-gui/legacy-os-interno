"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { History, X, MapPinCheck, StickyNote, Trash2, Loader2 } from "lucide-react";
import { anotarNaLoja, apagarVisitaDaLoja, lerHistoricoDaLoja, registrarVisitaComNota } from "@/lib/actions/visitas";
import type { ItemDoHistorico } from "@/lib/visitas-registro";

// O histórico da loja numa "bolha" por cima da tela (não abre aba nova): cada dia em que a loja foi visitada e o que foi
// falado, mais as anotações soltas. Dá pra registrar uma visita (de hoje ou de um dia passado) e anotar daqui mesmo.

const hojeISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

function diaExtenso(iso: string) {
  const t = new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function quandoNota(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function HistoricoDaLoja({ clientId, nomeDaLoja, rotulo = false }: { clientId: string; nomeDaLoja: string; rotulo?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<ItemDoHistorico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [data, setData] = useState(hojeISO());
  const [nota, setNota] = useState("");
  const [pendente, comecar] = useTransition();

  function carregar() {
    comecar(async () => {
      const r = await lerHistoricoDaLoja(clientId);
      if (r.ok) {
        setItens(r.itens ?? []);
        setErro(null);
      } else setErro(r.erro ?? "Não consegui abrir o histórico.");
    });
  }

  function abrir() {
    setAberto(true);
    setItens(null);
    setData(hojeISO());
    setNota("");
    carregar();
  }

  // Esc fecha; o fundo da página não rola enquanto a bolha está aberta.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("keydown", aoTeclar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [aberto]);

  function registrarVisita() {
    comecar(async () => {
      const r = await registrarVisitaComNota(clientId, data, nota);
      if (!r.ok) return setErro(r.erro ?? "Não consegui registrar.");
      setNota("");
      setErro(null);
      carregar();
    });
  }
  function soAnotar() {
    comecar(async () => {
      const r = await anotarNaLoja(clientId, nota);
      if (!r.ok) return setErro(r.erro ?? "Não consegui anotar.");
      setNota("");
      setErro(null);
      carregar();
    });
  }
  function apagar(id: string) {
    if (!confirm("Apagar esta visita do histórico?")) return;
    comecar(async () => {
      const r = await apagarVisitaDaLoja(clientId, id);
      if (!r.ok) return setErro(r.erro ?? "Não consegui apagar.");
      carregar();
    });
  }

  const visitas = (itens ?? []).filter((i) => i.tipo === "visita");

  const bolha = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Histórico de ${nomeDaLoja}`}>
      <button type="button" aria-label="Fechar" onClick={() => setAberto(false)} className="absolute inset-0 bg-black/60 backdrop-blur-[2px] cursor-default" />
      <div className="relative w-full max-w-xl max-h-[88vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
          <div className="min-w-0">
            <h2 className="font-semibold flex items-center gap-2 truncate">
              <History size={17} className="text-accent shrink-0" /> Histórico — {nomeDaLoja}
            </h2>
            <p className="text-xs text-foreground-muted mt-0.5">
              {itens === null ? "carregando…" : visitas.length === 0 ? "Nenhuma visita registrada ainda" : `${visitas.length} ${visitas.length === 1 ? "visita registrada" : "visitas registradas"}`}
            </p>
          </div>
          <button type="button" onClick={() => setAberto(false)} className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-muted shrink-0" title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border flex flex-col gap-2 bg-surface-muted/40">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-foreground-muted flex items-center gap-1.5">
              Dia
              <input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground" />
            </label>
          </div>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="O que foi falado / combinado (opcional na visita)…"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" disabled={pendente || nota.trim().length < 2} onClick={soAnotar} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-surface-muted disabled:opacity-50" title="Guarda só a anotação, sem marcar visita">
              <StickyNote size={13} /> Só anotar
            </button>
            <button type="button" disabled={pendente} onClick={registrarVisita} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 disabled:opacity-60">
              {pendente ? <Loader2 size={13} className="animate-spin" /> : <MapPinCheck size={13} />} Registrar visita
            </button>
          </div>
          {erro && <p className="text-xs text-red-500">{erro}</p>}
        </div>

        <div className="overflow-y-auto px-5 py-3 flex flex-col gap-2.5">
          {itens === null ? (
            <p className="text-sm text-foreground-muted py-6 text-center">Carregando…</p>
          ) : itens.length === 0 ? (
            <p className="text-sm text-foreground-muted py-6 text-center">Ainda não tem nada aqui. Registre a primeira visita acima.</p>
          ) : (
            itens.map((i) =>
              i.tipo === "visita" ? (
                <div key={`v${i.id}`} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3.5 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <MapPinCheck size={14} className="text-emerald-500 shrink-0" /> {diaExtenso(i.quando)}
                    </p>
                    <button type="button" onClick={() => apagar(i.id)} title="Apagar esta visita" className="p-1 rounded text-foreground-muted/60 hover:text-red-500 shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {i.quem && <p className="text-[11px] text-foreground-muted">visita de {i.quem}</p>}
                  {i.texto ? <p className="text-sm mt-1.5 whitespace-pre-line">{i.texto}</p> : <p className="text-xs text-foreground-muted mt-1">sem anotação</p>}
                </div>
              ) : (
                <div key={`n${i.id}`} className="rounded-xl border border-border bg-background px-3.5 py-2.5">
                  <p className="text-[11px] text-foreground-muted flex items-center gap-1.5">
                    <StickyNote size={12} /> Anotação · {quandoNota(i.quando)}
                    {i.quem ? ` · ${i.quem}` : ""}
                  </p>
                  <p className="text-sm mt-1 whitespace-pre-line">{i.texto}</p>
                </div>
              ),
            )
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        title="Histórico: dias em que visitei e o que foi falado"
        className={`inline-flex items-center gap-1 rounded-lg text-foreground-muted hover:bg-surface-muted hover:text-foreground shrink-0 ${rotulo ? "px-3 py-1.5 text-xs font-medium border border-border" : "p-1.5"}`}
      >
        <History size={14} />
        {rotulo && "Histórico"}
      </button>
      {/* Só existe depois do clique (no navegador), então o portal pode usar o document direto. */}
      {aberto ? createPortal(bolha, document.body) : null}
    </>
  );
}
