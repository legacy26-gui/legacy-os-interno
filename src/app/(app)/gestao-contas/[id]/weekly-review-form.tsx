"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2, Camera, X } from "lucide-react";
import { submitWeeklyReview } from "@/lib/actions/account-management";
import { PlaybookHint } from "@/components/playbook-hint";

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

export function WeeklyReviewForm({
  clientId,
  suggestions = [],
}: {
  clientId: string;
  suggestions?: { id: string; title: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, saving] = useActionState(submitWeeklyReview.bind(null, clientId), undefined);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (state && !state.error) {
      formRef.current?.reset();
      setPreview(null);
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <PlaybookHint playbooks={suggestions} />
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
        <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium mb-1.5">
          Foto do relatório <span className="text-red-500">*</span>
        </p>
        <p className="text-xs text-foreground-muted mb-2">Obrigatório — sem a foto a revisão semanal não é salva.</p>

        {/* O input fica sempre montado (só visualmente oculto) para não perder o
            arquivo selecionado quando a prévia é exibida. */}
        <input
          ref={fileInputRef}
          type="file"
          name="reportPhoto"
          accept="image/*"
          capture="environment"
          required
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return setPreview(null);
            const reader = new FileReader();
            reader.onload = () => setPreview(reader.result as string);
            reader.readAsDataURL(file);
          }}
        />

        {preview ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Pré-visualização do relatório" className="max-h-40 rounded-lg border border-border" />
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:opacity-90"
              aria-label="Remover foto"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 w-fit px-3.5 py-2.5 rounded-lg border border-dashed border-border bg-surface text-sm text-foreground-muted cursor-pointer hover:bg-surface-muted"
          >
            <Camera size={16} />
            Selecionar foto do relatório
          </button>
        )}
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

      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}

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
