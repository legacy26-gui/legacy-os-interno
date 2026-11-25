"use client";

import { useState, useTransition } from "react";
import { RotateCcw, Check } from "lucide-react";
import { mudarStatusDoAnuncio } from "@/lib/actions/meta-ads";
import type { NivelDoObjeto } from "@/lib/meta/mudar-status";

// Religar o que o robô pausou — UMA PESSOA clicando (o robô nunca liga nada sozinho). Serve pro dia em que o robô entendeu errado.

export function Religar({ itens, rotulo }: { itens: { clientId: string; nivel: string; objetoId: string }[]; rotulo: string }) {
  const [pendente, comecar] = useTransition();
  const [feito, setFeito] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (feito) {
    return (
      <span className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
        <Check size={12} /> {feito}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-0.5">
      <button
        type="button"
        disabled={pendente}
        onClick={() => {
          if (itens.length > 1 && !confirm(`Religar ${itens.length} anúncios na Meta?`)) return;
          comecar(async () => {
            setErro(null);
            let ok = 0;
            const erros: string[] = [];
            for (const i of itens) {
              const r = await mudarStatusDoAnuncio(i.clientId, i.nivel as NivelDoObjeto, i.objetoId, true);
              if (r.erro) erros.push(r.erro);
              else ok++;
            }
            if (erros.length) setErro(erros[0]);
            if (ok) setFeito(ok === 1 ? "Religado" : `${ok} religados`);
          });
        }}
        className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-surface-muted disabled:opacity-50 w-fit"
      >
        <RotateCcw size={12} className={pendente ? "animate-spin" : ""} /> {pendente ? "Religando…" : rotulo}
      </button>
      {erro && <span className="text-xs text-red-500">{erro}</span>}
    </span>
  );
}
