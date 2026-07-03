import Link from "next/link";
import { ChevronLeft, ChevronRight, ListChecks, Wallet, FileSignature, Palmtree } from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isWithinInterval,
  format,
  addMonths,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

type CalendarEvent = {
  date: Date;
  label: string;
  type: "tarefa" | "financeiro" | "contrato" | "ferias";
};

const EVENT_STYLES: Record<CalendarEvent["type"], { icon: typeof ListChecks; className: string }> = {
  tarefa: { icon: ListChecks, className: "bg-blue-500/15 text-blue-500" },
  financeiro: { icon: Wallet, className: "bg-amber-500/15 text-amber-500" },
  contrato: { icon: FileSignature, className: "bg-violet-500/15 text-violet-500" },
  ferias: { icon: Palmtree, className: "bg-emerald-500/15 text-emerald-500" },
};

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireModuleAccess("calendario");
  const { month } = await searchParams;

  const refDate = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00`) : new Date();
  const monthStart = startOfMonth(refDate);
  const monthEnd = endOfMonth(refDate);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const [tasks, revenues, contracts, vacations] = await Promise.all([
    prisma.task.findMany({
      where: { dueDate: { gte: gridStart, lte: gridEnd } },
      include: { client: { select: { companyName: true } } },
    }),
    prisma.revenue.findMany({
      where: { dueDate: { gte: gridStart, lte: gridEnd }, status: { not: "PAGO" } },
      include: { client: { select: { companyName: true } } },
    }),
    prisma.contract.findMany({
      where: { status: "AGUARDANDO_ASSINATURA", sentAt: { gte: gridStart, lte: gridEnd } },
      include: { client: { select: { companyName: true } } },
    }),
    prisma.vacation.findMany({
      where: { startDate: { lte: gridEnd }, endDate: { gte: gridStart } },
      include: { employee: { select: { name: true } } },
    }),
  ]);

  const events: CalendarEvent[] = [
    ...tasks.map((t) => ({
      date: t.dueDate as Date,
      label: `${t.title}${t.client ? ` — ${t.client.companyName}` : ""}`,
      type: "tarefa" as const,
    })),
    ...revenues.map((r) => ({
      date: r.dueDate,
      label: `${r.client.companyName} — ${r.description}`,
      type: "financeiro" as const,
    })),
    ...contracts.map((c) => ({
      date: c.sentAt as Date,
      label: `Contrato ${c.client.companyName} aguardando assinatura`,
      type: "contrato" as const,
    })),
  ];

  const vacationDays = days.filter((day) =>
    vacations.some((v) => isWithinInterval(day, { start: v.startDate, end: v.endDate }))
  );
  for (const day of vacationDays) {
    const onVacation = vacations.filter((v) => isWithinInterval(day, { start: v.startDate, end: v.endDate }));
    for (const v of onVacation) {
      events.push({ date: day, label: `${v.employee.name} de férias`, type: "ferias" });
    }
  }

  const today = new Date();
  const monthLabelRaw = format(monthStart, "MMMM 'de' yyyy", { locale: ptBR });
  const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);
  const prevMonth = format(subMonths(monthStart, 1), "yyyy-MM");
  const nextMonth = format(addMonths(monthStart, 1), "yyyy-MM");
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{monthLabel}</h1>
          <p className="text-sm text-foreground-muted mt-0.5">Prazos, contratos, financeiro e férias da equipe</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/calendario?month=${prevMonth}`}
            className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors"
          >
            <ChevronLeft size={16} />
          </Link>
          <Link
            href="/calendario"
            className="px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors text-sm font-medium"
          >
            Hoje
          </Link>
          <Link
            href={`/calendario?month=${nextMonth}`}
            className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors"
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {weekDays.map((d) => (
            <div key={d} className="px-2 py-2.5 text-center text-xs font-medium text-foreground-muted uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayEvents = events.filter((e) => isSameDay(e.date, day));
            const inMonth = isSameMonth(day, monthStart);
            const isToday = isSameDay(day, today);
            return (
              <div
                key={day.toISOString()}
                className={`min-h-[100px] border-b border-r border-border p-1.5 flex flex-col gap-1 ${
                  inMonth ? "" : "opacity-40"
                }`}
              >
                <span
                  className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday ? "bg-accent text-white" : "text-foreground-muted"
                  }`}
                >
                  {format(day, "d")}
                </span>
                <div className="flex flex-col gap-1">
                  {dayEvents.slice(0, 3).map((e, i) => {
                    const { icon: Icon, className } = EVENT_STYLES[e.type];
                    return (
                      <span
                        key={i}
                        title={e.label}
                        className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded truncate ${className}`}
                      >
                        <Icon size={10} className="shrink-0" />
                        <span className="truncate">{e.label}</span>
                      </span>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] text-foreground-muted px-1.5">+{dayEvents.length - 3} mais</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
