"use client";

import { useActionState } from "react";
import { changePassword } from "@/lib/actions/auth";
import { KeyRound } from "lucide-react";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-foreground-muted">
          Nova senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          placeholder="Mínimo 8 caracteres, com letra e número"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground-muted">
          Confirmar nova senha
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-accent text-accent-foreground font-medium text-sm py-2.5 hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        <KeyRound size={16} />
        {pending ? "Salvando..." : "Salvar nova senha"}
      </button>
    </form>
  );
}
