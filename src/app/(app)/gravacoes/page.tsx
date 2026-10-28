import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Video,
  PackageCheck,
  AlertTriangle,
} from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfDay,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
  addMonths,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { empresaAtual } from "@/lib/empresa-atual";
import { CARTEIRA } from "@/lib/carteira";
import { GravacaoForm } from "./gravacao-form";
import { GravacaoLinha, type GravacaoNaTela } from "./gravacao-linha";

// Calendário das gravações — separado do Calendário geral de propósito.
//
// São dois assuntos diferentes: lá é prazo, contrato, financeiro e férias da
// equipe; aqui é produção de vídeo. Juntos, um escondia o outro.
//
// O quadro mostra duas coisas: no dia da gravação, o que foi gravado; no dia
// do vencimento, o que tem que ser entregue. O prazo da casa é D+1.

export default async function GravacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireModuleAccess("calendario");
  const empresa = await empresaAtual();
  const { month } = await searchParams;

  const hoje = new Date();
  const hojeZero = startOfDay(hoje);

  const refDate = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00`) : hoje;
  const monthStart = startOfMonth(refDate);
  const monthEnd = endOfMonth(refDate);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const [gravacoes, pendentes, lojas] = await Promise.all([
    // Pela gravação OU pela entrega: gravação do dia 31 entrega no dia 1, e a
    // marca de "entregar" tem que aparecer no mês em que ela cai.
    prisma.gravacao.findMany({
      where: {
        empresa,
        OR: [
          { gravadoEm: { gte: gridStart, lte: gridEnd } },
          { entregaEm: { gte: gridStart, lte: gridEnd } },
        ],
      },
      include: { owner: { select: { name: true } } },
      orderBy: { gravadoEm: "asc" },
    }),
    // O que está devendo entrega, independente do mês aberto na tela.
    //
    // Consulta separada de propósito: a de cima só pega o mês que está sendo
    // olhado, e dívida não respeita mês. Sem isto, virar a página pro mês
    // seguinte escondia a entrega que ninguém fez — que é justamente a que
    // precisa aparecer.
    prisma.gravacao.findMany({
      where: {
        empresa,
        entregueEm: null,
        entregaEm: { lt: new Date(hojeZero.getTime() + 24 * 60 * 60 * 1000) },
      },
      orderBy: { entregaEm: "asc" },
      take: 30,
    }),
    // A carteira de lojas é da agência. No Treinamentos o nome é digitado.
    empresa === "AGENCIA"
      ? prisma.client.findMany({
          where: CARTEIRA,
          select: { id: true, companyName: true },
          orderBy: { companyName: "asc" },
        })
      : [],
  ]);

  // A lista usa o mês fechado (e não a grade, que pega dias dos meses
  // vizinhos), senão a mesma gravação apareceria em dois meses seguidos.
  const doMes = gravacoes.filter((g) => isSameMonth(g.gravadoEm, monthStart));

  const paraTela = (g: (typeof gravacoes)[number]): GravacaoNaTela => ({
    id: g.id,
    clientId: g.clientId,
    loja: g.loja,
    quantidade: g.quantidade,
    // Formatado aqui no servidor: é a mesma função que desenha a lista, então
    // o campo do formulário abre com o horário que a pessoa está vendo.
    dataForm: format(g.gravadoEm, "yyyy-MM-dd"),
    horaForm: format(g.gravadoEm, "HH:mm"),
    entregaForm: format(g.entregaEm, "yyyy-MM-dd"),
    horaLabel: format(g.gravadoEm, "HH:mm"),
    entregaLabel: format(g.entregaEm, "dd/MM"),
    entregue: g.entregueEm !== null,
    atrasada: g.entregueEm === null && g.entregaEm < hojeZero,
    observacao: g.observacao,
    ownerName: g.owner?.name ?? null,
    // Apagar é de quem lançou, ou do administrador — a ação no servidor
    // confere de novo; isto aqui só evita mostrar botão que não funciona.
    podeApagar: g.ownerId === user.id || user.role === "ADMIN",
  });

  // Agrupado por dia, do mais recente pro mais antigo: é como a equipe olha.
  const porDia = new Map<string, GravacaoNaTela[]>();
  for (const g of [...doMes].sort((a, b) => b.gravadoEm.getTime() - a.gravadoEm.getTime())) {
    const chave = format(g.gravadoEm, "yyyy-MM-dd");
    const lista = porDia.get(chave) ?? [];
    lista.push(paraTela(g));
    porDia.set(chave, lista);
  }

  const videosNoMes = doMes.reduce((s, g) => s + g.quantidade, 0);
  const atrasadas = pendentes.filter((g) => g.entregaEm < hojeZero);
  const aEntregarHoje = pendentes.filter((g) => isSameDay(g.entregaEm, hoje));

  // Marcas do quadro: o que foi gravado no dia, e o que vence pra entregar.
  // Entrega já feita não entra — o quadro mostra o que ainda se deve, não
  // histórico. O que foi entregue continua na lista, marcado em verde.
  type Marca = { date: Date; label: string; tipo: "gravacao" | "entrega" };
  const marcas: Marca[] = [
    ...gravacoes.map((g) => ({
      date: g.gravadoEm,
      label: `${format(g.gravadoEm, "HH:mm")} ${g.loja} — ${g.quantidade} ${
        g.quantidade === 1 ? "vídeo" : "vídeos"
      }`,
      tipo: "gravacao" as const,
    })),
    ...gravacoes
      .filter((g) => !g.entregueEm)
      .map((g) => ({
        date: g.entregaEm,
        label: `Entregar ${g.loja} — ${g.quantidade} ${g.quantidade === 1 ? "vídeo" : "vídeos"}`,
        tipo: "entrega" as const,
      })),
  ];

  const monthLabelRaw = format(monthStart, "MMMM 'de' yyyy", { locale: ptBR });
  const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);
  const prevMonth = format(subMonths(monthStart, 1), "yyyy-MM");
  const nextMonth = format(addMonths(monthStart, 1), "yyyy-MM");
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Video size={19} className="text-indigo-500" /> Gravações — {monthLabel}
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            O que foi gravado, quantos vídeos e o que vence pra entregar. Gravou hoje, entrega amanhã (D+1).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/gravacoes?month=${prevMonth}`}
            className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={16} />
          </Link>
          <Link
            href="/gravacoes"
            className="px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors text-sm font-medium"
          >
            Hoje
          </Link>
          <Link
            href={`/gravacoes?month=${nextMonth}`}
            className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors"
            aria-label="Próximo mês"
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      {(atrasadas.length > 0 || aEntregarHoje.length > 0) && (
        <div className="rounded-2xl border border-border bg-surface px-5 py-4 flex flex-col gap-1.5">
          {atrasadas.length > 0 && (
            <p className="text-sm flex items-start gap-2 text-red-500 font-medium">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>
                {atrasadas.length} {atrasadas.length === 1 ? "entrega atrasada" : "entregas atrasadas"}:{" "}
                <span className="font-normal">
                  {atrasadas.map((g) => `${g.loja} (${format(g.entregaEm, "dd/MM")})`).join(", ")}
                </span>
              </span>
            </p>
          )}
          {aEntregarHoje.length > 0 && (
            <p className="text-sm flex items-start gap-2 text-cyan-600 dark:text-cyan-400 font-medium">
              <PackageCheck size={15} className="shrink-0 mt-0.5" />
              <span>
                Entregar hoje:{" "}
                <span className="font-normal">
                  {aEntregarHoje.map((g) => `${g.loja} (${g.quantidade})`).join(", ")}
                </span>
              </span>
            </p>
          )}
        </div>
      )}

      {/* ── Quadro do mês ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {weekDays.map((d) => (
            <div
              key={d}
              className="px-2 py-2.5 text-center text-xs font-medium text-foreground-muted uppercase tracking-wide"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const doDia = marcas.filter((m) => isSameDay(m.date, day));
            const inMonth = isSameMonth(day, monthStart);
            const isToday = isSameDay(day, hoje);
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
                  {doDia.slice(0, 3).map((m, i) => (
                    <span
                      key={i}
                      title={m.label}
                      className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded truncate ${
                        m.tipo === "gravacao"
                          ? "bg-indigo-500/15 text-indigo-500"
                          : "bg-cyan-500/15 text-cyan-500"
                      }`}
                    >
                      {m.tipo === "gravacao" ? (
                        <Video size={10} className="shrink-0" />
                      ) : (
                        <PackageCheck size={10} className="shrink-0" />
                      )}
                      <span className="truncate">{m.label}</span>
                    </span>
                  ))}
                  {doDia.length > 3 && (
                    <span className="text-[10px] text-foreground-muted px-1.5">
                      +{doDia.length - 3} mais
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Lançar e conferir ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Registrar gravação</h2>
            <p className="text-xs text-foreground-muted mt-0.5">
              Clique no ✓ quando a entrega sair.
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-foreground-muted font-medium">
                Gravações
              </p>
              <p className="text-lg font-semibold">{doMes.length}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-foreground-muted font-medium">
                Vídeos
              </p>
              <p className="text-lg font-semibold text-indigo-500">{videosNoMes}</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-b border-border">
          <GravacaoForm lojas={lojas} podeEscolherLoja={empresa === "AGENCIA"} />
        </div>

        {porDia.size === 0 ? (
          <p className="px-5 py-6 text-sm text-foreground-muted text-center">
            Nenhuma gravação registrada em {monthLabel.toLowerCase()}.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {[...porDia.entries()].map(([dia, itens]) => {
              const videosDoDia = itens.reduce((s, g) => s + g.quantidade, 0);
              const data = new Date(`${dia}T12:00`);
              return (
                <div key={dia} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">
                      {format(data, "EEEE, dd/MM", { locale: ptBR })}
                      {isSameDay(data, hoje) && (
                        <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent text-white align-middle">
                          HOJE
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-foreground-muted shrink-0">
                      {itens.length} {itens.length === 1 ? "gravação" : "gravações"} ·{" "}
                      <strong className="text-indigo-500">{videosDoDia}</strong>{" "}
                      {videosDoDia === 1 ? "vídeo" : "vídeos"}
                    </p>
                  </div>
                  <div className="flex flex-col divide-y divide-border/60 mt-1">
                    {itens.map((g) => (
                      <GravacaoLinha
                        key={g.id}
                        gravacao={g}
                        lojas={lojas}
                        podeEscolherLoja={empresa === "AGENCIA"}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
