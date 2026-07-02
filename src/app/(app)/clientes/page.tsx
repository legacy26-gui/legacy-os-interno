import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS, formatCurrency } from "@/lib/labels";
import type { ClientStatus } from "@/generated/prisma/enums";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireModuleAccess("clientes");
  const { q, status } = await searchParams;

  const clients = await prisma.client.findMany({
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
    orderBy: { companyName: "asc" },
  });

  const statusCounts = await prisma.client.groupBy({ by: ["status"], _count: true });

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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Empresa</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Contato</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Cidade/UF</th>
                <th className="px-5 py-3 font-medium hidden sm:table-cell">Plano</th>
                <th className="px-5 py-3 font-medium text-right">Mensalidade</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-surface-muted transition-colors">
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
                  <td className="px-5 py-3.5 text-right font-medium">{formatCurrency(c.monthlyValue.toString())}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${CLIENT_STATUS_COLORS[c.status]}`}>
                      {CLIENT_STATUS_LABELS[c.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
