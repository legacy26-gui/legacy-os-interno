import Link from "next/link";
import { Plus, Search, Pencil, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { canAccessModule } from "@/lib/permissions";
import { CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS, formatCurrency, formatDate } from "@/lib/labels";
import { deleteClient } from "@/lib/actions/clients";
import { DeleteClientButton } from "./delete-client-button";
import { ManagerSelect } from "../operacoes/manager-select";
import type { ClientStatus } from "@/generated/prisma/enums";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const user = await requireModuleAccess("clientes");
  const canSeeValues = canAccessModule(user.role, "financeiro");
  const canManageOperators = canAccessModule(user.role, "operacoes");
  const { q, status } = await searchParams;

  // Cobranças vencidas e ainda não recebidas — é o que pinta o cliente de
  // vermelho na lista. Só o estado do atraso aparece pra todo mundo; o valor
  // continua restrito a quem tem o Financeiro.
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [clients, operators, statusCounts, vencidas] = await Promise.all([
    prisma.client.findMany({
      where: {
        AND: [
          q
            ? {
                OR: [
                  { companyName: { contains: q, mode: "insensitive" } },
                  { contactName: { contains: q, mode: "insensitive" } },
                  { city: { contains: q, mode: "insensitive" } },
                ],
              }
            : {},
          status ? { status: status as ClientStatus } : {},
        ],
      },
      include: { manager: { select: { name: true } } },
      orderBy: { companyName: "asc" },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.client.groupBy({ by: ["status"], _count: true }),
    prisma.revenue.findMany({
      where: { status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { lt: hoje } },
      select: { clientId: true, dueDate: true, value: true },
    }),
  ]);

  // Por cliente: a cobrança vencida mais antiga manda no tamanho do atraso.
  const atrasoPorCliente = new Map<string, { dias: number; qtd: number; total: number; vencimento: Date }>();
  for (const r of vencidas) {
    const dias = Math.floor((hoje.getTime() - r.dueDate.getTime()) / 86_400_000);
    const atual = atrasoPorCliente.get(r.clientId);
    atrasoPorCliente.set(r.clientId, {
      dias: Math.max(dias, atual?.dias ?? 0),
      qtd: (atual?.qtd ?? 0) + 1,
      total: (atual?.total ?? 0) + Number(r.value),
      vencimento: !atual || r.dueDate < atual.vencimento ? r.dueDate : atual.vencimento,
    });
  }
  const clientesEmAtraso = clients.filter((c) => atrasoPorCliente.has(c.id)).length;
  const atrasoGrave = clients.filter((c) => (atrasoPorCliente.get(c.id)?.dias ?? 0) > 3).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Clientes</h1>
          <p className="text-sm text-foreground-muted mt-0.5">Contas ativas e histórico da agência</p>
        </div>
        <Link
          href="/clientes/novo"
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground font-medium rounded-lg text-sm hover:opacity-90 transition-opacity self-start"
        >
          <Plus size={16} />
          Novo Cliente
        </Link>
      </div>

      {clientesEmAtraso > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-3.5 flex items-center gap-2.5">
          <AlertTriangle size={16} className="text-red-500 shrink-0" />
          <p className="text-sm">
            <span className="font-semibold text-red-500">
              {clientesEmAtraso} cliente(s) com pagamento em atraso
            </span>
            {atrasoGrave > 0 && (
              <span className="text-foreground-muted"> · {atrasoGrave} passando de 3 dias</span>
            )}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(CLIENT_STATUS_LABELS) as ClientStatus[]).map((s) => {
          const count = statusCounts.find((c) => c.status === s)?._count ?? 0;
          return (
            <Link
              key={s}
              href={status === s ? "/clientes" : `/clientes?status=${s}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                status === s ? "bg-accent text-white border-accent" : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"
              }`}
            >
              {CLIENT_STATUS_LABELS[s]} <span className="opacity-70">({count})</span>
            </Link>
          );
        })}
      </div>

      <form className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por empresa, contato ou cidade..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        {status && <input type="hidden" name="status" value={status} />}
      </form>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        {clients.length === 0 ? (
          <div className="text-center py-16 text-foreground-muted">
            <p className="font-medium">Nenhum cliente encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Empresa</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Contato</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Cidade/UF</th>
                <th className="px-5 py-3 font-medium hidden sm:table-cell">Plano</th>
                <th className="px-5 py-3 font-medium">Gestor</th>
                <th className="px-5 py-3 font-medium whitespace-nowrap">Vencimento</th>
                {canSeeValues && <th className="px-5 py-3 font-medium text-right">Mensalidade</th>}
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.map((c) => {
                const atraso = atrasoPorCliente.get(c.id);
                const grave = (atraso?.dias ?? 0) > 3;
                return (
                <tr
                  key={c.id}
                  className={`transition-colors ${
                    grave ? "bg-red-500/10 hover:bg-red-500/15" : atraso ? "bg-red-500/5 hover:bg-red-500/10" : "hover:bg-surface-muted"
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <Link href={`/clientes/${c.id}`} className="font-medium hover:text-accent">
                      {c.companyName}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-foreground-muted hidden md:table-cell">{c.contactName}</td>
                  <td className="px-5 py-3.5 text-foreground-muted hidden lg:table-cell">
                    {c.city ? `${c.city}${c.state ? "/" + c.state : ""}` : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-foreground-muted hidden sm:table-cell">{c.plan || "—"}</td>
                  <td className="px-5 py-3.5">
                    {canManageOperators ? (
                      <ManagerSelect clientId={c.id} managerId={c.managerId} operators={operators} />
                    ) : (
                      <span className="text-foreground-muted">{c.manager?.name ?? "Sem gestor"}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {atraso ? (
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
                            grave ? "bg-red-600 text-white" : "bg-red-500/15 text-red-500"
                          }`}
                        >
                          <AlertTriangle size={12} className="shrink-0" />
                          {atraso.dias === 0
                            ? "vence hoje"
                            : `${atraso.dias} ${atraso.dias === 1 ? "dia" : "dias"} em atraso`}
                        </span>
                        <span className="text-[11px] text-red-500">
                          venceu {formatDate(atraso.vencimento)}
                          {atraso.qtd > 1 && ` · ${atraso.qtd} cobranças`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-foreground-muted text-xs">
                        {c.dueDay ? `dia ${c.dueDay}` : "—"}
                      </span>
                    )}
                  </td>
                  {canSeeValues && (
                    <td className="px-5 py-3.5 text-right font-medium">{formatCurrency(c.monthlyValue.toString())}</td>
                  )}
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${CLIENT_STATUS_COLORS[c.status]}`}>
                      {CLIENT_STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/clientes/${c.id}/editar`}
                        title="Editar cliente"
                        className="p-1.5 rounded-lg hover:bg-surface-muted text-foreground-muted hover:text-foreground"
                      >
                        <Pencil size={14} />
                      </Link>
                      <DeleteClientButton action={deleteClient.bind(null, c.id)} companyName={c.companyName} compact />
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
