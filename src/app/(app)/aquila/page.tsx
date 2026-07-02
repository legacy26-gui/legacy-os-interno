import { Trash2, Bot, Store, Users, Target } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { deleteAquilaMetric } from "@/lib/actions/aquila";
import { MetricForm } from "./metric-form";

export default async function AquilaPage() {
  await requireModuleAccess("aquila");

  const metrics = await prisma.aquilaMetric.findMany({ orderBy: [{ periodMonth: "desc" }, { conversions: "desc" }] });

  const totalConversas = metrics.reduce((s, m) => s + m.conversations, 0);
  const totalLeads = metrics.reduce((s, m) => s + m.leadsCaptured, 0);
  const totalConversoes = metrics.reduce((s, m) => s + m.conversions, 0);

  const storeRanking = [...metrics].sort((a, b) => b.conversions - a.conversions).slice(0, 5);
  const salespersonRanking = Object.entries(
    metrics.reduce<Record<string, number>>((acc, m) => {
      if (!m.topSalesperson) return acc;
      acc[m.topSalesperson] = (acc[m.topSalesperson] ?? 0) + m.conversions;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Bot size={20} className="text-accent" /> Áquila IA
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">Performance do assistente de IA nas lojas clientes</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <MetricCard icon={Users} label="Conversas totais" value={totalConversas.toString()} />
        <MetricCard icon={Target} label="Leads capturados" value={totalLeads.toString()} />
        <MetricCard icon={Store} label="Conversões" value={totalConversoes.toString()} />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <MetricForm />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase text-foreground-muted font-medium mb-3">Ranking de lojas</p>
          <div className="flex flex-col gap-2">
            {storeRanking.length === 0 && <p className="text-sm text-foreground-muted">Sem dados ainda.</p>}
            {storeRanking.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span>{i + 1}. {s.storeName}</span>
                <span className="font-medium">{s.conversions} conversões</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase text-foreground-muted font-medium mb-3">Ranking de vendedores</p>
          <div className="flex flex-col gap-2">
            {salespersonRanking.length === 0 && <p className="text-sm text-foreground-muted">Sem dados ainda.</p>}
            {salespersonRanking.map(([name, total], i) => (
              <div key={name} className="flex items-center justify-between text-sm">
                <span>{i + 1}. {name}</span>
                <span className="font-medium">{total} conversões</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Loja</th>
              <th className="px-5 py-3 font-medium">Mês</th>
              <th className="px-5 py-3 font-medium text-right">Conversas</th>
              <th className="px-5 py-3 font-medium text-right">Leads</th>
              <th className="px-5 py-3 font-medium text-right hidden sm:table-cell">Score médio</th>
              <th className="px-5 py-3 font-medium text-right hidden md:table-cell">Visitas</th>
              <th className="px-5 py-3 font-medium text-right hidden md:table-cell">Test drives</th>
              <th className="px-5 py-3 font-medium text-right">Conversões</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {metrics.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-foreground-muted">
                  Nenhuma métrica registrada.
                </td>
              </tr>
            )}
            {metrics.map((m) => (
              <tr key={m.id} className="hover:bg-surface-muted transition-colors">
                <td className="px-5 py-3">{m.storeName}</td>
                <td className="px-5 py-3 text-foreground-muted">{m.periodMonth}</td>
                <td className="px-5 py-3 text-right">{m.conversations}</td>
                <td className="px-5 py-3 text-right">{m.leadsCaptured}</td>
                <td className="px-5 py-3 text-right hidden sm:table-cell">{m.avgLeadScore.toString()}</td>
                <td className="px-5 py-3 text-right hidden md:table-cell">{m.visitsGenerated}</td>
                <td className="px-5 py-3 text-right hidden md:table-cell">{m.testDrivesGenerated}</td>
                <td className="px-5 py-3 text-right font-medium">{m.conversions}</td>
                <td className="px-5 py-3">
                  <form action={deleteAquilaMetric.bind(null, m.id)}>
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

function MetricCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-foreground-muted mb-2">
        <Icon size={15} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
