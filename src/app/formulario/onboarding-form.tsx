"use client";

import { useActionState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { submitOnboarding } from "@/lib/actions/onboarding";
import { ONBOARDING_SECTIONS, type OnboardingField } from "@/lib/onboarding-form";

// Identidade da página pública: preto e amarelo, independente do tema claro ou
// escuro que a pessoa usa no navegador — quem responde é o cliente, não a
// equipe, e a página tem que sair sempre igual.
const campoBase =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-base sm:text-[15px] text-white " +
  "placeholder:text-zinc-600 outline-none transition-colors focus:border-[#FFC629] focus:ring-2 focus:ring-[#FFC629]/25";

function Campo({ field }: { field: OnboardingField }) {
  const largo = field.type === "textarea" || field.type === "multi";

  return (
    <div className={largo ? "sm:col-span-2" : ""}>
      <label htmlFor={field.id} className="text-sm font-medium text-zinc-200 mb-2 block">
        {field.label} {field.required && <span className="text-[#FFC629]">*</span>}
      </label>
      {field.help && <p className="text-xs text-zinc-500 mb-2 -mt-1">{field.help}</p>}

      {field.type === "textarea" && (
        <textarea id={field.id} name={field.id} rows={3} required={field.required} className={campoBase} />
      )}

      {field.type === "select" && (
        <select
          id={field.id}
          name={field.id}
          required={field.required}
          defaultValue=""
          className={`${campoBase} appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 stroke=%22%23FFC629%22 stroke-width=%222%22 viewBox=%220 0 24 24%22%3E%3Cpath d=%22m6 9 6 6 6-6%22/%3E%3C/svg%3E')] bg-[length:18px] bg-[right_1rem_center] bg-no-repeat pr-11`}
        >
          <option value="" className="bg-[#101010]">
            Selecione
          </option>
          {field.options?.map((o) => (
            <option key={o} value={o} className="bg-[#101010]">
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
              className="group inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300 cursor-pointer transition-colors hover:border-[#FFC629]/50 has-[:checked]:border-[#FFC629] has-[:checked]:bg-[#FFC629]/10 has-[:checked]:text-white"
            >
              <input
                type="checkbox"
                name={field.id}
                value={o}
                className="w-4 h-4 rounded border-white/20 bg-transparent accent-[#FFC629]"
              />
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
          className={campoBase}
        />
      )}
    </div>
  );
}

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(submitOnboarding, undefined);

  if (state?.ok) {
    return (
      <div className="rounded-3xl border border-[#FFC629]/30 bg-gradient-to-b from-[#FFC629]/10 to-transparent p-10 text-center flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-[#FFC629] flex items-center justify-center">
          <CheckCircle2 size={28} className="text-black" />
        </div>
        <h2 className="text-xl font-semibold text-white">Recebemos suas respostas</h2>
        <p className="text-sm text-zinc-400 max-w-md leading-relaxed">
          Obrigado. Nossa equipe já vai analisar tudo e entra em contato pelo WhatsApp com os próximos passos.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* Campo-armadilha contra robô: invisível pra pessoa, tentador pra bot. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute w-px h-px -left-[9999px] opacity-0"
      />

      {ONBOARDING_SECTIONS.map((section, i) => (
        <section
          key={section.title}
          className="rounded-3xl border border-white/10 bg-[#101010] p-6 sm:p-8 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]"
        >
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-bold text-black bg-[#FFC629] rounded-md w-6 h-6 flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <h2 className="text-lg font-semibold text-white tracking-tight">{section.title}</h2>
          </div>
          {section.description && <p className="text-sm text-zinc-400 mt-2 ml-9">{section.description}</p>}

          <div className="grid sm:grid-cols-2 gap-5 mt-6">
            {section.fields.map((f) => (
              <Campo key={f.id} field={f} />
            ))}
          </div>
        </section>
      ))}

      {state?.error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 px-6 py-4 bg-[#FFC629] text-black rounded-2xl text-sm font-bold tracking-wide uppercase transition-transform hover:brightness-105 active:scale-[0.99] disabled:opacity-60 disabled:active:scale-100"
      >
        <Send size={16} />
        {pending ? "Enviando..." : "Enviar respostas"}
      </button>
      <p className="text-xs text-zinc-500 text-center -mt-1">
        O que você não souber agora, pode deixar em branco.
      </p>
    </form>
  );
}
