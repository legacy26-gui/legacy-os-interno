"use client";

import { useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitWeeklyReview } from "@/lib/actions/account-management";

const CRIATIVOS = [
  ["createdCreative", "Criou criativo novo"],
  ["createdAd", "Criou anúncio novo"],
  ["testedAudience", "Testou público novo"],
  ["updatedOffers", "Atualizou ofertas"],
] as const;

const RELATORIO = [
  ["reportSent", "Relatório enviado"],
  ["clientReplied", "Cliente respondeu"],
  ["adjustmentsDone", "Ajustes realizados"],
] as const;

function Check({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-2.5 py-1.5 cursor-pointer text-sm">
      <input type="checkbox" name={name} className="w-4 h-4 rounded border-border accent-[var(--accent,#6366f1)]" />
      {label}
    </label>
  );
}

export function WeeklyReviewForm({ clientId }: { clientId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        setSaving(true);
        await submitWeeklyReview(clientId, fd);
        formRef.current?.reset();
        setSaving(false);
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium mb-1">Criativos</p>
          {CRIATIVOS.map(([name, label]) => (
            <Check key={name} name={name} label={label} />
          ))}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium mb-1">Relatório</p>
          {RELATORIO.map(([name, label]) => (
            <Check key={name} name={name} label={label} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium mb-1.5">Observações</p>
        <textarea
          name="notes"
          rows={2}
          placeholder="Observações da revisão semanal..."
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="self-start inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
      >
        <CheckCircle2 size={15} />
        {saving ? "Salvando..." : "Concluir revisão semanal"}
      </button>
    </form>
  );
}
