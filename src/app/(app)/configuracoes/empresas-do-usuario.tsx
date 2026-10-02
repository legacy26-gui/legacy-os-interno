"use client";

import { useState, useTransition } from "react";
import { setUserEmpresas } from "@/lib/actions/users";
import type { Empresa } from "@/generated/prisma/enums";

// Em quais empresas do grupo a pessoa trabalha.
//
// Não é só o menu: quem fica marcado só em "Treinamentos" não consegue ver o
// financeiro da agência de jeito nenhum — nem digitando o endereço na mão —
// porque toda consulta de dinheiro e de funil confere esta lista no banco.

export function EmpresasDoUsuario({
  userId,
  empresas,
  atuais,
  rotulos,
}: {
  userId: string;
  empresas: Empresa[];
  atuais: Empresa[];
  rotulos: Record<Empresa, string>;
}) {
  const [marcadas, setMarcadas] = useState<Empresa[]>(atuais);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  function alternar(empresa: Empresa) {
    const proximas = marcadas.includes(empresa)
      ? marcadas.filter((e) => e !== empresa)
      : [...empresas.filter((e) => marcadas.includes(e) || e === empresa)];

    if (proximas.length === 0) {
      setErro("Precisa de pelo menos uma.");
      return;
    }

    setErro(null);
    setMarcadas(proximas);
    iniciar(async () => {
      const r = await setUserEmpresas(userId, proximas);
      if (r?.error) {
        setErro(r.error);
        setMarcadas(marcadas); // desfaz na tela o que o servidor recusou
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className={`flex flex-wrap gap-1.5 ${salvando ? "opacity-60" : ""}`}>
        {empresas.map((e) => {
          const ativa = marcadas.includes(e);
          return (
            <button
              key={e}
              type="button"
              onClick={() => alternar(e)}
              disabled={salvando}
              aria-pressed={ativa}
              className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                ativa
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "bg-surface-muted text-foreground-muted border-border hover:bg-border/60"
              }`}
            >
              {rotulos[e]}
            </button>
          );
        })}
      </div>
      {erro && <p className="text-[11px] text-red-500">{erro}</p>}
    </div>
  );
}
