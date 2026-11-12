"use client";

import { useState, useTransition } from "react";
import { Check, Unlink, Sparkles } from "lucide-react";
import { vincularVarias, desvincularConta, type MetaAdsState } from "@/lib/actions/meta-ads";

// A lista de contas, uma linha cada, com a loja escolhida ao lado.
//
// Por que não vincular tudo sozinho pela sugestão: porque a sugestão erra. Ela
// casa "Bravos Motors" com "Bravos Veículos" de boa vontade, e conta vinculada
// à loja errada manda o gasto de uma pra ficha da outra — número que chega
// sozinho ninguém confere depois. Então o palpite preenche e a pessoa olha.
//
// Marcar só o que tem loja escolhida é de propósito: linha sem loja não vira
// erro, só fica de fora.

interface Conta {
  metaAccountId: string;
  nome: string;
  moeda: string | null;
  ativa: boolean;
  jaVinculadaA: { contaId: string; clientId: string; loja: string } | null;
  sugestao: { clientId: string; loja: string; confianca: number } | null;
}

export function ListaDeVinculos({
  contas,
  lojas,
}: {
  contas: Conta[];
  lojas: { id: string; companyName: string }[];
}) {
  const porVincular = contas.filter((c) => !c.jaVinculadaA);
  const jaFeitas = contas.filter((c) => c.jaVinculadaA);

  // Começa com a sugestão preenchida, e nada marcado.
  const [escolha, setEscolha] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      porVincular.filter((c) => c.sugestao).map((c) => [c.metaAccountId, c.sugestao!.clientId])
    )
  );
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [prePagas, setPrePagas] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState<MetaAdsState>({});
  const [pendente, comecar] = useTransition();

  const prontas = [...marcadas].filter((id) => escolha[id]);

  function alternar(id: string) {
    setMarcadas((antes) => {
      const novo = new Set(antes);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  }

  function marcarTodasComSugestao() {
    setMarcadas(new Set(porVincular.filter((c) => c.sugestao).map((c) => c.metaAccountId)));
  }

  function vincular() {
    comecar(async () => {
      const r = await vincularVarias(
        prontas.map((metaAccountId) => ({
          metaAccountId,
          clientId: escolha[metaAccountId],
          isPrepay: prePagas.has(metaAccountId),
        }))
      );
      setEstado(r);
      if (r.ok) setMarcadas(new Set());
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {porVincular.length === 0 ? (
        <p className="text-sm text-foreground-muted rounded-xl border border-border bg-surface p-8 text-center">
          Todas as contas que enxergamos já estão vinculadas.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={vincular}
              disabled={pendente || prontas.length === 0}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {pendente
                ? "Vinculando…"
                : prontas.length === 0
                  ? "Marque as contas pra vincular"
                  : `Vincular ${prontas.length} ${prontas.length === 1 ? "conta" : "contas"}`}
            </button>
            <button
              type="button"
              onClick={marcarTodasComSugestao}
              className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground"
            >
              <Sparkles size={14} /> Marcar todas com sugestão
            </button>
            {marcadas.size > 0 && (
              <button
                type="button"
                onClick={() => setMarcadas(new Set())}
                className="text-sm text-foreground-muted hover:text-foreground"
              >
                Desmarcar tudo
              </button>
            )}
          </div>

          {estado.erro && <p className="text-sm text-red-500">{estado.erro}</p>}
          {estado.ok && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{estado.ok}</p>
          )}

          <div className="flex flex-col gap-2">
            {porVincular.map((c) => {
              const marcada = marcadas.has(c.metaAccountId);
              return (
                <div
                  key={c.metaAccountId}
                  className={`rounded-xl border bg-surface px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-3 ${
                    marcada ? "border-accent" : "border-border"
                  }`}
                >
                  <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => alternar(c.metaAccountId)}
                      className="w-4 h-4 mt-0.5 rounded border-border shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{c.nome}</span>
                      <span className="block text-xs font-mono text-foreground-muted">
                        {c.metaAccountId}
                        {c.moeda && c.moeda !== "BRL" && (
                          <span className="ml-2 text-amber-600 dark:text-amber-400 font-sans">
                            moeda {c.moeda} — os valores não são em real
                          </span>
                        )}
                        {!c.ativa && (
                          <span className="ml-2 text-foreground-muted font-sans">
                            conta desativada na Meta
                          </span>
                        )}
                      </span>
                    </span>
                  </label>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={escolha[c.metaAccountId] ?? ""}
                      onChange={(e) =>
                        setEscolha((a) => ({ ...a, [c.metaAccountId]: e.target.value }))
                      }
                      className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm max-w-[16rem]"
                    >
                      <option value="">— escolha a loja —</option>
                      {lojas.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.companyName}
                        </option>
                      ))}
                    </select>
                    <label
                      className="flex items-center gap-1.5 text-xs text-foreground-muted cursor-pointer"
                      title="Conta abastecida por Pix. Só nela faz sentido acompanhar saldo."
                    >
                      <input
                        type="checkbox"
                        checked={prePagas.has(c.metaAccountId)}
                        onChange={() =>
                          setPrePagas((antes) => {
                            const novo = new Set(antes);
                            novo.has(c.metaAccountId)
                              ? novo.delete(c.metaAccountId)
                              : novo.add(c.metaAccountId);
                            return novo;
                          })
                        }
                        className="w-3.5 h-3.5 rounded border-border"
                      />
                      Pix
                    </label>
                  </div>

                  {c.sugestao && (
                    <span
                      className="text-xs text-foreground-muted shrink-0"
                      title={`Palpite pelo nome — ${Math.round(c.sugestao.confianca * 100)}% de parecença. Confira.`}
                    >
                      palpite
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {jaFeitas.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">
            Já vinculadas ({jaFeitas.length})
          </p>
          {jaFeitas.map((c) => (
            <JaVinculada key={c.metaAccountId} conta={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function JaVinculada({ conta }: { conta: Conta }) {
  const [estado, setEstado] = useState<MetaAdsState>({});
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, comecar] = useTransition();

  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 flex flex-wrap items-center gap-3">
      <Check size={15} className="text-emerald-500 shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm truncate">
          {conta.nome} <span className="text-foreground-muted">→ {conta.jaVinculadaA?.loja}</span>
        </span>
        <span className="block text-xs font-mono text-foreground-muted">{conta.metaAccountId}</span>
      </span>
      {estado.erro && <span className="text-xs text-red-500">{estado.erro}</span>}
      {/* Desvincular apaga os números junto, então pergunta antes. */}
      {confirmando ? (
        <span className="flex items-center gap-2 text-xs">
          <span className="text-foreground-muted">Apaga os números guardados.</span>
          <button
            type="button"
            disabled={pendente}
            onClick={() =>
              comecar(async () => {
                setEstado(await desvincularConta(conta.jaVinculadaA!.contaId));
                setConfirmando(false);
              })
            }
            className="px-2.5 py-1 rounded-lg bg-red-500 text-white font-medium disabled:opacity-60"
          >
            Desvincular
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="text-foreground-muted hover:text-foreground"
          >
            Cancelar
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="inline-flex items-center gap-1.5 text-xs text-foreground-muted hover:text-red-500"
        >
          <Unlink size={13} /> Desvincular
        </button>
      )}
    </div>
  );
}
