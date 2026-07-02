import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { TASK_PRIORITY_LABELS, TASK_PRIORITY_COLORS, formatDate } from "@/lib/labels";
import { deleteTask } from "@/lib/actions/tasks";
import { TaskForm } from "./task-form";
import { TaskStatusSelect } from "./task-status-select";

export default async function OperacoesPage() {
  await requireModuleAccess("operacoes");

  const [tasks, clients, users] = await Promise.all([
    prisma.task.findMany({
      include: { client: { select: { companyName: true } }, assignee: { select: { name: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
    prisma.client.findMany({ select: { id: true, companyName: true }, orderBy: { companyName: "asc" } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Operações</h1>
        <p className="text-sm text-foreground-muted mt-0.5">Demandas e tarefas por cliente</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <TaskForm clients={clients} users={users} />
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Tarefa</th>
              <th className="px-5 py-3 font-medium hidden md:table-cell">Cliente</th>
              <th className="px-5 py-3 font-medium hidden sm:table-cell">Responsável</th>
              <th className="px-5 py-3 font-medium hidden lg:table-cell">Prazo</th>
              <th className="px-5 py-3 font-medium">Prioridade</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tasks.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-foreground-muted">
                  Nenhuma tarefa cadastrada.
                </td>
              </tr>
            )}
            {tasks.map((t) => (
              <tr key={t.id} className="hover:bg-surface-muted transition-colors">
                <td className="px-5 py-3">{t.title}</td>
                <td className="px-5 py-3 text-foreground-muted hidden md:table-cell">{t.client?.companyName ?? "—"}</td>
                <td className="px-5 py-3 text-foreground-muted hidden sm:table-cell">{t.assignee?.name ?? "—"}</td>
                <td className="px-5 py-3 text-foreground-muted hidden lg:table-cell">{formatDate(t.dueDate)}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${TASK_PRIORITY_COLORS[t.priority]}`}>
                    {TASK_PRIORITY_LABELS[t.priority]}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <TaskStatusSelect taskId={t.id} status={t.status} />
                </td>
                <td className="px-5 py-3">
                  <form action={deleteTask.bind(null, t.id)}>
                    <button type="submit" className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
