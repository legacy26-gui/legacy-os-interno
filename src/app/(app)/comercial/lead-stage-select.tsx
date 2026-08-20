"use client";

import { useRef, useTransition } from "react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { updateLeadStage } from "@/lib/actions/leads";
import { LEAD_STAGE_LABELS } from "@/lib/labels";
import type { LeadStage } from "@/generated/prisma/enums";

// Caminho normal do funil. "Perdido" fica fora: não é a etapa seguinte de
// ninguém, é uma saída — por isso tem botão próprio.
const FUNIL: LeadStage[] = ["LEAD", "CONTATO", "REUNIAO", "PROPOSTA", "NEGOCIACAO", "FECHADO"];

export function LeadStageSelect({ leadId, stage, stages }: { leadId: string; stage: LeadStage; stages: LeadStage[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  const posicao = FUNIL.indexOf(stage);
  const anterior = posicao > 0 ? FUNIL[posicao - 1] : null;
  const proxima = posicao >= 0 && posicao < FUNIL.length - 1 ? FUNIL[posicao + 1] : null;
  const perdido = stage === "PERDIDO";

  function mover(destino: LeadStage) {
    startTransition(async () => {
      await updateLeadStage(leadId, destino);
    });
  }

  return (
    <div className={`flex flex-col gap-1.5 ${pending ? "opacity-50 pointer-events-none" : ""}`}>
      {/* No celular as etapas ficam empilhadas, então avançar é "descer";
          no computador elas ficam lado a lado, e avançar é ir pra direita. */}
      <div className="flex gap-1.5">
        {perdido ? (
          <MoveButton onClick={() => mover("LEAD")} label="Reabrir como lead" icon="reabrir" />
        ) : (
          <>
            {anterior && (
              <MoveButton onClick={() => mover(anterior)} label={LEAD_STAGE_LABELS[anterior]} icon="voltar" />
            )}
            {proxima && (
              <MoveButton onClick={() => mover(proxima)} label={LEAD_STAGE_LABELS[proxima]} icon="avancar" destaque />
            )}
          </>
        )}
      </div>

      <div className="flex gap-1.5">
        {/* O seletor continua pra pular etapas (ex: direto pra Fechado). */}
        <form
          ref={formRef}
          className="flex-1 min-w-0"
          action={async (fd) => {
            await updateLeadStage(leadId, fd.get("stage") as string);
          }}
        >
          <select
            name="stage"
            value={stage}
            onChange={() => formRef.current?.requestSubmit()}
            className="w-full text-xs rounded-md border border-border bg-surface px-2 py-2.5 md:py-2 outline-none"
          >
            {stages.map((s) => (
              <option key={s} value={s}>
                {LEAD_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </form>

        {!perdido && stage !== "FECHADO" && (
          <button
            type="button"
            onClick={() => mover("PERDIDO")}
            className="text-xs px-3 py-2.5 md:py-2 rounded-md border border-border text-foreground-muted hover:text-red-500 hover:border-red-500/40 transition-colors shrink-0"
          >
            Perdido
          </button>
        )}
      </div>
    </div>
  );
}

function MoveButton({
  onClick,
  label,
  icon,
  destaque,
}: {
  onClick: () => void;
  label: string;
  icon: "voltar" | "avancar" | "reabrir";
  destaque?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={icon === "reabrir" ? label : icon === "avancar" ? `Mover para ${label}` : `Voltar para ${label}`}
      className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1 text-xs font-medium px-2 py-3 md:py-2 rounded-md transition-colors ${
        destaque
          ? "bg-accent text-accent-foreground hover:opacity-90"
          : "border border-border text-foreground-muted hover:bg-surface hover:text-foreground"
      }`}
    >
      {icon === "reabrir" && <RotateCcw size={13} className="shrink-0" />}
      {icon === "voltar" && (
        <>
          <ChevronUp size={14} className="shrink-0 md:hidden" />
          <ChevronLeft size={14} className="shrink-0 hidden md:block" />
        </>
      )}
      <span className="truncate">{label}</span>
      {icon === "avancar" && (
        <>
          <ChevronDown size={14} className="shrink-0 md:hidden" />
          <ChevronRight size={14} className="shrink-0 hidden md:block" />
        </>
      )}
    </button>
  );
}
