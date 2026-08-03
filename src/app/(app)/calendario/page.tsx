import Link from "next/link";
import { ChevronLeft, ChevronRight, ListChecks, Wallet, FileSignature, Palmtree, CalendarClock, Trash2, Users } from "lucide-react";
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
import { deleteAgendaItem } from "@/lib/actions/agenda";
import { AgendaForm } from "./agenda-form";

const AGENDA_TYPE_LABELS: Record<string, string> = {
  AGENDAMENTO: "Agendamento",
  REUNIAO: "Reunião",
  TEMPO: "Bloqueio de tempo",
};

type CalendarEvent = {
  date: Date;
  label: string;
  type: "tarefa" | "financeiro" | "contrato" | "ferias" | "agenda";
};

const EVENT_STYLES: Record<CalendarEvent["type"], { icon: typeof ListChecks; className: string }> = {
  tarefa: { icon: ListChecks, className: "bg-blue-500/15 text-blue-500" },
  financeiro: { icon: Wallet, className: "bg-amber-500/15 text-amber-500" },
  contrato: { icon: FileSignature, className: "bg-violet-500/15 text-violet-500" },
  ferias: { icon: Palmtree, className: "bg-emerald-500/15 text-emerald-500" },
  agenda: { icon: CalendarClock, className: "bg-rose-500/15 text-rose-500" },
};

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireModuleAccess("calendario");
  const { month } = await searchParams;

  const refDate = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00`) : new Date();
  const monthStart = startOfMonth(refDate);
  const monthEnd = endOfMonth(refDate);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const [tasks, revenues, contracts, vacations, agendaItems] = await Promise.all([
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
    prisma.agendaItem.findMany({
      where: { startAt: { gte: gridStart, lte: gridEnd } },
      include: { owner: { select: { name: true } } },
      orderBy: { startAt: "asc" },
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
    ...agendaItems.map((a) => ({
      date: a.startAt,
      label: `${format(a.startAt, "HH:mm")} ${AGENDA_TYPE_LABELS[a.type]} — ${a.title} (${a.owner.name})`,
      type: "agenda" as const,
    })),
  ];

  // Agrupado por pessoa — pra ficar fácil ver "a agenda da Andriele", "a do Igor" etc.
  const agendaByOwner = new Map<string, typeof agendaItems>();
  for (const item of agendaItems) {
    const list = agendaByOwner.get(item.owner.name) ?? [];
    list.push(item);
    agendaByOwner.set(item.owner.name, list);
  }

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

      {/* Agenda pessoal — cada um adiciona os próprios agendamentos, reuniões e
          bloqueios de tempo, e tudo fica visível pra equipe agrupado por pessoa. */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold mb-4">Adicionar à minha agenda</h2>
        <AgendaForm />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Users size={15} className="text-foreground-muted" /> Agenda da equipe neste mês
          </h2>
          <p className="text-xs text-foreground-muted mt-0.5">Agendamentos, reuniões e bloqueios de tempo, por pessoa.</p>
        </div>

        {agendaByOwner.size === 0 ? (
          <p className="text-sm text-foreground-muted">Nenhum item na agenda neste mês ainda.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {[...agendaByOwner.entries()].map(([ownerName, items]) => (
              <div key={ownerName} className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold mb-2">{ownerName}</p>
                <div className="flex flex-col divide-y divide-border">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 py-2">
                      <div>
                        <p className="text-sm">
                          <span className="text-foreground-muted">{format(item.startAt, "dd/MM HH:mm")}</span>{" "}
                          <span className="text-rose-500 font-medium">{AGENDA_TYPE_LABELS[item.type]}</span> — {item.title}
                        </p>
                        {item.notes && <p className="text-xs text-foreground-muted mt-0.5">{item.notes}</p>}
                      </div>
                      {(item.ownerId === user.id || user.role === "ADMIN") && (
                        <form action={deleteAgendaItem.bind(null, item.id)}>
                          <button type="submit" className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 shrink-0">
                            <Trash2 size={13} />
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
