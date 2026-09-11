import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { AbasComercial } from "./abas";
import { QuadroCrm } from "./quadro";
import type { LeadDoQuadro } from "./tipos";

export default async function ComercialPage() {
  await requireModuleAccess("comercial");

  const leads = await prisma.lead.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    include: { owner: { select: { name: true } } },
  });

  const doQuadro: LeadDoQuadro[] = leads.map((l) => ({
    id: l.id,
    companyName: l.companyName,
    contactName: l.contactName,
    city: l.city,
    phone: l.phone,
    channel: l.channel,
    stage: l.stage,
    notes: l.notes,
    monthlyValue: Number(l.monthlyValue),
    setupValue: Number(l.setupValue),
    contractMonths: l.contractMonths,
    noShowAt: l.noShowAt?.toISOString() ?? null,
    wonAt: l.wonAt?.toISOString() ?? null,
    lostReason: l.lostReason,
    createdAt: l.createdAt.toISOString(),
    ownerName: l.owner?.name ?? null,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Comercial</h1>
          <p className="text-sm text-foreground-muted mt-0.5">Funil de vendas da agência</p>
        </div>
        <AbasComercial />
      </div>

      <QuadroCrm leads={doQuadro} />
    </div>
  );
}
