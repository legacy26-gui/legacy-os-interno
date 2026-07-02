"use client";

import { useState, useTransition } from "react";
import { KeyRound, Power } from "lucide-react";
import { resetUserPassword, toggleUserActive } from "@/lib/actions/users";

export function UserRowActions({ userId, active }: { userId: string; active: boolean }) {
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => {
            const result = await resetUserPassword(userId);
            setTempPassword(result?.tempPassword ?? null);
          })}
          className="p-1.5 rounded-lg hover:bg-surface-muted text-foreground-muted disabled:opacity-60"
          title="Redefinir senha"
        >
          <KeyRound size={15} />
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => toggleUserActive(userId, !active))}
          className={`p-1.5 rounded-lg hover:bg-surface-muted disabled:opacity-60 ${active ? "text-emerald-500" : "text-red-500"}`}
          title={active ? "Desativar usuário" : "Ativar usuário"}
        >
          <Power size={15} />
        </button>
      </div>
      {tempPassword && (
        <p className="text-[11px] text-emerald-500 whitespace-nowrap">Nova senha: {tempPassword}</p>
      )}
    </div>
  );
}
