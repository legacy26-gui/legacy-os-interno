"use client";

import { useActionState, useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitDailyReview } from "@/lib/actions/account-management";
import { PlaybookHint } from "@/components/playbook-hint";

const META_ADS = [
  ["checkedCpl", "Verificou CPL"],
  ["checkedBudget", "Verificou orçamento"],
  ["checkedRejected", "Verificou campanhas rejeitadas"],
  ["checkedFrequency", "Verificou frequência"],
  ["checkedComments", "Verificou comentários"],
  ["checkedLeads", "Verificou leads"],
] as const;

const CRM = [
  ["checkedLeadDelivery", "Conferiu entrega de leads"],
  ["checkedService", "Conferiu atendimento"],
  ["checkedScheduling", "Conferiu agendamentos"],
] as const;

function Check({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-2.5 py-1.5 cursor-pointer text-sm">
      <input type="checkbox" name={name} className="w-4 h-4 rounded border-border accent-[var(--accent,#6366f1)]" />
      {label}
    </label>
  );
}

export function DailyReviewForm({
  clientId,
  suggestions = [],
}: {
  clientId: string;
  suggestions?: { id: string; title: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, saving] = useActionState(submitDailyReview.bind(null, clientId), undefined);

  useEffect(() => {
    if (state && !state.error) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <PlaybookHint playbooks={suggestions} />
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium mb-1">Meta Ads</p>
          {META_ADS.map(([name, label]) => (
            <Check key={name} name={name} label={label} />
          ))}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium mb-1">CRM</p>
          {CRM.map(([name, label]) => (
            <Check key={name} name={name} label={label} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium mb-1.5">Observações</p>
        <textarea
          name="notes"
          rows={2}
          placeholder="Observações da revisão diária..."
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="self-start inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
      >
        <CheckCircle2 size={15} />
        {saving ? "Salvando..." : "Concluir revisão diária"}
      </button>
    </form>
  );
}
