"use client";

import { useState, useTransition } from "react";
import { Loader2, Rocket, ExternalLink, AlertTriangle } from "lucide-react";
import { anunciarAgora } from "@/lib/actions/anunciar-do-estoque";
import type { ResultadoDoAnunciarAgora } from "@/lib/estoque/anunciar-agora";

// "Anunciar agora": puxa os dados e as fotos do site, a IA escreve a legenda e o robô deixa o anúncio como RASCUNHO PAUSADO
// na Meta. Nada vai ao ar: quem confere e publica é a pessoa, no Gerenciador.

export function BotaoAnunciarAgora({ carroId, carro }: { carroId: string; carro: string }) {
  const [pendente, comecar] = useTransition();
  const [r, setR] = useState<ResultadoDoAnunciarAgora | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pendente || (r?.ok ?? false)}
        onClick={() => {
          if (!confirm(`Anunciar agora: ${carro}?\n\nVou pegar os dados e as fotos do site, a IA escreve a legenda e eu deixo o anúncio como RASCUNHO PAUSADO na Meta. Nada vai ao ar.`)) return;
          comecar(async () => setR(await anunciarAgora(carroId)));
        }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
      >
        {pendente ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
        {pendente ? "Subindo o rascunho…" : r?.ok ? "Rascunho criado" : "Anunciar agora"}
      </button>
      {r && !r.ok && (
        <p className="text-sm text-red-600 dark:text-red-400 flex items-start gap-1.5 whitespace-pre-line">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {r.erro}
        </p>
      )}
      {r?.ok && (
        <div className="text-sm rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 flex flex-col gap-1.5">
          {r.jaTinha ? (
            <p>Esse carro já tem rascunho criado. Procure no Gerenciador (anúncio {r.adId}).</p>
          ) : (
            <>
              <p>
                <strong>Rascunho pausado criado</strong> ({r.formato === "carrossel" ? "carrossel" : "foto única"}, {r.fotos} {r.fotos === 1 ? "foto" : "fotos"} do site
                {r.conjuntoNovo ? `, num conjunto novo “${r.conjuntoNovo}” também pausado` : ""}). Ele <strong>não está no ar</strong> e não gasta nada.
              </p>
              {r.legenda && <p className="text-foreground-muted whitespace-pre-line line-clamp-6">{r.legenda}</p>}
              {r.avisos?.map((a, i) => (
                <p key={i} className="text-amber-600 dark:text-amber-400">⚠️ {a}</p>
              ))}
              {r.linkDoGerenciador && (
                <a href={r.linkDoGerenciador} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent underline">
                  <ExternalLink size={13} /> Conferir e publicar no Gerenciador
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
