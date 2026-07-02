import {
  Wallet, TrendingUp, Users, AlertTriangle, Receipt, Target,
  Megaphone, FileBarChart, ListChecks, UserX, UserPlus,
  CalendarCheck, FileText, FileSignature, Handshake, Bell,
} from "lucide-react";
import { getCurrentUser } from "@/lib/dal";
import { canAccessModule } from "@/lib/permissions";
import { getFinanceOverview, getOperationsOverview, getCommercialOverview, getAutomationAlerts } from "@/lib/metrics";
import { formatCurrency } from "@/lib/labels";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  const showFinance = canAccessModule(user.role, "financeiro");
  const showCommercial = canAccessModule(user.role, "comercial");
  const showContracts = canAccessModule(user.role, "contratos");

  const [finance, operations, commercial, allAlerts] = await Promise.all([
    showFinance ? getFinanceOverview() : null,
    getOperationsOverview(),
    showCommercial ? getCommercialOverview() : null,
    getAutomationAlerts(),
  ]);

  const alerts = allAlerts.filter((a) => {
    if (a.type === "inadimplencia" || a.type === "relatorio") return showFinance;
    if (a.type === "contrato") return showContracts;
    return true; // campanha alerts visible to everyone (tráfego pago)
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Olá, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-foreground-muted mt-0.5">Visão geral da Legacy Digital</p>
      </div>

      {alerts.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-500 mb-3">
            <Bell size={16} /> Automações — {alerts.length} alerta(s)
          </p>
          <div className="flex flex-col gap-1.5 text-sm max-h-48 overflow-y-auto">
            {alerts.map((a, i) => (
              <p key={i} className="text-foreground-muted">
                {a.message}
              </p>
            ))}
          </div>
        </div>
      )}

      {finance && (
        <Section title="Financeiro">
          <Card icon={Wallet} label="Faturamento mensal" value={formatCurrency(finance.faturamentoMensal)} />
          <Card icon={Wallet} label="Faturamento anual" value={formatCurrency(finance.faturamentoAnual)} />
          <Card icon={TrendingUp} label="Receita recorrente (MRR)" value={formatCurrency(finance.mrr)} />
          <Card icon={Users} label="Clientes ativos" value={finance.clientesAtivos.toString()} />
          <Card icon={AlertTriangle} label="Clientes inadimplentes" value={finance.clientesInadimplentes.toString()} accent={finance.clientesInadimplentes > 0} />
          <Card icon={Receipt} label="Ticket médio" value={formatCurrency(finance.ticketMedio)} />
          <Card icon={Target} label="Meta mensal" value={formatCurrency(finance.targetRevenue)} />
          <Card icon={Target} label="% atingido" value={`${finance.percentAtingido.toFixed(0)}%`} />
        </Section>
      )}

      <Section title="Operação">
        <Card icon={Megaphone} label="Campanhas ativas" value={operations.activeCampaigns.toString()} />
        <Card icon={FileBarChart} label="Relatórios gerados" value={operations.pendingReports.toString()} />
        <Card icon={ListChecks} label="Demandas pendentes" value={operations.pendingTasks.toString()} />
        <Card icon={UserX} label="Clientes sem atendimento" value={operations.clientsWithoutRecentContact.toString()} accent={operations.clientsWithoutRecentContact > 0} />
        <Card icon={UserPlus} label="Leads gerados no mês" value={operations.leadsThisMonth.toString()} />
      </Section>

      {commercial && (
        <Section title="Comercial">
          <Card icon={UserPlus} label="Novos leads" value={commercial.newLeads.toString()} />
          <Card icon={CalendarCheck} label="Reuniões agendadas" value={commercial.meetings.toString()} />
          <Card icon={FileText} label="Propostas enviadas" value={commercial.proposals.toString()} />
          <Card icon={FileSignature} label="Contratos aguardando assinatura" value={commercial.contractsAwaitingSignature.toString()} accent={commercial.contractsAwaitingSignature > 0} />
          <Card icon={Handshake} label="Vendas fechadas" value={commercial.closedDeals.toString()} />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide">{title}</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{children}</div>
    </div>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className={`flex items-center gap-2 mb-2 ${accent ? "text-amber-500" : "text-foreground-muted"}`}>
        <Icon size={15} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-xl font-semibold ${accent ? "text-amber-500" : ""}`}>{value}</p>
    </div>
  );
}
