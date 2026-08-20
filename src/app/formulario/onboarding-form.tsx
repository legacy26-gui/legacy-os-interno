"use client";

import { useActionState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { submitOnboarding } from "@/lib/actions/onboarding";
import { ONBOARDING_SECTIONS, type OnboardingField } from "@/lib/onboarding-form";

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-3 text-base sm:text-sm outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent";

function Campo({ field }: { field: OnboardingField }) {
  const label = (
    <label htmlFor={field.id} className="text-sm font-medium mb-1.5 block">
      {field.label} {field.required && <span className="text-red-500">*</span>}
    </label>
  );

  return (
    <div className={field.type === "textarea" || field.type === "multi" ? "sm:col-span-2" : ""}>
      {label}
      {field.help && <p className="text-xs text-foreground-muted mb-1.5 -mt-1">{field.help}</p>}

      {field.type === "textarea" && (
        <textarea id={field.id} name={field.id} rows={3} required={field.required} className={inputClass} />
      )}

      {field.type === "select" && (
        <select id={field.id} name={field.id} required={field.required} defaultValue="" className={inputClass}>
          <option value="">Selecione</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}

      {field.type === "multi" && (
        <div className="flex flex-wrap gap-2">
          {field.options?.map((o) => (
            <label
              key={o}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm cursor-pointer hover:bg-surface-muted"
            >
              <input type="checkbox" name={field.id} value={o} className="w-4 h-4 accent-[var(--accent,#6366f1)]" />
              {o}
            </label>
          ))}
        </div>
      )}

      {["text", "tel", "email", "number"].includes(field.type) && (
        <input
          id={field.id}
          name={field.id}
          type={field.type === "number" ? "text" : field.type}
          inputMode={field.type === "tel" ? "tel" : field.type === "number" ? "numeric" : undefined}
          placeholder={field.placeholder}
          required={field.required}
          className={inputClass}
        />
      )}
    </div>
  );
}

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(submitOnboarding, undefined);

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center flex flex-col items-center gap-3">
        <CheckCircle2 size={36} className="text-emerald-500" />
        <h2 className="text-lg font-semibold">Recebemos suas respostas!</h2>
        <p className="text-sm text-foreground-muted max-w-md">
          Obrigado. Nossa equipe já vai olhar tudo e entra em contato pelo WhatsApp pra dar o próximo passo.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {/* Campo-armadilha contra robô: invisível pra pessoa, tentador pra bot. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute w-px h-px -left-[9999px] opacity-0"
      />

      {ONBOARDING_SECTIONS.map((section) => (
        <section key={section.title} className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <h2 className="text-base font-semibold">{section.title}</h2>
          {section.description && <p className="text-sm text-foreground-muted mt-1">{section.description}</p>}
          <div className="grid sm:grid-cols-2 gap-4 mt-5">
            {section.fields.map((f) => (
              <Campo key={f.id} field={f} />
            ))}
          </div>
        </section>
      ))}

      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-accent text-accent-foreground rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-60"
      >
        <Send size={16} />
        {pending ? "Enviando..." : "Enviar respostas"}
      </button>
      <p className="text-xs text-foreground-muted text-center -mt-2">
        Leva uns 5 minutos. O que você não souber agora, pode deixar em branco.
      </p>
    </form>
  );
}
