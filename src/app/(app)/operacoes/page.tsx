import Link from "next/link";
import { Trash2, Users, Gauge, ListChecks, Sparkles, ClipboardCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { deleteTask } from "@/lib/actions/tasks";
import { generateStandardTasks } from "@/lib/actions/operations";
import { getAccountsHealth, SCORE_COLORS, bucketForScore } from "@/lib/account-health";
import { TaskStatusSelect } from "./task-status-select";
import { ManagerSelect } from "./manager-select";
import { ClientTaskAdd } from "./client-task-add";

const STATUS_DOT: Record<string, string> = {
  PENDENTE: "bg-amber-500",
  EM_ANDAMENTO: "bg-blue-500",
  AGUARDANDO_CLIENTE: "bg-zinc-400",
  FINALIZADO: "bg-emerald-500",
};

export default async function OperacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ op?: string }>;
}) {
  await requireModuleAccess("operacoes");
  const { op } = await searchParams;

  const [operators, clients, accountsHealth] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, role: { not: "ADMIN" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.client.findMany({
      where: { status: { not: "CANCELADO" } },
      select: {
        id: true,
        companyName: true,
        managerId: true,
        tasks: {
          orderBy: [{ status: "asc" }, { createdAt: "asc" }],
          select: { id: true, title: true, status: true },
        },
      },
      orderBy: { companyName: "asc" },
    }),
    getAccountsHealth(),
  ]);

  const healthByClient = new Map(accountsHealth.map((a) => [a.id, a.metrics]));

  const unassignedCount = clients.filter((c) => !c.managerId).length;

  // Aba selecionada: operador informado, "none" (sem operador) ou o primeiro operador.
  const validOpIds = new Set(operators.map((o) => o.id));
  const selected = op && (validOpIds.has(op) || op === "none") ? op : operators[0]?.id ?? "none";

  const visibleClients =
    selected === "none"
      ? clients.filter((c) => !c.managerId)
      : clients.filter((c) => c.managerId === selected);

  const scored = visibleClients.map((c) => healthByClient.get(c.id)?.score).filter((s): s is number => s !== undefined);
  const avgScore = scored.length > 0 ? Math.round(scored.reduce((s, v) => s + v, 0) / scored.length) : null;
  const selectedOperator = operators.find((o) => o.id === selected);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Operações</h1>
        <p className="text-sm text-foreground-muted mt-0.5">Carteira de clientes e tarefas por operador</p>
      </div>

      {/* Abas por operador */}
      <div className="flex flex-wrap gap-2">
        {operators.map((o) => {
          const count = clients.filter((c) => c.managerId === o.id).length;
          const active = selected === o.id;
          return (
            <Link
              key={o.id}
              href={`/operacoes?op=${o.id}`}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                active
                  ? "bg-accent text-white border-accent"
                  : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"
              }`}
            >
              {o.name} <span className="opacity-70">({count})</span>
            </Link>
          );
        })}
        <Link
          href="/operacoes?op=none"
          className={`px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
            selected === "none"
              ? "bg-accent text-white border-accent"
              : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"
          }`}
        >
          Sem operador <span className="opacity-70">({unassignedCount})</span>
        </Link>
      </div>

      {/* Resumo da carteira */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 text-foreground-muted mb-2">
            <Users size={15} />
            <span className="text-xs font-medium uppercase tracking-wide">
              {selectedOperator ? `Clientes de ${selectedOperator.name}` : "Clientes sem operador"}
            </span>
          </div>
          <p className="text-xl font-semibold">{visibleClients.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 text-foreground-muted mb-2">
            <Gauge size={15} />
            <span className="text-xs font-medium uppercase tracking-wide">Score médio da carteira</span>
          </div>
          {avgScore !== null ? (
            <span className={`inline-flex items-center text-xl font-semibold px-3 py-1 rounded-full ${SCORE_COLORS[bucketForScore(avgScore)]}`}>
              {avgScore}
            </span>
          ) : (
            <p className="text-xl font-semibold text-foreground-muted">—</p>
          )}
        </div>
      </div>

      {selected === "none" && unassignedCount > 0 && (
        <p className="text-sm text-foreground-muted rounded-xl border border-border bg-surface-muted/40 px-4 py-3">
          Atribua um operador a cada cliente no seletor abaixo. Depois abra a aba do operador para acompanhar a carteira dele.
        </p>
      )}

      {/* Lista de clientes da aba */}
      <div className="flex flex-col gap-4">
        {visibleClients.length === 0 && (
          <p className="text-sm text-foreground-muted rounded-2xl border border-border bg-surface p-8 text-center">
            Nenhum cliente nesta aba.
          </p>
        )}

        {visibleClients.map((c) => {
          const health = healthByClient.get(c.id);
          return (
          <div key={c.id} className="rounded-2xl border border-border bg-surface overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <Link href={`/gestao-contas/${c.id}`} className="font-medium hover:text-accent">
                  {c.companyName}
                </Link>
                {health && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SCORE_COLORS[health.bucket]}`}>
                    {health.score}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ManagerSelect clientId={c.id} managerId={c.managerId} operators={operators} />
                <Link
                  href={`/gestao-contas/${c.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90"
                  title="Checklist diário, semanal e relatório com foto"
                >
                  <ClipboardCheck size={13} />
                  Checklist
                </Link>
                <form action={generateStandardTasks.bind(null, c.id)}>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-muted border border-border rounded-lg text-xs font-medium hover:bg-border/60"
                    title="Cria reunião semanal, enviar verba, conferir verba, reservar criativos e enviar relatório mensal"
                  >
                    <Sparkles size={13} />
                    Gerar tarefas padrão
                  </button>
                </form>
              </div>
            </div>

            <div className="p-5 flex flex-col gap-2">
              {c.tasks.length === 0 ? (
                <p className="text-xs text-foreground-muted flex items-center gap-1.5">
                  <ListChecks size={13} /> Nenhuma tarefa ainda.
                </p>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {c.tasks.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="flex items-center gap-2 text-sm">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[t.status] ?? "bg-zinc-400"}`} />
                        {t.title}
                      </span>
                      <div className="flex items-center gap-2">
                        <TaskStatusSelect taskId={t.id} status={t.status} />
                        <form action={deleteTask.bind(null, t.id)}>
                          <button type="submit" className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500">
                            <Trash2 size={14} />
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="pt-2">
                <ClientTaskAdd clientId={c.id} />
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
