"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { ATALHOS, ROTULO_DO_ATALHO, type Atalho } from "@/lib/meta/insights";

// Os atalhos e, ao lado, o intervalo à mão.
//
// Os dois juntos porque são o mesmo gesto com pressa diferente: "7 dias" é a
// pergunta de todo dia, "do dia 5 ao dia 12" é a de quando alguém quer
// conferir uma campanha específica. Esconder o segundo atrás de um menu faria
// ninguém descobrir que existe.
//
// Os atalhos são LINKS, não botões: abrem em aba nova, voltam no botão de
// voltar do navegador e podem ser mandados por mensagem pra outra pessoa. O
// intervalo à mão precisa de JavaScript porque só é válido com as duas datas.

export function SeletorDePeriodo({
  caminho,
  manter,
  atalhoAtivo,
  deAtual,
  ateAtual,
}: {
  /** O endereço da tela, sem query: "/meta-ads" ou "/meta-ads/<id>". */
  caminho: string;
  /**
   * O que preservar ao trocar de período: a conta escolhida, a campanha
   * aberta, o conjunto aberto. Dado simples, não função — função não
   * atravessa do servidor pro navegador.
   */
  manter: Record<string, string>;
  atalhoAtivo: string;
  deAtual: string;
  ateAtual: string;
}) {
  const router = useRouter();
  const [de, setDe] = useState(deAtual);
  const [ate, setAte] = useState(ateAtual);
  const [aberto, setAberto] = useState(!!deAtual && !!ateAtual);

  function base(q: { periodo?: string; de?: string; ate?: string }) {
    const p = new URLSearchParams(manter);
    if (q.periodo) p.set("periodo", q.periodo);
    if (q.de) p.set("de", q.de);
    if (q.ate) p.set("ate", q.ate);
    const t = p.toString();
    return `${caminho}${t ? `?${t}` : ""}`;
  }

  function aplicar(e: React.FormEvent) {
    e.preventDefault();
    if (!de || !ate) return;
    router.push(base({ de, ate }));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {ATALHOS.map((a: Atalho) => {
          const ativo = a === atalhoAtivo;
          return (
            <Link
              key={a}
              href={base({ periodo: a, de: undefined, ate: undefined })}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                ativo
                  ? "bg-accent text-white border-accent"
                  : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"
              }`}
            >
              {ROTULO_DO_ATALHO[a]}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            !atalhoAtivo
              ? "bg-accent text-white border-accent"
              : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"
          }`}
        >
          <CalendarRange size={14} /> Escolher datas
        </button>
      </div>

      {aberto && (
        <form
          onSubmit={aplicar}
          className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface px-4 py-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground-muted">De</span>
            <input
              type="date"
              value={de}
              max={ate || undefined}
              onChange={(e) => setDe(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground-muted">Até</span>
            <input
              type="date"
              value={ate}
              min={de || undefined}
              onChange={(e) => setAte(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={!de || !ate}
            className="px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            Ver
          </button>
        </form>
      )}
    </div>
  );
}
