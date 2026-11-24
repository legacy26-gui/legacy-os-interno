"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Car, X, Loader2, AlertTriangle } from "lucide-react";
import { lerEstoqueDaLoja } from "@/lib/actions/anunciar-do-estoque";
import type { EstoqueDaFicha } from "@/lib/estoque/da-loja";
import { EstoqueDaLoja } from "../../clientes/[id]/estoque-da-loja";

// O estoque da loja, numa bolha por cima do Meta Ads: cada carro do site com a situação de anúncio, e o "Anunciar agora" nos que
// estão sem. Selecionar o carro abre a bolha do Anunciar agora (campanha, conjunto, anúncio, nomes, fotos e legenda) por cima.

export function EstoqueBalao({ clientId, loja }: { clientId: string; loja: string }) {
  const [aberto, setAberto] = useState(false);
  const [carregando, carregar] = useTransition();
  const [estoque, setEstoque] = useState<EstoqueDaFicha | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function abrir() {
    setAberto(true);
    setEstoque(null);
    setErro(null);
    carregar(async () => {
      const r = await lerEstoqueDaLoja(clientId);
      if (r.ok && r.estoque) setEstoque(r.estoque);
      else setErro(r.erro ?? "Não consegui abrir o estoque.");
    });
  }

  useEffect(() => {
    if (!aberto) return;
    // Esc fecha só a bolha de cima (a do Anunciar agora, se estiver aberta, cuida do dela).
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && document.querySelectorAll('[role="dialog"]').length <= 1 && setAberto(false);
    document.addEventListener("keydown", aoTeclar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [aberto]);

  const bolha = (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Estoque de ${loja}`}>
      <button type="button" aria-label="Fechar" onClick={() => setAberto(false)} className="absolute inset-0 bg-black/60 backdrop-blur-[2px] cursor-default" />
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
          <div className="min-w-0">
            <h2 className="font-semibold flex items-center gap-2 truncate">
              <Car size={17} className="text-accent shrink-0" /> Estoque — {loja}
            </h2>
            <p className="text-xs text-foreground-muted mt-0.5">Escolha o carro e aperte “Anunciar agora”: o rascunho nasce pausado na Meta.</p>
          </div>
          <button type="button" onClick={() => setAberto(false)} className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-muted shrink-0" title="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          {carregando || (!estoque && !erro) ? (
            <p className="text-sm text-foreground-muted py-10 text-center flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Abrindo o estoque…
            </p>
          ) : erro ? (
            <p className="text-sm text-red-500 flex items-start gap-1.5">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {erro}
            </p>
          ) : (
            estoque && <EstoqueDaLoja estoque={estoque} />
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button type="button" onClick={abrir} className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-border bg-surface rounded-lg text-sm font-medium hover:bg-surface-muted">
        <Car size={14} /> Estoque
      </button>
      {aberto ? createPortal(bolha, document.body) : null}
    </>
  );
}
