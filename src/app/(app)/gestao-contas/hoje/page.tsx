import Link from "next/link";
import { ArrowLeft, ClipboardCheck, CheckCircle2, AlertCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export default async function ChecklistHojePage() {
  await requireModuleAccess("gestao-contas");
  const todayStart = startOfToday();

  const operators = await prisma.user.findMany({
    where: { active: true, role: { not: "ADMIN" } },
    select: {
      id: true,
      name: true,
      managedClients: {
        where: { status: { not: "CANCELADO" } },
        select: {
          id: true,
          companyName: true,
          dailyReviews: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        },
        orderBy: { companyName: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = operators.map((op) => {
    const clients = op.managedClients.map((c) => ({
      id: c.id,
      companyName: c.companyName,
      doneToday: !!c.dailyReviews[0] && c.dailyReviews[0].createdAt >= todayStart,
    }));
    const doneCount = clients.filter((c) => c.doneToday).length;
    return { id: op.id, name: op.name, clients, doneCount, total: clients.length };
  });

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const grandDone = rows.reduce((s, r) => s + r.doneCount, 0);
  const grandPercent = grandTotal > 0 ? Math.round((grandDone / grandTotal) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/gestao-contas" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground mb-2">
          <ArrowLeft size={15} /> Voltar para Gestão de Contas
        </Link>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ClipboardCheck size={20} className="text-accent" /> Checklist de hoje
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">Quem já preencheu o checklist diário de cada cliente hoje</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">{grandDone} de {grandTotal} clientes revisados hoje (todos os gestores)</p>
          <span className="text-sm font-semibold text-foreground-muted">{grandPercent}%</span>
        </div>
        <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
          <div
            className={`h-full transition-all ${grandPercent === 100 ? "bg-emerald-500" : "bg-accent"}`}
            style={{ width: `${grandPercent}%` }}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">{r.name}</p>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                r.total === 0
                  ? "bg-surface-muted text-foreground-muted"
                  : r.doneCount === r.total
                    ? "bg-emerald-500/15 text-emerald-500"
                    : "bg-amber-500/15 text-amber-500"
              }`}>
                {r.doneCount}/{r.total}
              </span>
            </div>

            {r.total === 0 ? (
              <p className="text-sm text-foreground-muted">Sem clientes na carteira.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {r.clients.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      {c.doneToday ? (
                        <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle size={15} className="text-red-500 shrink-0" />
                      )}
                      {c.companyName}
                    </span>
                    <span className={c.doneToday ? "text-emerald-500 text-xs" : "text-red-500 text-xs"}>
                      {c.doneToday ? "Feito hoje" : "Pendente"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {rows.length === 0 && (
          <p className="text-sm text-foreground-muted rounded-2xl border border-border bg-surface p-8 text-center md:col-span-2">
            Nenhum gestor cadastrado.
          </p>
        )}
      </div>
    </div>
  );
}
