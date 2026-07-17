import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CalendarClock, Zap, ImageOff, User as UserIcon, ImageIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { computeMetrics, SCORE_COLORS, BUCKET_LABELS } from "@/lib/account-health";
import { formatDate, formatDateTime, CAMPAIGN_CHANGE_TYPE_LABELS } from "@/lib/labels";
import { getSuggestedPlaybooks, DAILY_REVIEW_TAGS, WEEKLY_REVIEW_TAGS } from "@/lib/playbooks";
import { DailyReviewForm } from "./daily-review-form";
import { WeeklyReviewForm } from "./weekly-review-form";
import { ChangeLogForm } from "./change-log-form";

const CREATIVE_TYPES = ["CRIATIVO_NOVO", "CRIATIVO_ALTERADO"];

export default async function ContaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleAccess("gestao-contas");
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, companyName: true, manager: { select: { name: true } } },
  });
  if (!client) notFound();

  const [lastDaily, lastWeekly, lastChange, lastCreative, changes] = await Promise.all([
    prisma.dailyReview.findFirst({ where: { clientId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.weeklyReview.findFirst({ where: { clientId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.campaignChange.findFirst({ where: { clientId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.campaignChange.findFirst({
      where: { clientId: id, type: { in: CREATIVE_TYPES as never } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.campaignChange.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, type: true, description: true, createdAt: true, responsible: { select: { name: true } } },
    }),
  ]);

  const weeklyReports = await prisma.weeklyReview.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, createdAt: true, reportPhotoUrl: true, notes: true, reviewer: { select: { name: true } } },
  });

  const [dailySuggestions, weeklySuggestions] = await Promise.all([
    getSuggestedPlaybooks(DAILY_REVIEW_TAGS),
    getSuggestedPlaybooks(WEEKLY_REVIEW_TAGS),
  ]);

  const metrics = computeMetrics({
    lastDaily: lastDaily?.createdAt ?? null,
    lastWeekly: lastWeekly?.createdAt ?? null,
    lastChange: lastChange?.createdAt ?? null,
    lastCreative: lastCreative?.createdAt ?? null,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/gestao-contas" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground mb-2">
          <ArrowLeft size={15} /> Voltar para Gestão de Contas
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{client.companyName}</h1>
            <p className="text-sm text-foreground-muted mt-0.5 flex items-center gap-1.5">
              <UserIcon size={14} /> {client.manager?.name ?? "Sem gestor responsável"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-foreground-muted mb-1">Score da conta</p>
            <span className={`inline-flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-full ${SCORE_COLORS[metrics.bucket]}`}>
              {metrics.score} · {BUCKET_LABELS[metrics.bucket]}
            </span>
          </div>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={CalendarDays} label="Última revisão diária" value={formatDate(metrics.lastDaily)} alert={metrics.dailyOverdue} />
        <MetricCard icon={CalendarClock} label="Última revisão semanal" value={formatDate(metrics.lastWeekly)} alert={metrics.weeklyOverdue} />
        <MetricCard
          icon={Zap}
          label="Dias sem alteração"
          value={metrics.daysSinceChange !== null ? `${metrics.daysSinceChange} dias` : "—"}
          alert={metrics.changeOverdue}
        />
        <MetricCard
          icon={ImageOff}
          label="Dias sem criativo novo"
          value={metrics.daysSinceCreative !== null ? `${metrics.daysSinceCreative} dias` : "—"}
          alert={metrics.creativeOverdue}
        />
      </div>

      {/* Checklists */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold mb-4">Checklist diário</h2>
          <DailyReviewForm clientId={client.id} suggestions={dailySuggestions} />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold mb-4">Checklist semanal</h2>
          <WeeklyReviewForm clientId={client.id} suggestions={weeklySuggestions} />
        </div>
      </div>

      {/* Registro de alterações */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold">Alterações em campanhas</h2>
          <p className="text-xs text-foreground-muted mt-0.5">
            Cada registro atualiza os &quot;dias sem otimização&quot; e o score da conta.
          </p>
        </div>
        <ChangeLogForm clientId={client.id} />

        {changes.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nenhuma alteração registrada ainda.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {changes.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">
                    {CAMPAIGN_CHANGE_TYPE_LABELS[c.type as keyof typeof CAMPAIGN_CHANGE_TYPE_LABELS]}
                  </p>
                  {c.description && <p className="text-xs text-foreground-muted mt-0.5">{c.description}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-foreground-muted">{formatDateTime(c.createdAt)}</p>
                  <p className="text-xs text-foreground-muted">{c.responsible?.name ?? "—"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Histórico de relatórios semanais (com a foto obrigatória) */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <ImageIcon size={15} className="text-foreground-muted" /> Relatórios semanais enviados
          </h2>
          <p className="text-xs text-foreground-muted mt-0.5">
            Toda revisão semanal exige a foto do relatório — histórico auditável abaixo.
          </p>
        </div>

        {weeklyReports.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nenhum relatório semanal enviado ainda.</p>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {weeklyReports.map((w) => (
              <a
                key={w.id}
                href={w.reportPhotoUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-border overflow-hidden hover:border-accent transition-colors"
              >
                {w.reportPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.reportPhotoUrl} alt={`Relatório de ${formatDateTime(w.createdAt)}`} className="w-full h-32 object-cover" />
                ) : (
                  <div className="w-full h-32 flex items-center justify-center bg-surface-muted text-foreground-muted">
                    <ImageOff size={20} />
                  </div>
                )}
                <div className="p-2.5">
                  <p className="text-xs font-medium">{formatDateTime(w.createdAt)}</p>
                  <p className="text-xs text-foreground-muted">{w.reviewer?.name ?? "—"}</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  alert,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  alert: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className={`flex items-center gap-2 mb-2 ${alert ? "text-red-500" : "text-foreground-muted"}`}>
        <Icon size={15} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-lg font-semibold ${alert ? "text-red-500" : ""}`}>{value}</p>
    </div>
  );
}
