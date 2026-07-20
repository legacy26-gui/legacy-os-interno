"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Wallet, Clock, Undo2, GripVertical } from "lucide-react";
import { formatCurrency } from "@/lib/labels";
import { markRevenuePaid, markRevenueUnpaid, moveMrrRevenueToDay } from "@/lib/actions/financeiro";
import type { MrrRevenueGroup } from "@/lib/mrr-revenue";

type MrrItem = MrrRevenueGroup["items"][number];

export function MrrBoard({
  monthLabel,
  groups,
  totalMonth,
  paidTotal,
  pendingTotal,
}: {
  monthLabel: string;
  groups: MrrRevenueGroup[];
  totalMonth: number;
  paidTotal: number;
  pendingTotal: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const percent = totalMonth > 0 ? Math.min(100, (paidTotal / totalMonth) * 100) : 0;

  function handleDrop(day: number, e: React.DragEvent) {
    e.preventDefault();
    setDragOverDay(null);
    const revenueId = e.dataTransfer.getData("text/plain");
    if (!revenueId) return;
    setMovingId(revenueId);
    startTransition(async () => {
      await moveMrrRevenueToDay(revenueId, day);
      router.refresh();
      setMovingId(null);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">Faturamento do mês (MRR)</p>
          <p className="text-sm text-foreground-muted mt-0.5 capitalize">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-emerald-500">
            <CheckCircle2 size={14} /> {formatCurrency(paidTotal)} confirmado
          </span>
          <span className="flex items-center gap-1.5 text-amber-500">
            <Clock size={14} /> {formatCurrency(pendingTotal)} pendente
          </span>
        </div>
      </div>

      <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
        <div className="h-full bg-emerald-500" style={{ width: `${percent}%` }} />
      </div>

      <p className="text-xs text-foreground-muted">
        Arraste o card do cliente pra coluna do dia de recebimento certo.
      </p>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {groups.map((g) => (
          <div
            key={g.day}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverDay(g.day);
            }}
            onDragLeave={() => setDragOverDay((d) => (d === g.day ? null : d))}
            onDrop={(e) => handleDrop(g.day, e)}
            className={`flex flex-col gap-2 w-56 shrink-0 rounded-xl border p-2.5 transition-colors ${
              dragOverDay === g.day ? "border-accent bg-accent/5" : "border-border bg-surface-muted/30"
            }`}
          >
            <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wide px-1">
              Dia {String(g.day).padStart(2, "0")}
            </p>

            {g.items.length === 0 ? (
              <div className="flex-1 min-h-[3rem] rounded-lg border border-dashed border-border/70" />
            ) : (
              <div className="flex flex-col gap-1.5">
                {g.items.map((r) => (
                  <MrrCard key={r.id} r={r} moving={movingId === r.id} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MrrCard({ r, moving }: { r: MrrItem; moving: boolean }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
      className={`flex flex-col gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 cursor-grab active:cursor-grabbing transition-opacity ${
        moving ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        <GripVertical size={13} className="text-foreground-muted shrink-0" />
        <span className="text-sm truncate">{r.client.companyName}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{formatCurrency(r.value.toString())}</span>
        {r.status === "PAGO" ? (
          <div className="flex items-center gap-1">
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-500 px-2 py-1 rounded-full bg-emerald-500/15">
              <CheckCircle2 size={12} /> Pago
            </span>
            <form action={markRevenueUnpaid.bind(null, r.id)}>
              <button
                type="submit"
                title="Marcar como não pago"
                className="p-1 rounded-lg hover:bg-red-500/10 text-red-500"
              >
                <Undo2 size={13} />
              </button>
            </form>
          </div>
        ) : (
          <form action={markRevenuePaid.bind(null, r.id)}>
            <button
              type="submit"
              className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg bg-accent text-accent-foreground hover:opacity-90"
            >
              <Wallet size={12} /> Confirmar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
