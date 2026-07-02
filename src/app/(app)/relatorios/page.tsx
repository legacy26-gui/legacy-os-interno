import { Trash2, Printer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { formatCurrency, formatDate } from "@/lib/labels";
import { deleteReport } from "@/lib/actions/reports";
import { ReportForm } from "./report-form";

export default async function RelatoriosPage() {
  await requireModuleAccess("relatorios");

  const [reports, clients] = await Promise.all([
    prisma.report.findMany({ include: { client: { select: { companyName: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.client.findMany({ select: { id: true, companyName: true }, orderBy: { companyName: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Relatórios</h1>
        <p className="text-sm text-foreground-muted mt-0.5">Relatórios de performance por cliente</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <ReportForm clients={clients} />
      </div>

      <div className="flex flex-col gap-3">
        {reports.length === 0 && (
          <p className="text-sm text-foreground-muted rounded-2xl border border-border bg-surface p-8 text-center">
            Nenhum relatório gerado ainda.
          </p>
        )}
        {reports.map((r) => {
          const cpl = r.leads > 0 ? Number(r.investment) / r.leads : 0;
          return (
            <div key={r.id} className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{r.client.companyName}</p>
                  <p className="text-xs text-foreground-muted">{r.periodLabel} · gerado em {formatDate(r.createdAt)}</p>
                </div>
                <div className="flex gap-1">
                  <a
                    href={`/relatorios/${r.id}/imprimir`}
                    target="_blank"
                    className="p-1.5 rounded-lg hover:bg-surface-muted text-foreground-muted"
                    title="Imprimir / gerar PDF"
                  >
                    <Printer size={15} />
                  </a>
                  <form action={deleteReport.bind(null, r.id)}>
                    <button type="submit" className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500" title="Excluir">
                      <Trash2 size={15} />
                    </button>
                  </form>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label="Investimento" value={formatCurrency(r.investment.toString())} />
                <Stat label="Leads" value={r.leads.toString()} />
                <Stat label="CPL" value={formatCurrency(cpl)} />
                <Stat label="Alcance" value={r.reach.toLocaleString("pt-BR")} />
              </div>
              {r.recommendations && <p className="text-sm text-foreground-muted whitespace-pre-wrap">{r.recommendations}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-muted p-3">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
