"use client";

import { useActionState } from "react";
import type { PlaybookModel as Playbook } from "@/generated/prisma/models";
import type { PlaybookFormState } from "@/lib/actions/playbooks";

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent";
const labelClass = "text-sm font-medium text-foreground-muted mb-1.5 block";

export function PlaybookForm({
  playbook,
  action,
}: {
  playbook?: Playbook;
  action: (state: PlaybookFormState, formData: FormData) => Promise<PlaybookFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div>
        <label className={labelClass}>Título *</label>
        <input name="title" defaultValue={playbook?.title} required className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Tags</label>
        <input
          name="tags"
          defaultValue={playbook?.tags.join(", ")}
          placeholder="ex: verba, criativo, relatorio"
          className={inputClass}
        />
        <p className="text-xs text-foreground-muted mt-1.5">
          Separe por vírgula. Tags como <code>diario</code>, <code>semanal</code>, <code>verba</code>,{" "}
          <code>criativo</code> e <code>relatorio</code> fazem o playbook aparecer como sugestão automática nos
          checklists relacionados.
        </p>
      </div>

      <div>
        <label className={labelClass}>Conteúdo *</label>
        <textarea
          name="content"
          defaultValue={playbook?.content}
          required
          rows={16}
          className={`${inputClass} font-mono text-[13px] leading-relaxed`}
          placeholder="Escreva o passo a passo, regras e exemplos..."
        />
      </div>

      {state?.error && (
        <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-accent text-accent-foreground font-medium rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}
