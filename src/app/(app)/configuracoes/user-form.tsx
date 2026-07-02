"use client";

import { useActionState, useRef } from "react";
import { UserPlus } from "lucide-react";
import { createUser } from "@/lib/actions/users";
import { ROLE_LABELS } from "@/lib/permissions";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

export function UserForm() {
  const [state, formAction, pending] = useActionState(createUser, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await formAction(fd);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-3"
    >
      <div className="grid sm:grid-cols-3 gap-2">
        <input name="name" placeholder="Nome" required className={inputClass} />
        <input name="email" type="email" placeholder="E-mail" required className={inputClass} />
        <select name="role" required className={inputClass} defaultValue="">
          <option value="" disabled>
            Nível de acesso
          </option>
          {Object.entries(ROLE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
      {state?.tempPassword && (
        <p className="text-xs text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          Usuário criado. Senha temporária: <strong>{state.tempPassword}</strong> (troca obrigatória no primeiro login)
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start inline-flex items-center gap-1.5 px-3.5 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-60"
      >
        <UserPlus size={14} />
        {pending ? "Criando..." : "Novo usuário"}
      </button>
    </form>
  );
}
