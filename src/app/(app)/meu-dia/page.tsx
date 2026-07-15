import Link from "next/link";
import { ClipboardList, PartyPopper, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { computeMetrics, SCORE_COLORS } from "@/lib/account-health";
import { ClientChecklistRow } from "./client-checklist-row";

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfWeekAgo() {
  return new Date(Date.now() - 7 * 86_400_000);
}

export default async function MeuDiaPage() {
  const user = await getCurrentUser();

  const clients = await prisma.client.findMany({
    where: { managerId: user.id, status: { not: "CANCELADO" } },
    select: {
      id: true,
      companyName: true,
      dailyReviews: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      weeklyReviews: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      campaignChanges: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
    orderBy: { companyName: "asc" },
  });

  const todayStart = startOfToday();
  const weekAgo = startOfWeekAgo();

  const rows = clients.map((c) => {
    const lastDaily = c.dailyReviews[0]?.createdAt ?? null;
    const lastWeekly = c.weeklyReviews[0]?.createdAt ?? null;
    const lastChange = c.campaignChanges[0]?.createdAt ?? null;
    const metrics = computeMetrics({ lastDaily, lastWeekly, lastChange, lastCreative: lastChange });
    return {
      id: c.id,
      companyName: c.companyName,
      score: metrics.score,
      bucket: metrics.bucket,
      dailyDoneToday: !!lastDaily && lastDaily >= todayStart,
      weeklyDoneThisWeek: !!lastWeekly && lastWeekly >= weekAgo,
    };
  });

  // Pendentes primeiro — ninguém fica esquecido.
  rows.sort((a, b) => Number(a.dailyDoneToday) - Number(b.dailyDoneToday) || a.companyName.localeCompare(b.companyName));

  const doneCount = rows.filter((r) => r.dailyDoneToday).length;
  const total = rows.length;
  const allDone = total > 0 && doneCount === total;
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ClipboardList size={20} className="text-accent" /> Meu Dia
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">Checklist diário dos seus clientes — {user.name.split(" ")[0]}</p>
      </div>

      {total > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">
              {doneCount} de {total} clientes revisados hoje
            </p>
            <span className="text-sm font-semibold text-foreground-muted">{percent}%</span>
          </div>
          <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
            <div
              className={`h-full transition-all ${allDone ? "bg-emerald-500" : "bg-accent"}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {total === 0 && (
        <p className="text-sm text-foreground-muted rounded-2xl border border-border bg-surface p-8 text-center">
          Nenhum cliente atribuído a você ainda. Fale com seu gestor para receber sua carteira.
        </p>
      )}

      {allDone && total > 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 flex items-center gap-3">
          <PartyPopper size={20} className="text-emerald-500" />
          <p className="text-sm font-medium text-emerald-500">Todos os clientes revisados hoje. Mandou bem!</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <ClientChecklistRow
            key={r.id}
            clientId={r.id}
            companyName={r.companyName}
            score={r.score}
            scoreClass={SCORE_COLORS[r.bucket]}
            dailyDoneToday={r.dailyDoneToday}
            weeklyDoneThisWeek={r.weeklyDoneThisWeek}
          />
        ))}
      </div>

      {total > 0 && (
        <Link
          href="/gestao-contas"
          className="self-start inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground"
        >
          <ExternalLink size={14} /> Ver revisão semanal, relatórios e histórico completo
        </Link>
      )}
    </div>
  );
}
