import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { formatCurrency, formatDate } from "@/lib/labels";
import { deleteCampaign } from "@/lib/actions/campaigns";
import { CampaignForm } from "./campaign-form";
import { TrafficCharts } from "./traffic-charts";

export default async function TrafegoPage() {
  await requireModuleAccess("trafego");

  const [campaigns, clients] = await Promise.all([
    prisma.campaign.findMany({
      include: { client: { select: { companyName: true } } },
      orderBy: { periodStart: "desc" },
    }),
    prisma.client.findMany({ select: { id: true, companyName: true }, orderBy: { companyName: "asc" } }),
  ]);

  const totalInvestment = campaigns.reduce((s, c) => s + Number(c.investment), 0);
  const totalLeads = campaigns.reduce((s, c) => s + c.leads, 0);
  const avgCpl = totalLeads > 0 ? totalInvestment / totalLeads : 0;

  const monthlyMap = new Map<string, { investimento: number; leads: number }>();
  const yearlyMap = new Map<string, { investimento: number; leads: number }>();
  for (const c of campaigns) {
    const monthKey = c.periodStart.toISOString().slice(0, 7);
    const yearKey = c.periodStart.getUTCFullYear().toString();
    const m = monthlyMap.get(monthKey) ?? { investimento: 0, leads: 0 };
    m.investimento += Number(c.investment);
    m.leads += c.leads;
    monthlyMap.set(monthKey, m);
    const y = yearlyMap.get(yearKey) ?? { investimento: 0, leads: 0 };
    y.investimento += Number(c.investment);
    y.leads += c.leads;
    yearlyMap.set(yearKey, y);
  }
  const monthly = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([label, v]) => ({ label, ...v }));
  const yearly = Array.from(yearlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, v]) => ({ label, ...v }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Tráfego Pago</h1>
        <p className="text-sm text-foreground-muted mt-0.5">Campanhas e performance por cliente</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase text-foreground-muted font-medium mb-1">Investimento total</p>
          <p className="text-xl font-semibold">{formatCurrency(totalInvestment)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase text-foreground-muted font-medium mb-1">Leads gerados</p>
          <p className="text-xl font-semibold">{totalLeads}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase text-foreground-muted font-medium mb-1">CPL médio</p>
          <p className="text-xl font-semibold">{formatCurrency(avgCpl)}</p>
        </div>
      </div>

      {campaigns.length > 0 && <TrafficCharts monthly={monthly} yearly={yearly} />}

      <div className="rounded-2xl border border-border bg-surface p-5">
        <CampaignForm clients={clients} />
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium hidden sm:table-cell">Período</th>
              <th className="px-5 py-3 font-medium text-right">Investimento</th>
              <th className="px-5 py-3 font-medium text-right">Leads</th>
              <th className="px-5 py-3 font-medium text-right">CPL</th>
              <th className="px-5 py-3 font-medium text-right hidden lg:table-cell">Alcance</th>
              <th className="px-5 py-3 font-medium text-right hidden lg:table-cell">Impressões</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-foreground-muted">
                  Nenhuma campanha cadastrada.
                </td>
              </tr>
            )}
            {campaigns.map((c) => {
              const cpl = c.leads > 0 ? Number(c.investment) / c.leads : 0;
              return (
                <tr key={c.id} className="hover:bg-surface-muted transition-colors">
                  <td className="px-5 py-3">{c.client.companyName}</td>
                  <td className="px-5 py-3 text-foreground-muted hidden sm:table-cell">
                    {formatDate(c.periodStart)} – {formatDate(c.periodEnd)}
                  </td>
                  <td className="px-5 py-3 text-right font-medium">{formatCurrency(c.investment.toString())}</td>
                  <td className="px-5 py-3 text-right">{c.leads}</td>
                  <td className="px-5 py-3 text-right">{formatCurrency(cpl)}</td>
                  <td className="px-5 py-3 text-right hidden lg:table-cell">{c.reach.toLocaleString("pt-BR")}</td>
                  <td className="px-5 py-3 text-right hidden lg:table-cell">{c.impressions.toLocaleString("pt-BR")}</td>
                  <td className="px-5 py-3">
                    <form action={deleteCampaign.bind(null, c.id)}>
                      <button type="submit" className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500">
                        <Trash2 size={15} />
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
