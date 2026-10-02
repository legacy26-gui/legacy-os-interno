"use client";

import { useState, useTransition } from "react";
import { Building2, Check, ChevronDown, GraduationCap } from "lucide-react";
import { trocarEmpresa } from "@/lib/actions/empresa";
import type { Empresa } from "@/generated/prisma/enums";

// Em qual empresa do grupo você está trabalhando agora.
//
// Só aparece pra quem tem as duas. Quem tem uma só nem vê o botão — e, mais
// importante, nem conseguiria ver a outra forçando a URL, porque o filtro vale
// na consulta ao banco (ver src/lib/empresa-atual.ts), não neste menu.

const ICONE: Record<Empresa, typeof Building2> = {
  AGENCIA: Building2,
  TREINAMENTOS: GraduationCap,
};

export function SeletorEmpresa({
  atual,
  empresas,
  rotulos,
}: {
  atual: Empresa;
  empresas: Empresa[];
  rotulos: Record<Empresa, string>;
}) {
  const [aberto, setAberto] = useState(false);
  const [salvando, iniciar] = useTransition();

  if (empresas.length < 2) return null;

  const IconeAtual = ICONE[atual];

  function escolher(empresa: Empresa) {
    setAberto(false);
    if (empresa === atual) return;
    iniciar(() => void trocarEmpresa(empresa));
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={salvando}
        className="flex items-center gap-2 h-9 pl-2.5 pr-2 rounded-lg border border-border bg-surface-muted hover:bg-border/60 transition-colors disabled:opacity-60"
        aria-haspopup="listbox"
        aria-expanded={aberto}
      >
        <IconeAtual size={15} className="text-accent shrink-0" />
        <span className="text-sm font-medium max-w-[9rem] truncate">{rotulos[atual]}</span>
        <ChevronDown size={14} className="text-foreground-muted shrink-0" />
      </button>

      {aberto && (
        <>
          {/* Clicar fora fecha. Fica atrás do menu, cobrindo a tela. */}
          <button
            type="button"
            aria-label="Fechar"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setAberto(false)}
          />
          <div
            role="listbox"
            className="absolute right-0 top-11 z-50 w-60 rounded-xl border border-border bg-surface shadow-lg overflow-hidden"
          >
            <p className="px-3 pt-2.5 pb-1.5 text-[11px] uppercase tracking-wide text-foreground-muted font-medium">
              Empresa
            </p>
            {empresas.map((e) => {
              const Icone = ICONE[e];
              return (
                <button
                  key={e}
                  type="button"
                  role="option"
                  aria-selected={e === atual}
                  onClick={() => escolher(e)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface-muted transition-colors ${
                    e === atual ? "font-medium" : ""
                  }`}
                >
                  <Icone size={15} className={e === atual ? "text-accent" : "text-foreground-muted"} />
                  <span className="flex-1 truncate">{rotulos[e]}</span>
                  {e === atual && <Check size={14} className="text-accent shrink-0" />}
                </button>
              );
            })}
            <p className="px-3 py-2 text-[11px] text-foreground-muted border-t border-border/60 leading-snug">
              Financeiro, metas e funil são separados por empresa.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
