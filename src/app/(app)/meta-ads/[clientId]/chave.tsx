"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { mudarStatusDoAnuncio } from "@/lib/actions/meta-ads";
import type { NivelDoObjeto } from "@/lib/meta/mudar-status";

// A chave de liga/desliga, igual à do Gerenciador — e agora ligando de verdade.
//
// ── Metade do valor dela sempre foi só MOSTRAR ───────────────────────────
//
// Antes, pra saber se uma campanha estava pausada, alguém abria o
// Gerenciador. Com a chave na tela isso se vê de relance, e por isso ela
// nasceu antes de funcionar.
//
// ── E por que ela nunca fingiu ───────────────────────────────────────────
//
// Chave que parece clicável e não faz nada é pior que chave nenhuma: a pessoa
// clica, vê a animação, e vai embora achando que pausou uma campanha que
// continua gastando. Enquanto a escrita não está liberada, ela não se move —
// e dizer por quê é parte do trabalho dela.
//
// ── Por que pausar campanha pede confirmação e ligar não ─────────────────
//
// Porque os dois erros não custam a mesma coisa. Ligar errado gasta alguns
// reais até alguém perceber. DESLIGAR errado tira a loja do ar — e campanha
// pausada não avisa ninguém, não aparece em lugar nenhum, e só é descoberta
// quando o dono liga perguntando por que parou de chegar gente.
//
// Mais: na Meta, pausar a campanha para TUDO que está dentro dela. Quem
// clica precisa saber quantos conjuntos vão junto ANTES, não depois.

export function ChaveDeStatus({
  ligado,
  nome,
  motivoDaTrava,
  clientId,
  nivel,
  objetoId,
  levaJunto = 0,
}: {
  ligado: boolean;
  nome: string;
  /** Null quando der pra mexer de verdade. */
  motivoDaTrava: string | null;
  clientId: string;
  nivel: NivelDoObjeto;
  objetoId: string;
  /** Quantos itens param junto se isto for pausado. */
  levaJunto?: number;
}) {
  const [avisando, setAvisando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();

  // Enquanto a resposta não volta, a chave já mostra o estado novo. Sem isso
  // ela fica parada por dois segundos e a pessoa clica de novo — e o segundo
  // clique desfaz o primeiro.
  const [otimista, setOtimista] = useState<boolean | null>(null);
  const mostrando = otimista ?? ligado;

  function aplicar(ligar: boolean) {
    setErro(null);
    setConfirmando(false);
    setOtimista(ligar);
    comecar(async () => {
      const r = await mudarStatusDoAnuncio(clientId, nivel, objetoId, ligar);
      if (r.erro) {
        // Deu errado: a chave VOLTA. Deixá-la no estado novo seria mentir
        // sobre uma campanha que continua rodando.
        setOtimista(null);
        setErro(r.erro);
      }
    });
  }

  function clicar() {
    if (motivoDaTrava) {
      setAvisando(true);
      setTimeout(() => setAvisando(false), 3200);
      return;
    }
    if (pendente) return;
    // Desligar pede confirmação; ligar, não. Ver o comentário no topo.
    if (mostrando) setConfirmando(true);
    else aplicar(true);
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        role="switch"
        aria-checked={mostrando}
        aria-label={`${nome} está ${mostrando ? "ativo" : "pausado"}`}
        title={motivoDaTrava ?? (mostrando ? "Pausar" : "Ligar")}
        onClick={clicar}
        disabled={pendente}
        className={`w-9 h-5 rounded-full transition-colors shrink-0 relative ${
          mostrando ? "bg-accent" : "bg-surface-muted border border-border"
        } ${motivoDaTrava ? "cursor-help" : "cursor-pointer"} ${pendente ? "opacity-60" : ""}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full transition-all flex items-center justify-center ${
            mostrando ? "left-[1.1rem] bg-white" : "left-0.5 bg-foreground-muted"
          }`}
        >
          {pendente && <Loader2 size={10} className="animate-spin text-accent" />}
        </span>
      </button>

      {avisando && motivoDaTrava && (
        <span className="absolute left-0 top-7 z-20 w-56 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground-muted shadow-lg">
          {motivoDaTrava}
        </span>
      )}

      {confirmando && (
        <span className="absolute left-0 top-7 z-30 w-72 rounded-xl border border-red-500/60 bg-surface p-3 shadow-xl flex flex-col gap-2 text-left">
          <span className="text-sm font-semibold flex items-start gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>Pausar {nome}?</span>
          </span>
          <span className="text-xs text-foreground-muted">
            {nivel === "campanha" ? (
              <>
                Pausar a campanha para <strong>tudo que está dentro dela</strong>
                {levaJunto > 0 && (
                  <>
                    {" "}
                    — são {levaJunto} {levaJunto === 1 ? "conjunto ativo" : "conjuntos ativos"}
                  </>
                )}
                . A loja deixa de entregar.
              </>
            ) : nivel === "conjunto" ? (
              <>
                Só este conjunto para
                {levaJunto > 0 && (
                  <>
                    {" "}
                    — com {levaJunto} {levaJunto === 1 ? "anúncio ativo" : "anúncios ativos"} dentro
                  </>
                )}
                . O resto da campanha continua.
              </>
            ) : (
              <>Só este anúncio para. O resto do conjunto continua.</>
            )}
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => aplicar(false)}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700"
            >
              Pausar
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-surface-muted"
            >
              Cancelar
            </button>
          </span>
        </span>
      )}

      {erro && (
        <span className="absolute left-0 top-7 z-30 w-72 rounded-lg border border-red-500/60 bg-surface px-3 py-2 shadow-xl flex flex-col gap-1.5">
          <span className="text-xs text-red-600 dark:text-red-400">{erro}</span>
          <button
            type="button"
            onClick={() => setErro(null)}
            className="self-start text-xs text-foreground-muted hover:text-foreground"
          >
            Fechar
          </button>
        </span>
      )}
    </span>
  );
}
