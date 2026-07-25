import Link from "next/link";
import { Trash2, TrendingUp, TrendingDown, ShoppingCart, UserX, Plus, Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { LEAD_STAGE_LABELS, LEAD_ORIGIN_LABELS, formatCurrency, formatDate } from "@/lib/labels";
import { getCommercialPanel } from "@/lib/metrics";
import { deleteLead } from "@/lib/actions/leads";
import { deleteCommercialEvent } from "@/lib/actions/commercial";
import { LeadForm } from "./lead-form";
import { LeadStageSelect } from "./lead-stage-select";
import { DeleteEventoButton } from "./delete-evento-button";
import type { LeadStage } from "@/generated/prisma/enums";

const STAGES = Object.keys(LEAD_STAGE_LABELS) as LeadStage[];

export default async function ComercialPage() {
  await requireModuleAccess("comercial");

  const [leads, panel, events] = await Promise.all([
    prisma.lead.findMany({ orderBy: { createdAt: "desc" } }),
    getCommercialPanel(),
    prisma.commercialEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Comercial</h1>
        <p className="text-sm text-foreground-muted mt-0.5">Pipeline de vendas da agência</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">Este mês</p>
          <Link
            href="/comercial/eventos/novo"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
          >
            <Plus size={14} /> Adicionar venda/churn manualmente
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <PanelCard icon={ShoppingCart} label="Vendas" value={panel.mes.vendasQtd.toString()} />
          <PanelCard icon={TrendingUp} label="Valor vendido" value={formatCurrency(panel.mes.vendasValor)} tone="emerald" />
          <PanelCard icon={UserX} label="Churn" value={panel.mes.churnQtd.toString()} />
          <PanelCard icon={TrendingDown} label="Valor de churn" value={formatCurrency(panel.mes.churnValor)} tone="red" />
        </div>
        <p className="text-xs text-foreground-muted">
          Desde o início: {panel.total.vendasQtd} venda(s) · {formatCurrency(panel.total.vendasValor)} vendido ·{" "}
          {panel.total.churnQtd} churn · {formatCurrency(panel.total.churnValor)} perdido
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium px-5 pt-5 pb-2">
          Eventos recentes (vendas e churn)
        </p>
        {events.length === 0 ? (
          <p className="text-sm text-foreground-muted px-5 pb-5">Nenhum evento registrado ainda.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                      e.type === "VENDA" ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
                    }`}
                  >
                    {e.type === "VENDA" ? "Venda" : "Churn"}
                  </span>
                  <span className="text-sm truncate">{e.companyName}</span>
                  <span className="text-xs text-foreground-muted shrink-0">{formatDate(e.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-medium">{formatCurrency(e.value.toString())}</span>
                  <Link
                    href={`/comercial/eventos/${e.id}/editar`}
                    title="Editar"
                    className="p-1.5 rounded-lg hover:bg-surface-muted text-foreground-muted hover:text-foreground"
                  >
                    <Pencil size={14} />
                  </Link>
                  <DeleteEventoButton action={deleteCommercialEvent.bind(null, e.id)} label={e.companyName} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <LeadForm />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.stage === stage);
          return (
            <div key={stage} className="rounded-2xl border border-border bg-surface flex flex-col min-w-0">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <p className="text-sm font-medium">{LEAD_STAGE_LABELS[stage]}</p>
                <span className="text-xs text-foreground-muted">{stageLeads.length}</span>
              </div>
              <div className="flex flex-col gap-2 p-3">
                {stageLeads.length === 0 && <p className="text-xs text-foreground-muted px-1">Sem leads</p>}
                {stageLeads.map((lead) => (
                  <div key={lead.id} className="rounded-lg border border-border bg-surface-muted p-3 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{lead.companyName}</p>
                        <p className="text-xs text-foreground-muted truncate">{lead.contactName}</p>
                      </div>
                      <form action={deleteLead.bind(null, lead.id)}>
                        <button type="submit" className="p-1 rounded hover:bg-red-500/10 text-red-500 flex-shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </form>
                    </div>
                    <p className="text-xs text-foreground-muted">
                      {lead.city || "—"} · {LEAD_ORIGIN_LABELS[lead.origin]}
                    </p>
                    <LeadStageSelect leadId={lead.id} stage={lead.stage} stages={STAGES} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PanelCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ShoppingCart;
  label: string;
  value: string;
  tone?: "emerald" | "red";
}) {
  const toneClass = tone === "emerald" ? "text-emerald-500" : tone === "red" ? "text-red-500" : "text-foreground-muted";
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className={`flex items-center gap-2 mb-2 ${toneClass}`}>
        <Icon size={15} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-xl font-semibold ${tone ? toneClass : ""}`}>{value}</p>
    </div>
  );
}
