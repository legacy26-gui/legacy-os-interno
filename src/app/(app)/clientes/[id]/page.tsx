import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, ExternalLink, Building2, Phone, Mail, MapPin, CreditCard } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS, formatCurrency, formatDate, formatDateTime } from "@/lib/labels";
import { deleteClient } from "@/lib/actions/clients";
import { HistoryForm } from "./history-form";
import { AttachmentForm } from "./attachment-form";
import { DeleteClientButton } from "../delete-client-button";

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleAccess("clientes");
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      history: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      attachments: { orderBy: { uploadedAt: "desc" } },
      revenues: { orderBy: { dueDate: "desc" }, take: 5 },
      contracts: { orderBy: { createdAt: "desc" }, take: 5 },
      _count: { select: { tasks: true, campaigns: true, contracts: true } },
    },
  });

  if (!client) notFound();

  const boundDelete = deleteClient.bind(null, client.id);

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
            <Building2 size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{client.companyName}</h1>
            <p className="text-sm text-foreground-muted">{client.contactName}</p>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${CLIENT_STATUS_COLORS[client.status]}`}>
            {CLIENT_STATUS_LABELS[client.status]}
          </span>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/clientes/${client.id}/editar`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-border bg-surface rounded-lg text-sm hover:bg-surface-muted"
          >
            <Pencil size={14} /> Editar
          </Link>
          <DeleteClientButton action={boundDelete} companyName={client.companyName} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase text-foreground-muted tracking-wide mb-3 font-medium">Contato</p>
          <div className="flex flex-col gap-2 text-sm">
            <span className="flex items-center gap-2"><Phone size={14} className="text-foreground-muted" /> {client.phone || "—"}</span>
            <span className="flex items-center gap-2"><Mail size={14} className="text-foreground-muted" /> {client.email || "—"}</span>
            <span className="flex items-center gap-2"><MapPin size={14} className="text-foreground-muted" /> {client.city ? `${client.city}/${client.state ?? ""}` : "—"}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase text-foreground-muted tracking-wide mb-3 font-medium">Contrato</p>
          <div className="flex flex-col gap-2 text-sm">
            <span className="flex items-center gap-2"><CreditCard size={14} className="text-foreground-muted" /> {client.plan || "Sem plano definido"}</span>
            <span className="font-semibold text-base">{formatCurrency(client.monthlyValue.toString())}/mês</span>
            <span className="text-foreground-muted">Vencimento dia {client.dueDay ?? "—"} · Início {formatDate(client.startDate)}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase text-foreground-muted tracking-wide mb-3 font-medium">Resumo</p>
          <div className="flex flex-col gap-1.5 text-sm text-foreground-muted">
            <span>{client._count.tasks} tarefa(s) em Operações</span>
            <span>{client._count.campaigns} campanha(s) de tráfego</span>
            <span>{client._count.contracts} contrato(s)</span>
            <span>CNPJ: {client.cnpj || "—"}</span>
          </div>
        </div>
      </div>

      {client.internalNotes && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase text-foreground-muted tracking-wide mb-2 font-medium">Observações internas</p>
          <p className="text-sm whitespace-pre-wrap">{client.internalNotes}</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">Histórico</p>
          <HistoryForm clientId={client.id} />
          <div className="flex flex-col gap-3 max-h-80 overflow-y-auto">
            {client.history.length === 0 && <p className="text-sm text-foreground-muted">Nenhum registro ainda.</p>}
            {client.history.map((h) => (
              <div key={h.id} className="border-l-2 border-accent/40 pl-3 py-0.5">
                <p className="text-sm">{h.note}</p>
                <p className="text-xs text-foreground-muted mt-0.5">
                  {h.author?.name ?? "Sistema"} · {formatDateTime(h.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">Anexos</p>
          <AttachmentForm clientId={client.id} />
          <div className="flex flex-col gap-2">
            {client.attachments.length === 0 && <p className="text-sm text-foreground-muted">Nenhum anexo ainda.</p>}
            {client.attachments.map((a) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg border border-border hover:bg-surface-muted"
              >
                <span className="truncate">{a.fileName}</span>
                <ExternalLink size={13} className="text-foreground-muted flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs uppercase text-foreground-muted tracking-wide mb-3 font-medium">Últimas receitas</p>
        {client.revenues.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nenhuma receita lançada.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {client.revenues.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span>{r.description}</span>
                <span className="text-foreground-muted">{formatDate(r.dueDate)}</span>
                <span className="font-medium">{formatCurrency(r.value.toString())}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
