"use client";

import { useState, useTransition } from "react";
import { Wallet, Check, AlertTriangle, RefreshCw } from "lucide-react";
import { buscarGruposDaZapi, definirGrupoFinanceiro } from "@/lib/actions/whatsapp";
import type { GrupoNaTela } from "@/lib/whatsapp/ligacao";

// O grupo onde o Guilherme anota cada gasto ("financeiro (gastos)").
//
// Só aparecem grupos que não são de loja nem internos: gasto pessoal não pode
// cair onde cliente ou equipe leem. O servidor confere de novo.

export function GrupoFinanceiro({
  grupos,
  jaFinanceiros,
  internos,
}: {
  grupos: GrupoNaTela[] | null;
  jaFinanceiros: string[];
  internos: string[];
}) {
  const [ligados, setLigados] = useState<string[]>(jaFinanceiros);
  const [msg, setMsg] = useState<{ ok?: string; erro?: string }>({});
  const [pendente, comecar] = useTransition();
  const [meus, setMeus] = useState<GrupoNaTela[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  const lista = grupos ?? meus;
  const candidatos = (lista ?? []).filter((g) => !g.lojaId && !internos.includes(g.id));

  function buscar() {
    setMsg({});
    setBuscando(true);
    comecar(async () => {
      const r = await buscarGruposDaZapi();
      setBuscando(false);
      if (r.ok) setMeus(r.grupos);
      else setMsg({ erro: r.erro });
    });
  }

  function alternar(g: GrupoNaTela, ligar: boolean) {
    setMsg({});
    comecar(async () => {
      const r = await definirGrupoFinanceiro(g.id, g.nome, ligar);
      setMsg(r.erro ? { erro: r.erro } : { ok: r.ok });
      if (!r.erro) setLigados((a) => (ligar ? [...a, g.id] : a.filter((x) => x !== g.id)));
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold flex items-center gap-2">
          <Wallet size={16} /> Grupo financeiro (seus gastos)
        </h2>
        <p className="text-sm text-foreground-muted mt-0.5">
          Você anota cada gasto nesse grupo — &quot;almoço 45&quot;, &quot;gasolina 200 pessoal&quot; — e o robô lança no
          financeiro. Só as mensagens do seu número viram lançamento, e o que for pessoal só você vê.
        </p>
      </div>

      {lista === null ? (
        <button
          type="button"
          onClick={buscar}
          disabled={pendente}
          className="inline-flex items-center gap-2 px-4 min-h-11 rounded-lg border border-border
            bg-surface-muted text-sm font-medium hover:bg-border/60 disabled:opacity-50 w-fit"
        >
          <RefreshCw size={14} className={buscando ? "animate-spin" : ""} />
          {buscando ? "Buscando…" : "Buscar os grupos do número"}
        </button>
      ) : candidatos.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          Nenhum grupo livre. Crie um grupo só seu com o número do robô (por exemplo &quot;financeiro (gastos)&quot;) e
          busque de novo.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {candidatos.map((g) => {
            const ligado = ligados.includes(g.id);
            return (
              <label key={g.id} className="py-2.5 flex items-center gap-3 cursor-pointer min-h-11">
                <input
                  type="checkbox"
                  checked={ligado}
                  disabled={pendente}
                  onChange={(e) => alternar(g, e.target.checked)}
                  className="accent-current"
                />
                <span className="text-sm flex-1">{g.nome}</span>
                {ligado && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    lança seus gastos
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}

      {msg.ok && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-start gap-1.5">
          <Check size={15} className="shrink-0 mt-0.5" />
          {msg.ok}
        </p>
      )}
      {msg.erro && (
        <p className="text-sm text-red-500 flex items-start gap-1.5">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          {msg.erro}
        </p>
      )}
    </section>
  );
}
