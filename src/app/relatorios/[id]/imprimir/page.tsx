import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { formatCurrency, formatDate } from "@/lib/labels";
import { PrintButton } from "./print-button";

export default async function ImprimirRelatorioPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleAccess("relatorios");
  const { id } = await params;

  const report = await prisma.report.findUnique({ where: { id }, include: { client: true } });
  if (!report) notFound();

  const cpl = report.leads > 0 ? Number(report.investment) / report.leads : 0;

  return (
    <div className="min-h-screen bg-white text-zinc-900 p-10 max-w-3xl mx-auto">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-6 mb-6 print:hidden">
        <PrintButton />
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-2xl font-black tracking-tight">
            LEGACY<span className="text-indigo-600">DIGITAL</span>
          </p>
          <p className="text-xs text-zinc-500 tracking-widest mt-1">RELATÓRIO DE PERFORMANCE</p>
        </div>
        <div className="text-right text-sm text-zinc-500">
          <p>{report.periodLabel}</p>
          <p>Gerado em {formatDate(report.createdAt)}</p>
        </div>
      </div>

      <h1 className="text-xl font-semibold mb-1">{report.client.companyName}</h1>
      <p className="text-sm text-zinc-500 mb-8">{report.client.contactName}</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <Stat label="Investimento" value={formatCurrency(report.investment.toString())} />
        <Stat label="Leads" value={report.leads.toString()} />
        <Stat label="CPL" value={formatCurrency(cpl)} />
        <Stat label="Alcance" value={report.reach.toLocaleString("pt-BR")} />
      </div>

      <Stat label="Impressões" value={report.impressions.toLocaleString("pt-BR")} full />

      {report.recommendations && (
        <div className="mt-8">
          <p className="text-xs uppercase tracking-wide text-zinc-500 font-medium mb-2">Recomendações</p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{report.recommendations}</p>
        </div>
      )}

      <p className="text-xs text-zinc-400 mt-16 border-t border-zinc-200 pt-4">
        Legacy Digital © 2026 — Relatório confidencial gerado automaticamente pelo Legacy OS.
      </p>
    </div>
  );
}

function Stat({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={`rounded-lg border border-zinc-200 p-4 ${full ? "col-span-4" : ""}`}>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
