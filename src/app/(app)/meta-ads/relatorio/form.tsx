"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileBarChart } from "lucide-react";
import { ATALHOS, ROTULO_DO_ATALHO } from "@/lib/meta/insights";


// O formulário do relatório: loja, período, detalhe.
//
// Um botão só no fim, e não "gera sozinho a cada mudança": relatório é coisa
// que se manda pro cliente, e quem está montando precisa poder mexer em três
// campos antes de ver o resultado — sem a tela piscando a cada clique.

interface Loja {
  id: string;
  nome: string;
  gestor: string | null;
  temConta: boolean;
}

export function FormDoRelatorio({
  lojas,
  mostrarGestor,
  lojaAtual,
  periodoAtual,
  deAtual,
  ateAtual,
}: {
  lojas: Loja[];
  /** Gestor só serve pra quem vê a casa toda; o gestor já só tem as dele. */
  mostrarGestor: boolean;
  lojaAtual: string;
  periodoAtual: string;
  deAtual: string;
  ateAtual: string;
}) {
  const router = useRouter();
  const [gestor, setGestor] = useState("");
  const [loja, setLoja] = useState(lojaAtual);
  // 7 dias por padrão: o relatório vai pro cliente uma vez por semana.
  const [periodo, setPeriodo] = useState(periodoAtual || (deAtual ? "" : "7"));
  const [de, setDe] = useState(deAtual);
  const [ate, setAte] = useState(ateAtual);

  const gestores = [...new Set(lojas.map((l) => l.gestor).filter(Boolean))].sort() as string[];
  const visiveis = gestor ? lojas.filter((l) => l.gestor === gestor) : lojas;

  function gerar(e: React.FormEvent) {
    e.preventDefault();
    if (!loja) return;
    const q = new URLSearchParams({ loja });
    if (periodo) q.set("periodo", periodo);
    else if (de && ate) {
      q.set("de", de);
      q.set("ate", ate);
    }
    router.push(`/meta-ads/relatorio?${q}`);
  }

  return (
    <form
      onSubmit={gerar}
      className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4"
    >
      <div className="grid sm:grid-cols-2 gap-4">
        {mostrarGestor && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-foreground-muted">Gestor</span>
            <select
              value={gestor}
              onChange={(e) => {
                setGestor(e.target.value);
                setLoja("");
              }}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            >
              <option value="">Todos</option>
              {gestores.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-foreground-muted">Loja</span>
          <select
            required
            value={loja}
            onChange={(e) => setLoja(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
          >
            <option value="">— escolha a loja —</option>
            {visiveis.map((l) => (
              <option key={l.id} value={l.id} disabled={!l.temConta}>
                {l.nome}
                {!l.temConta && " (sem conta vinculada)"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-foreground-muted">Período</span>
        <div className="flex flex-wrap items-center gap-2">
          {ATALHOS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setPeriodo(a);
                setDe("");
                setAte("");
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                periodo === a
                  ? "bg-accent text-white border-accent"
                  : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"
              }`}
            >
              {ROTULO_DO_ATALHO[a]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2 mt-1">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground-muted">ou de</span>
            <input
              type="date"
              value={de}
              max={ate || undefined}
              onChange={(e) => {
                setDe(e.target.value);
                setPeriodo("");
              }}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground-muted">até</span>
            <input
              type="date"
              value={ate}
              min={de || undefined}
              onChange={(e) => {
                setAte(e.target.value);
                setPeriodo("");
              }}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm"
            />
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={!loja}
        className="self-start inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50"
      >
        <FileBarChart size={15} /> Gerar relatório
      </button>
    </form>
  );
}
