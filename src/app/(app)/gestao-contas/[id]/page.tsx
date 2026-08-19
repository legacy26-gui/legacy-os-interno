import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CalendarClock,
  Zap,
  ImageOff,
  User as UserIcon,
  ImageIcon,
  ClipboardCheck,
  CheckCircle2,
  Circle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Car,
  Target,
  TrendingUp,
  Lightbulb,
  Trash2,
  Pin,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { computeMetrics, SCORE_COLORS, BUCKET_LABELS } from "@/lib/account-health";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  CAMPAIGN_CHANGE_TYPE_LABELS,
  DAILY_REVIEW_CHECKS,
} from "@/lib/labels";
import { getSuggestedPlaybooks, DAILY_REVIEW_TAGS, WEEKLY_REVIEW_TAGS } from "@/lib/playbooks";
import { monthKey, weekOfMonthFor, weeksInMonth, weekRange } from "@/lib/month-weeks";
import { getOpportunities, OPPORTUNITY_COLORS, OPPORTUNITY_LABELS } from "@/lib/opportunities";
import { deleteClientSale, deletePinnedInfo } from "@/lib/actions/client-sales";
import { DailyReviewForm } from "./daily-review-form";
import { WeeklyReviewForm } from "./weekly-review-form";
import { ChangeLogForm } from "./change-log-form";
import { SaleForm } from "./sale-form";
import { PinnedInfoForm } from "./pinned-info-form";

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export default async function ContaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireModuleAccess("gestao-contas");
  const { id } = await params;
  const { month } = await searchParams;

  // Gestor de tráfego chega aqui pelo Meu Dia e não tem Gestão de Contas no
  // menu — o "voltar" dele precisa levar de volta pro Meu Dia.
  const voltarPara = user.role === "GESTOR_TRAFEGO" ? "/meu-dia" : "/gestao-contas";
  const voltarLabel = user.role === "GESTOR_TRAFEGO" ? "Voltar para Meu Dia" : "Voltar para Gestão de Contas";

  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      companyName: true,
      city: true,
      state: true,
      manager: { select: { name: true } },
      pinnedInfo: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!client) notFound();

  // Mês em foco — a página inteira (vendas, semanas, observações) segue ele.
  const now = new Date();
  const refDate = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00Z`) : now;
  const mesAtual = monthKey(refDate);
  const monthStart = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 1));
  const prevDate = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - 1, 1));
  const nextDate = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 1));
  const isCurrentMonth = mesAtual === monthKey(now);
  const monthLabelRaw = refDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);

  const [lastDaily, lastWeekly, lastChange, changes, todayDaily, lastSale] = await Promise.all([
    prisma.dailyReview.findFirst({ where: { clientId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.weeklyReview.findFirst({ where: { clientId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.campaignChange.findFirst({ where: { clientId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.campaignChange.findMany({
      where: { clientId: id, createdAt: { gte: monthStart, lt: monthEnd } },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, description: true, createdAt: true, responsible: { select: { name: true } } },
    }),
    prisma.dailyReview.findFirst({
      where: { clientId: id, createdAt: { gte: startOfToday() } },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        checkedBalance: true,
        checkedDailyBudget: true,
        checkedTodaySpend: true,
        checkedBillingLimit: true,
        checkedPendingPayments: true,
        checkedWhatsappResolved: true,
        photoUrl: true,
        notes: true,
        reviewer: { select: { name: true } },
      },
    }),
    prisma.clientSale.findFirst({ where: { clientId: id }, orderBy: { soldAt: "desc" }, select: { soldAt: true } }),
  ]);

  const [weeklyReviews, dailyReviews, sales, salesPrevMonth] = await Promise.all([
    // Revisões do mês: as novas trazem refMonth; as antigas caem pelo createdAt.
    prisma.weeklyReview.findMany({
      where: {
        clientId: id,
        OR: [{ refMonth: mesAtual }, { refMonth: null, createdAt: { gte: monthStart, lt: monthEnd } }],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        weekOfMonth: true,
        reportPhotoUrl: true,
        notes: true,
        paymentCleared: true,
        reportGenerated: true,
        checkedBestCampaigns: true,
        checkedWeeklyCost: true,
        definedNewCreatives: true,
        definedNewCampaigns: true,
        reviewer: { select: { name: true } },
      },
    }),
    prisma.dailyReview.findMany({
      where: { clientId: id, createdAt: { gte: monthStart, lt: monthEnd } },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, photoUrl: true, notes: true, reviewer: { select: { name: true } } },
    }),
    prisma.clientSale.findMany({
      where: { clientId: id, soldAt: { gte: monthStart, lt: monthEnd } },
      orderBy: { soldAt: "desc" },
      select: { id: true, description: true, value: true, adSpend: true, soldAt: true },
    }),
    prisma.clientSale.findMany({
      where: {
        clientId: id,
        soldAt: {
          gte: new Date(Date.UTC(prevDate.getUTCFullYear(), prevDate.getUTCMonth(), 1)),
          lt: monthStart,
        },
      },
      select: { value: true, adSpend: true },
    }),
  ]);

  const [dailySuggestions, weeklySuggestions] = await Promise.all([
    getSuggestedPlaybooks(DAILY_REVIEW_TAGS),
    getSuggestedPlaybooks(WEEKLY_REVIEW_TAGS),
  ]);

  const metrics = computeMetrics({
    lastDaily: lastDaily?.createdAt ?? null,
    lastWeekly: lastWeekly?.createdAt ?? null,
    lastChange: lastChange?.createdAt ?? null,
  });

  // Relatório de vendas do mês
  const qtdVendas = sales.length;
  const valorVendido = sales.reduce((s, v) => s + Number(v.value), 0);
  const investido = sales.reduce((s, v) => s + Number(v.adSpend), 0);
  const custoPorVenda = qtdVendas > 0 ? investido / qtdVendas : null;
  const ticketMedio = qtdVendas > 0 ? valorVendido / qtdVendas : null;
  const investidoPrev = salesPrevMonth.reduce((s, v) => s + Number(v.adSpend), 0);
  const custoPorVendaPrev = salesPrevMonth.length > 0 ? investidoPrev / salesPrevMonth.length : null;
  const roas = investido > 0 ? valorVendido / investido : null;

  // Semanas do mês, com a revisão de cada uma
  const totalSemanas = weeksInMonth(refDate);
  const semanas = Array.from({ length: totalSemanas }, (_, i) => {
    const week = i + 1;
    const { from, to } = weekRange(refDate, week);
    const revisoes = weeklyReviews.filter(
      (r) => (r.weekOfMonth ?? weekOfMonthFor(r.createdAt)) === week
    );
    return { week, from, to, revisoes };
  });
  const semanasPreenchidas = semanas.filter((s) => s.revisoes.length > 0).length;

  const diasSemVenda = lastSale
    ? Math.floor((now.getTime() - lastSale.soldAt.getTime()) / 86_400_000)
    : null;

  const oportunidade = getOpportunities({
    diasSemVenda,
    vendasNoMes: qtdVendas,
    investidoNoMes: investido,
    faturadoNoMes: valorVendido,
    custoPorVendaMes: custoPorVenda,
    custoPorVendaMesAnterior: custoPorVendaPrev,
    dailyOverdue: metrics.dailyOverdue,
    semanasPreenchidas,
    semanasDoMes: totalSemanas,
  });

  const observacoesDoMes = dailyReviews.filter((d) => d.notes);
  const defaultWeek = isCurrentMonth ? weekOfMonthFor(now) : 1;
  // Se a semana em curso ainda não tem revisão, o formulário já aparece aberto:
  // é trabalho pendente. Caso contrário fica recolhido pra não poluir a análise.
  const semanaAtualPendente =
    isCurrentMonth && (semanas.find((s) => s.week === defaultWeek)?.revisoes.length ?? 0) === 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={voltarPara} className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground mb-2">
          <ArrowLeft size={15} /> {voltarLabel}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{client.companyName}</h1>
            <p className="text-sm text-foreground-muted mt-0.5 flex items-center gap-1.5">
              <UserIcon size={14} /> {client.manager?.name ?? "Sem gestor responsável"}
              {client.city && ` · ${client.city}${client.state ? "/" + client.state : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-foreground-muted mb-1">Score da conta</p>
              <span className={`inline-flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-full ${SCORE_COLORS[metrics.bucket]}`}>
                {metrics.score} · {BUCKET_LABELS[metrics.bucket]}
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-foreground-muted mb-1">Oportunidade</p>
              <span
                className={`inline-flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-full ${OPPORTUNITY_COLORS[oportunidade.level]}`}
              >
                {oportunidade.score} · {OPPORTUNITY_LABELS[oportunidade.level]}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Informações fixadas — o que a equipe precisa ter sempre à vista */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium flex items-center gap-1.5">
            <Pin size={13} /> Informações do cliente
          </p>
          <PinnedInfoForm clientId={client.id} />
        </div>
        {client.pinnedInfo.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            Nada fixado ainda. Use pra deixar à vista o que sempre precisa saber — verba diária, cidade, contato do
            dono, horário de atendimento.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {client.pinnedInfo.map((info) => (
              <div
                key={info.id}
                className="group flex items-center gap-2 rounded-xl border border-border bg-surface-muted/40 pl-3 pr-1.5 py-2"
              >
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-foreground-muted font-medium">{info.label}</p>
                  <p className="text-sm font-medium">{info.value}</p>
                </div>
                <form action={deletePinnedInfo.bind(null, client.id, info.id)}>
                  <button
                    type="submit"
                    title="Remover"
                    className="p-1 rounded-lg text-foreground-muted hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={12} />
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* O trabalho de hoje vem antes de tudo: a gestora abre o cliente e já
          faz a tarefa do dia aqui, sem precisar voltar pro Meu Dia. */}
      <div
        className={`rounded-2xl border p-5 ${
          todayDaily ? "border-emerald-500/30 bg-emerald-500/5" : "border-accent/40 bg-accent/5"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <ClipboardCheck size={15} className={todayDaily ? "text-emerald-500" : "text-accent"} />
            Checklist de hoje
          </h2>
          {todayDaily ? (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center gap-1.5">
              <CheckCircle2 size={12} /> Feito por {todayDaily.reviewer?.name ?? "—"} às{" "}
              {formatDateTime(todayDaily.createdAt)}
            </span>
          ) : (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-500/15 text-red-500 flex items-center gap-1.5">
              <AlertCircle size={12} /> Pendente hoje
            </span>
          )}
        </div>

        {todayDaily ? (
          <div className="flex flex-col gap-3">
            <div className="grid sm:grid-cols-2 gap-x-8">
              {DAILY_REVIEW_CHECKS.map(([key, label]) => (
                <CheckRow key={key} checked={todayDaily[key]} label={label} />
              ))}
            </div>
            {todayDaily.notes && <p className="text-xs text-foreground-muted">Obs: {todayDaily.notes}</p>}
            {todayDaily.photoUrl ? (
              <a href={todayDaily.photoUrl} target="_blank" rel="noreferrer" className="inline-block w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={todayDaily.photoUrl} alt="Foto da campanha de hoje" className="max-h-40 rounded-lg border border-border" />
              </a>
            ) : (
              <p className="text-xs text-foreground-muted flex items-center gap-1.5">
                <ImageOff size={13} /> Sem foto registrada
              </p>
            )}
            <details className="mt-1">
              <summary className="text-xs text-foreground-muted cursor-pointer hover:text-foreground w-fit">
                Preencher outra revisão hoje
              </summary>
              <div className="mt-3 pt-3 border-t border-border">
                <DailyReviewForm clientId={client.id} suggestions={dailySuggestions} />
              </div>
            </details>
          </div>
        ) : (
          <DailyReviewForm clientId={client.id} suggestions={dailySuggestions} />
        )}
      </div>

      {/* Navegação por mês */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">Acompanhamento de {monthLabel}</p>
        <div className="flex items-center gap-2">
          <Link
            href={`/gestao-contas/${client.id}?month=${monthKey(prevDate)}`}
            className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors"
            title="Mês anterior"
          >
            <ChevronLeft size={16} />
          </Link>
          <span className="px-3 py-2 rounded-lg border border-border bg-surface text-sm font-medium min-w-[9rem] text-center">
            {monthLabel}
          </span>
          {!isCurrentMonth && (
            <Link
              href={`/gestao-contas/${client.id}`}
              className="px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors text-sm font-medium"
            >
              Hoje
            </Link>
          )}
          <Link
            href={`/gestao-contas/${client.id}?month=${monthKey(nextDate)}`}
            className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors"
            title="Próximo mês"
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      {/* Oportunidades */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium flex items-center gap-1.5">
          <Lightbulb size={13} /> Oportunidades
        </p>
        {oportunidade.opportunities.length === 0 ? (
          <p className="text-sm text-emerald-500 flex items-center gap-1.5">
            <CheckCircle2 size={15} /> Nenhum sinal de alerta — conta rodando bem.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {oportunidade.opportunities.map((o) => (
              <div key={o.key} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${OPPORTUNITY_COLORS[o.level]}`}>
                  {o.level.toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-medium">{o.label}</p>
                  <p className="text-xs text-foreground-muted mt-0.5">{o.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vendas do mês */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="p-5 border-b border-border">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium flex items-center gap-1.5">
            <Car size={13} /> Vendas de {monthLabel}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border border-b border-border">
          <SaleStat icon={Car} label="Vendidos" value={String(qtdVendas)} />
          <SaleStat icon={TrendingUp} label="Valor vendido" value={formatCurrency(valorVendido)} accent="emerald" />
          <SaleStat icon={Target} label="Investido em anúncio" value={formatCurrency(investido)} accent="red" />
          <SaleStat
            icon={Target}
            label="Custo por venda"
            value={custoPorVenda === null ? "—" : formatCurrency(custoPorVenda)}
          />
          <SaleStat
            icon={TrendingUp}
            label="Retorno (ROAS)"
            value={roas === null ? "—" : `${roas.toFixed(1)}x`}
            hint={ticketMedio !== null ? `ticket médio ${formatCurrency(ticketMedio)}` : undefined}
          />
        </div>

        <div className="p-5 border-b border-border">
          <SaleForm
            clientId={client.id}
            defaultDate={(isCurrentMonth ? now : monthStart).toISOString().slice(0, 10)}
          />
        </div>

        {sales.length === 0 ? (
          <p className="text-sm text-foreground-muted p-5">Nenhuma venda registrada neste mês.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {sales.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{v.description ?? "Venda"}</p>
                  <p className="text-xs text-foreground-muted">
                    {formatDate(v.soldAt)} · investido {formatCurrency(v.adSpend.toString())}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-emerald-500">
                    {formatCurrency(v.value.toString())}
                  </span>
                  <form action={deleteClientSale.bind(null, client.id, v.id)}>
                    <button
                      type="submit"
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-foreground-muted hover:text-red-500"
                      title="Excluir venda"
                    >
                      <Trash2 size={13} />
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Indicadores de acompanhamento */}
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
          icon={Car}
          label="Dias sem vender"
          value={diasSemVenda !== null ? `${diasSemVenda} dias` : "—"}
          alert={diasSemVenda === null || diasSemVenda >= 7}
        />
      </div>

      {/* Semana a semana do mês */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold">Semana a semana — {monthLabel}</h2>
          <p className="text-xs text-foreground-muted mt-0.5">
            {semanasPreenchidas} de {totalSemanas} semanas com revisão preenchida.
          </p>
        </div>

        {/* A revisão semanal fica junto da visão das semanas: é aqui que a
            gestora vê o que falta e preenche, sem trocar de tela. */}
        <details
          open={semanaAtualPendente}
          className={`rounded-xl border p-4 ${
            semanaAtualPendente ? "border-accent/40 bg-accent/5" : "border-border"
          }`}
        >
          <summary className="cursor-pointer text-sm font-medium flex items-center gap-2">
            <ClipboardCheck size={15} />
            {semanaAtualPendente
              ? `Preencher revisão da semana ${defaultWeek}`
              : "Preencher revisão semanal"}
            {semanaAtualPendente && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-500">
                Pendente
              </span>
            )}
          </summary>
          <div className="mt-4">
            <WeeklyReviewForm
              clientId={client.id}
              suggestions={weeklySuggestions}
              refMonth={mesAtual}
              weeks={semanas.map(({ week, from, to }) => ({ week, from, to }))}
              defaultWeek={defaultWeek}
            />
          </div>
        </details>

        <div className="grid sm:grid-cols-2 gap-4">
          {semanas.map((s) => (
            <div
              key={s.week}
              className={`rounded-xl border p-4 flex flex-col gap-2 ${
                s.revisoes.length > 0 ? "border-border" : "border-dashed border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Semana {s.week}</p>
                <span className="text-xs text-foreground-muted">
                  dias {s.from} a {s.to}
                </span>
              </div>

              {s.revisoes.length === 0 ? (
                <p className="text-xs text-foreground-muted flex items-center gap-1.5">
                  <Circle size={12} /> Sem revisão nesta semana
                </p>
              ) : (
                s.revisoes.map((r) => (
                  <div key={r.id} className="flex flex-col gap-2 border-t border-border pt-2 first:border-0 first:pt-0">
                    <p className="text-xs text-emerald-500 flex items-center gap-1.5">
                      <CheckCircle2 size={12} /> {r.reviewer?.name ?? "—"} · {formatDate(r.createdAt)}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(
                        [
                          [r.paymentCleared, "Pagamento"],
                          [r.reportGenerated, "Relatório"],
                          [r.checkedBestCampaigns, "Campanhas"],
                          [r.checkedWeeklyCost, "Custo"],
                          [r.definedNewCreatives, "Criativos"],
                          [r.definedNewCampaigns, "Novas campanhas"],
                        ] as [boolean, string][]
                      ).map(([ok, label]) => (
                        <span
                          key={label}
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            ok ? "bg-emerald-500/15 text-emerald-500" : "bg-surface-muted text-foreground-muted"
                          }`}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    {r.notes && <p className="text-xs text-foreground-muted">Obs: {r.notes}</p>}
                    {r.reportPhotoUrl && (
                      <a href={r.reportPhotoUrl} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.reportPhotoUrl}
                          alt={`Relatório da semana ${s.week}`}
                          className="max-h-28 rounded-lg border border-border"
                        />
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Observações das revisões diárias do mês */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold">Observações do mês</h2>
          <p className="text-xs text-foreground-muted mt-0.5">
            Tudo que a equipe anotou nas revisões diárias de {monthLabel}.
          </p>
        </div>
        {observacoesDoMes.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nenhuma observação registrada neste mês.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {observacoesDoMes.map((d) => (
              <div key={d.id} className="py-2.5">
                <p className="text-xs text-foreground-muted">
                  {formatDateTime(d.createdAt)} · {d.reviewer?.name ?? "—"}
                </p>
                <p className="text-sm mt-0.5">{d.notes}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Registro de alterações */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold">Alterações em campanhas — {monthLabel}</h2>
          <p className="text-xs text-foreground-muted mt-0.5">
            Cada registro atualiza os &quot;dias sem otimização&quot; e o score da conta.
          </p>
        </div>
        <ChangeLogForm clientId={client.id} />

        {changes.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nenhuma alteração registrada neste mês.</p>
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

      {/* Fotos de campanha do mês */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <ImageIcon size={15} className="text-foreground-muted" /> Fotos de campanha — {monthLabel}
          </h2>
          <p className="text-xs text-foreground-muted mt-0.5">
            Toda revisão diária exige a foto da campanha — histórico auditável abaixo.
          </p>
        </div>

        {dailyReviews.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nenhuma revisão diária neste mês.</p>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {dailyReviews.map((d) => (
              <a
                key={d.id}
                href={d.photoUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-border overflow-hidden hover:border-accent transition-colors"
              >
                {d.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.photoUrl} alt={`Campanha de ${formatDateTime(d.createdAt)}`} className="w-full h-32 object-cover" />
                ) : (
                  <div className="w-full h-32 flex items-center justify-center bg-surface-muted text-foreground-muted">
                    <ImageOff size={20} />
                  </div>
                )}
                <div className="p-2.5">
                  <p className="text-xs font-medium">{formatDateTime(d.createdAt)}</p>
                  <p className="text-xs text-foreground-muted">{d.reviewer?.name ?? "—"}</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SaleStat({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof Car;
  label: string;
  value: string;
  hint?: string;
  accent?: "emerald" | "red";
}) {
  const color = accent === "emerald" ? "text-emerald-500" : accent === "red" ? "text-red-500" : "";
  return (
    <div className="p-5">
      <div className="flex items-center gap-2 text-foreground-muted mb-2">
        <Icon size={14} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
      {hint && <p className="text-xs text-foreground-muted mt-0.5">{hint}</p>}
    </div>
  );
}

function CheckRow({ checked, label }: { checked: boolean; label: string }) {
  return (
    <p className={`flex items-center gap-2 py-0.5 text-sm ${checked ? "" : "text-foreground-muted"}`}>
      {checked ? (
        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
      ) : (
        <Circle size={14} className="shrink-0" />
      )}
      {label}
    </p>
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
