import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CONTRACT_STATUS_LABELS, formatCurrency, formatDate } from "@/lib/labels";

const STATUS_COLORS = {
  RASCUNHO: "bg-zinc-500/15 text-zinc-400",
  AGUARDANDO_ASSINATURA: "bg-amber-500/15 text-amber-500",
  ASSINADO: "bg-emerald-500/15 text-emerald-500",
  CANCELADO: "bg-red-500/15 text-red-500",
} as const;

export default async function ContratosPage() {
  await requireModuleAccess("contratos");

  const contracts = await prisma.contract.findMany({
    include: { client: { select: { companyName: true } }, template: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Contratos</h1>
          <p className="text-sm text-foreground-muted mt-0.5">Geração e acompanhamento de contratos</p>
        </div>
        <Link
          href="/contratos/novo"
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground font-medium rounded-lg text-sm hover:opacity-90 transition-opacity self-start"
        >
          <Plus size={16} />
          Novo Contrato
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium hidden sm:table-cell">Modelo</th>
              <th className="px-5 py-3 font-medium text-right">Valor</th>
              <th className="px-5 py-3 font-medium hidden md:table-cell">Criado em</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contracts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-foreground-muted">
                  Nenhum contrato gerado ainda.
                </td>
              </tr>
            )}
            {contracts.map((c) => (
              <tr key={c.id} className="hover:bg-surface-muted transition-colors">
                <td className="px-5 py-3">
                  <Link href={`/contratos/${c.id}`} className="font-medium hover:text-accent">
                    {c.client.companyName}
                  </Link>
                </td>
                <td className="px-5 py-3 text-foreground-muted hidden sm:table-cell">{c.template.name}</td>
                <td className="px-5 py-3 text-right font-medium">{formatCurrency(c.value.toString())}</td>
                <td className="px-5 py-3 text-foreground-muted hidden md:table-cell">{formatDate(c.createdAt)}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[c.status]}`}>
                    {CONTRACT_STATUS_LABELS[c.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
