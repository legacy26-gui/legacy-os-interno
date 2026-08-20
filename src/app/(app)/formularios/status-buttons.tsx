"use client";

import { useTransition } from "react";
import { setOnboardingStatus } from "@/lib/actions/onboarding";
import { ONBOARDING_STATUS_LABELS } from "@/lib/onboarding-form";
import type { OnboardingStatus } from "@/generated/prisma/enums";

const ORDEM: OnboardingStatus[] = ["NOVO", "EM_ANDAMENTO", "CONCLUIDO"];

export function StatusButtons({ id, status }: { id: string; status: OnboardingStatus }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className={`flex gap-1.5 ${pending ? "opacity-50 pointer-events-none" : ""}`}>
      {ORDEM.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => startTransition(async () => setOnboardingStatus(id, s))}
          className={`text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
            s === status
              ? "bg-accent text-accent-foreground"
              : "border border-border text-foreground-muted hover:bg-surface-muted"
          }`}
        >
          {ONBOARDING_STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );
}
