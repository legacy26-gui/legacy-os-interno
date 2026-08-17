"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { DailyReviewForm } from "../gestao-contas/[id]/daily-review-form";

export function ClientChecklistRow({
  clientId,
  companyName,
  score,
  scoreClass,
  dailyDoneToday,
  weeklyDoneThisWeek,
  suggestions = [],
}: {
  clientId: string;
  companyName: string;
  score: number;
  scoreClass: string;
  dailyDoneToday: boolean;
  weeklyDoneThisWeek: boolean;
  suggestions?: { id: string; title: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`rounded-2xl border bg-surface overflow-hidden ${
        dailyDoneToday ? "border-border" : "border-red-500/40"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        {/* Nome abre a página completa do cliente; o botão ao lado só expande
            o checklist pra preencher rápido, sem sair da lista. */}
        <Link href={`/gestao-contas/${clientId}`} className="flex items-center gap-3 min-w-0 group">
          {dailyDoneToday ? (
            <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle size={18} className="text-red-500 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="font-medium truncate group-hover:text-accent transition-colors flex items-center gap-1.5">
              {companyName}
              <ExternalLink size={12} className="text-foreground-muted shrink-0" />
            </p>
            <p className="text-xs text-foreground-muted mt-0.5">
              {dailyDoneToday ? "Revisão diária feita hoje" : "Revisão diária pendente hoje"}
              {" · "}
              {weeklyDoneThisWeek ? "semanal em dia" : "semanal pendente"}
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${scoreClass}`}>{score}</span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
              open
                ? "border border-border hover:bg-surface-muted"
                : dailyDoneToday
                  ? "border border-border hover:bg-surface-muted"
                  : "bg-accent text-accent-foreground hover:opacity-90"
            }`}
          >
            {open ? (
              <>
                Fechar <ChevronUp size={14} />
              </>
            ) : (
              <>
                Preencher <ChevronDown size={14} />
              </>
            )}
          </button>
        </div>
      </div>

      {open && (
        <div className="p-4 border-t border-border">
          <DailyReviewForm clientId={clientId} suggestions={suggestions} />
        </div>
      )}
    </div>
  );
}
