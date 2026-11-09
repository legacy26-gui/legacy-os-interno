"use client";

import { useState, useTransition } from "react";
import { Check, CircleDashed, MessageSquarePlus, X } from "lucide-react";
import { marcarEtapa, desmarcarEtapa, salvarObservacaoDaEtapa } from "@/lib/actions/etapas";
import { FASES_DA_IMPLANTACAO, progresso } from "@/lib/etapas-implantacao";

// As etapas da implantação, na ficha do cliente novo.
//
// Uma lista de clicar: apertou, marcou, e fica registrado quem marcou e
// quando. É o "o que falta pra esse cliente entrar no ar" numa olhada.

export interface EtapaMarcada {
  chave: string;
  quando: string; // já formatado no servidor
  quem: string | null;
  observacao: string | null;
}

export function EtapasDaFicha({
  onboardingId,
  marcadas,
}: {
  onboardingId: string;
  marcadas: EtapaMarcada[];
}) {
  const [salvando, iniciar] = useTransition();
  const [anotando, setAnotando] = useState<string | null>(null);

  const porChave = new Map(marcadas.map((m) => [m.chave, m]));
  const { feitas, total, porcento } = progresso(marcadas.map((m) => m.chave));
  const completo = feitas === total;

  function alternar(chave: string, jaFeita: boolean) {
    iniciar(() => {
      void (jaFeita ? desmarcarEtapa(onboardingId, chave) : marcarEtapa(onboardingId, chave));
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface-muted/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
          Etapas da implantação
        </p>
        <p className={`text-xs font-semibold ${completo ? "text-emerald-500" : ""}`}>
          {feitas} de {total}
          {completo && " · tudo pronto"}
        </p>
      </div>

      {/* Barra de progresso: a leitura de longe. */}
      <div className="h-1.5 bg-border/60">
        <div
          className={`h-full transition-all ${completo ? "bg-emerald-500" : "bg-accent"}`}
          style={{ width: `${porcento}%` }}
        />
      </div>

      <div className={`p-4 flex flex-col gap-4 ${salvando ? "opacity-70" : ""}`}>
        {FASES_DA_IMPLANTACAO.map((fase) => (
          <div key={fase.titulo}>
            <p className="text-[11px] uppercase tracking-wide text-foreground-muted font-medium mb-1.5">
              {fase.titulo}
            </p>
            <div className="flex flex-col">
              {fase.etapas.map((etapa) => {
                const marcada = porChave.get(etapa.id);
                const feita = !!marcada;
                return (
                  <div key={etapa.id} className="py-1">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => alternar(etapa.id, feita)}
                        disabled={salvando}
                        aria-pressed={feita}
                        title={feita ? "Desmarcar" : "Marcar como feita"}
                        className={`shrink-0 w-5 h-5 mt-0.5 rounded-md border flex items-center justify-center transition-colors ${
                          feita
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "border-border hover:border-accent hover:bg-surface"
                        }`}
                      >
                        {feita ? <Check size={13} /> : <CircleDashed size={12} className="text-foreground-muted" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className={`text-sm leading-5 ${feita ? "text-foreground-muted line-through" : ""}`}>
                          {etapa.label}
                        </p>
                        {!feita && etapa.dica && (
                          <p className="text-[11px] text-foreground-muted">{etapa.dica}</p>
                        )}
                        {feita && (
                          <p className="text-[11px] text-foreground-muted">
                            {marcada.quando}
                            {marcada.quem && ` · ${marcada.quem}`}
                          </p>
                        )}
                        {marcada?.observacao && (
                          <p className="text-[11px] mt-0.5 rounded bg-surface px-2 py-1 border border-border/60">
                            {marcada.observacao}
                          </p>
                        )}

                        {/* Observação só existe em etapa feita: não faz sentido
                            anotar sobre coisa que ainda não aconteceu. */}
                        {feita && anotando !== etapa.id && (
                          <button
                            type="button"
                            onClick={() => setAnotando(etapa.id)}
                            className="text-[11px] text-foreground-muted hover:text-foreground inline-flex items-center gap-1 mt-0.5"
                          >
                            <MessageSquarePlus size={11} />
                            {marcada.observacao ? "Mudar observação" : "Anotar algo"}
                          </button>
                        )}
                        {feita && anotando === etapa.id && (
                          <form
                            action={async (fd) => {
                              setAnotando(null);
                              await salvarObservacaoDaEtapa(onboardingId, etapa.id, fd);
                            }}
                            className="flex items-center gap-1.5 mt-1"
                          >
                            <input
                              name="observacao"
                              defaultValue={marcada.observacao ?? ""}
                              autoFocus
                              placeholder="Ex: acesso veio incompleto"
                              className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-accent/40"
                            />
                            <button
                              type="submit"
                              className="p-1 rounded-lg text-emerald-500 hover:bg-emerald-500/10"
                              title="Salvar"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setAnotando(null)}
                              className="p-1 rounded-lg text-foreground-muted hover:bg-surface"
                              title="Cancelar"
                            >
                              <X size={13} />
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
