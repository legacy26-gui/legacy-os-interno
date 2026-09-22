"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { X, Trash2, CalendarX, CalendarClock, Ban } from "lucide-react";
import {
  createLead,
  updateLead,
  deleteLead,
  marcarNoShow,
  reagendarReuniao,
  marcarPerdido,
} from "@/lib/actions/leads";
import { LEAD_CHANNEL_LABELS, LEAD_CHANNEL_COLORS, LEAD_STAGE_LABELS, formatCurrency } from "@/lib/labels";
import type { LeadChannel } from "@/generated/prisma/enums";
import type { LeadDoQuadro } from "./tipos";

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40";

const CANAIS = Object.keys(LEAD_CHANNEL_LABELS) as LeadChannel[];

/**
 * Painel que abre do lado pra cadastrar ou mexer num lead. É o mesmo formulário
 * nos dois casos — o que muda é se já existe cartão ou não.
 */
export function LeadPainel({ lead, aoFechar }: { lead: LeadDoQuadro | "novo"; aoFechar: () => void }) {
  const novo = lead === "novo";
  const dados = novo ? null : lead;

  const [canal, setCanal] = useState<LeadChannel>(dados?.channel ?? "META");
  const [motivo, setMotivo] = useState("");
  const [confirmandoPerda, setConfirmandoPerda] = useState(false);
  const [ocupado, iniciar] = useTransition();

  const [state, formAction, pending] = useActionState(
    novo ? createLead : updateLead.bind(null, dados!.id),
    undefined
  );

  useEffect(() => {
    if (state?.ok) aoFechar();
  }, [state, aoFechar]);

  // Esc fecha, como em qualquer painel.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const ganho = dados?.wonAt != null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={aoFechar} />

      <div className="relative w-full sm:max-w-md bg-surface border-l border-border h-dvh overflow-y-auto pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold truncate">{novo ? "Novo lead" : dados!.companyName}</p>
            {!novo && (
              <p className="text-xs text-foreground-muted">
                {LEAD_STAGE_LABELS[dados!.stage]}
                {dados!.ownerName ? ` · ${dados!.ownerName}` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="p-2 rounded-lg hover:bg-surface-muted text-foreground-muted shrink-0"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <form action={formAction} className="p-5 flex flex-col gap-4">
          <input type="hidden" name="channel" value={canal} />

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-foreground-muted">Canal</span>
            <div className="flex flex-wrap gap-1.5">
              {CANAIS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCanal(c)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
                    canal === c
                      ? `${LEAD_CHANNEL_COLORS[c]} ring-2 ring-offset-0 ring-current/40`
                      : "border-border text-foreground-muted hover:bg-surface-muted"
                  }`}
                >
                  {LEAD_CHANNEL_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground-muted">Empresa</span>
            <input name="companyName" required defaultValue={dados?.companyName} className={inputClass} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-foreground-muted">Contato</span>
              <input name="contactName" required defaultValue={dados?.contactName} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-foreground-muted">Telefone</span>
              <input name="phone" defaultValue={dados?.phone ?? ""} className={inputClass} />
            </label>
          </div>

          <div className="grid grid-cols-[1fr_5rem] gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-foreground-muted">Cidade</span>
              <input name="city" defaultValue={dados?.city ?? ""} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-foreground-muted">UF</span>
              <input
                name="state"
                maxLength={2}
                defaultValue={dados?.state ?? ""}
                className={`${inputClass} uppercase`}
              />
            </label>
          </div>

          <div
            className={`rounded-xl border p-4 flex flex-col gap-3 ${
              ganho && (dados?.monthlyValue ?? 0) === 0
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-border bg-surface-muted/40"
            }`}
          >
            <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
              Valores do contrato
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-foreground-muted">Mensalidade (R$)</span>
                <input
                  name="monthlyValue"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={dados?.monthlyValue ?? 0}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-foreground-muted">Entrada/setup (R$)</span>
                <input
                  name="setupValue"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={dados?.setupValue ?? 0}
                  className={inputClass}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-foreground-muted">Meses de contrato</span>
              <input
                name="contractMonths"
                type="number"
                min="1"
                max="120"
                defaultValue={dados?.contractMonths ?? 12}
                className={inputClass}
              />
            </label>
            {ganho && (dados?.monthlyValue ?? 0) === 0 && (
              <p className="text-xs text-amber-500">
                Venda fechada sem mensalidade preenchida — sem esse número não sai novo MRR, CAC nem payback.
              </p>
            )}
            {!ganho && (
              <p className="text-xs text-foreground-muted">
                Vira novo MRR quando o cartão chegar em Fechado. Receita contratada = mensalidade × meses + entrada
                {(dados?.monthlyValue ?? 0) > 0 &&
                  ` (${formatCurrency((dados!.monthlyValue ?? 0) * (dados!.contractMonths ?? 0) + (dados!.setupValue ?? 0))})`}
                .
              </p>
            )}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground-muted">Anotações</span>
            <textarea name="notes" rows={4} defaultValue={dados?.notes ?? ""} className={inputClass} />
          </label>

          {state?.error && <p className="text-sm text-red-500">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full px-4 py-3 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Salvando..." : novo ? "Cadastrar lead" : "Salvar"}
          </button>
        </form>

        {!novo && (
          <div className="px-5 pb-8 flex flex-col gap-3 border-t border-border pt-5">
            <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium">O que aconteceu</p>

            <div className="grid grid-cols-2 gap-2">
              {dados!.noShowAt ? (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => iniciar(async () => void (await reagendarReuniao(dados!.id)))}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-border text-sm hover:bg-surface-muted disabled:opacity-60"
                >
                  <CalendarClock size={15} /> Remarcou
                </button>
              ) : (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => iniciar(async () => void (await marcarNoShow(dados!.id)))}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-border text-sm hover:bg-surface-muted disabled:opacity-60"
                >
                  <CalendarX size={15} /> Não apareceu
                </button>
              )}

              <button
                type="button"
                disabled={ocupado}
                onClick={() => setConfirmandoPerda((v) => !v)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-border text-sm hover:bg-surface-muted disabled:opacity-60"
              >
                <Ban size={15} /> Perdemos
              </button>
            </div>

            {confirmandoPerda && (
              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Por que perdemos? (preço, sem verba, foi pro concorrente...)"
                  className={inputClass}
                />
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() =>
                    iniciar(async () => {
                      await marcarPerdido(dados!.id, motivo);
                      aoFechar();
                    })
                  }
                  className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm font-medium hover:bg-red-500/15 disabled:opacity-60"
                >
                  Marcar como perdido
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                if (!window.confirm(`Excluir o lead "${dados!.companyName}"? Isso apaga o histórico dele.`)) return;
                iniciar(async () => {
                  await deleteLead(dados!.id);
                  aoFechar();
                });
              }}
              className="self-start inline-flex items-center gap-1.5 text-xs text-foreground-muted hover:text-red-500"
            >
              <Trash2 size={13} /> Excluir lead
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
