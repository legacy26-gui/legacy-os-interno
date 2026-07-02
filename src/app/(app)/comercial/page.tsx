import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { LEAD_STAGE_LABELS, LEAD_ORIGIN_LABELS } from "@/lib/labels";
import { deleteLead } from "@/lib/actions/leads";
import { LeadForm } from "./lead-form";
import { LeadStageSelect } from "./lead-stage-select";
import type { LeadStage } from "@/generated/prisma/enums";

const STAGES = Object.keys(LEAD_STAGE_LABELS) as LeadStage[];

export default async function ComercialPage() {
  await requireModuleAccess("comercial");

  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Comercial</h1>
        <p className="text-sm text-foreground-muted mt-0.5">Pipeline de vendas da agência</p>
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
