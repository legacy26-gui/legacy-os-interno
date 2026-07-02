"use client";

import { useRef } from "react";
import { updateLeadStage } from "@/lib/actions/leads";
import { LEAD_STAGE_LABELS } from "@/lib/labels";
import type { LeadStage } from "@/generated/prisma/enums";

export function LeadStageSelect({ leadId, stage, stages }: { leadId: string; stage: LeadStage; stages: LeadStage[] }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await updateLeadStage(leadId, fd.get("stage") as string);
      }}
    >
      <select
        name="stage"
        defaultValue={stage}
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full text-xs rounded-md border border-border bg-surface px-2 py-1.5 outline-none"
      >
        {stages.map((s) => (
          <option key={s} value={s}>
            {LEAD_STAGE_LABELS[s]}
          </option>
        ))}
      </select>
    </form>
  );
}
