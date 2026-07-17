"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from "lucide-react";
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-surface-muted transition-colors"
      >
        <div className="flex items-center gap-3">
          {dailyDoneToday ? (
            <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle size={18} className="text-red-500 shrink-0" />
          )}
          <div>
            <p className="font-medium">{companyName}</p>
            <p className="text-xs text-foreground-muted mt-0.5">
              {dailyDoneToday ? "Revisão diária feita hoje" : "Revisão diária pendente hoje"}
              {" · "}
              {weeklyDoneThisWeek ? "semanal em dia" : "semanal pendente"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!dailyDoneToday && !open && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-accent text-accent-foreground">Preencher</span>
          )}
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${scoreClass}`}>{score}</span>
          {open ? <ChevronUp size={16} className="text-foreground-muted" /> : <ChevronDown size={16} className="text-foreground-muted" />}
        </div>
      </button>

      {open && (
        <div className="p-4 border-t border-border">
          <DailyReviewForm clientId={clientId} suggestions={suggestions} />
        </div>
      )}
    </div>
  );
}
