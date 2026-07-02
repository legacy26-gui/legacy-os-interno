import { notFound } from "next/navigation";
import { Trash2, Printer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CONTRACT_STATUS_LABELS, formatCurrency, formatDateTime } from "@/lib/labels";
import { updateContractStatus, deleteContract } from "@/lib/actions/contracts";

export default async function ContratoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleAccess("contratos");
  const { id } = await params;

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { client: { select: { companyName: true } }, template: { select: { name: true } } },
  });
  if (!contract) notFound();

  const boundDelete = deleteContract.bind(null, contract.id);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{contract.client.companyName}</h1>
          <p className="text-sm text-foreground-muted">{contract.template.name} · {formatCurrency(contract.value.toString())}</p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/contratos/${contract.id}/imprimir`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-border bg-surface rounded-lg text-sm hover:bg-surface-muted"
          >
            <Printer size={14} /> PDF
          </a>
          <form action={boundDelete}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-red-500/30 text-red-500 bg-red-500/5 rounded-lg text-sm hover:bg-red-500/10"
            >
              <Trash2 size={14} /> Excluir
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase text-foreground-muted font-medium">Status atual:</span>
        {(Object.keys(CONTRACT_STATUS_LABELS) as (keyof typeof CONTRACT_STATUS_LABELS)[]).map((s) => (
          <form key={s} action={updateContractStatus.bind(null, contract.id, s)}>
            <button
              type="submit"
              disabled={contract.status === s}
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                contract.status === s ? "bg-accent text-white" : "bg-surface-muted text-foreground-muted hover:bg-border/60"
              }`}
            >
              {CONTRACT_STATUS_LABELS[s]}
            </button>
          </form>
        ))}
      </div>

      {contract.sentAt && <p className="text-xs text-foreground-muted">Enviado em {formatDateTime(contract.sentAt)}</p>}
      {contract.signedAt && <p className="text-xs text-foreground-muted">Assinado em {formatDateTime(contract.signedAt)}</p>}

      <div className="rounded-2xl border border-border bg-surface p-6">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{contract.content}</pre>
      </div>
    </div>
  );
}
