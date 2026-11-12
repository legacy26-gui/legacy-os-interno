import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, ExternalLink, Building2, Phone, Mail, MapPin, CreditCard, MapPinCheck, Video } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { escopoDaCarteira } from "@/lib/carteira";
import { canAccessModule } from "@/lib/permissions";
import { CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS, formatCurrency, formatDate, formatDateTime } from "@/lib/labels";
import { saldoEmReais, tempoDesde } from "@/lib/meta/saldo";
import { deleteClient } from "@/lib/actions/clients";
import { DiagnosticoSection } from "@/components/diagnostico/diagnostico-section";
import { BlocoMetaAds, type ContaNaTela } from "./meta-ads";
import { HistoryForm } from "./history-form";
import { AttachmentForm } from "./attachment-form";
import { DeleteClientButton } from "../delete-client-button";
import { VisitaCliente } from "../visita-cliente";

// O botão de regenerar diagnóstico roda a IA nesta rota.
export const maxDuration = 300;

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModuleAccess("clientes");
  const canSeeValues = canAccessModule(user.role, "financeiro");
  const { id } = await params;

  // findFirst com o recorte junto, e não findUnique: filtrar a LISTA não
  // protege nada — quem tiver o endereço de um cliente de outro gestor chega
  // na ficha digitando. O id e a carteira vão na mesma consulta, e o que não é
  // dele simplesmente não existe (404, abaixo).
  const client = await prisma.client.findFirst({
    where: { id, ...escopoDaCarteira(user) },
    include: {
      manager: { select: { name: true } },
      history: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      // Ficha do formulário de entrada: é dela que vem o diagnóstico da IA.
      onboardings: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, meetingNotes: true } },
      attachments: { orderBy: { uploadedAt: "desc" } },
      revenues: { orderBy: { dueDate: "desc" }, take: 5 },
      contracts: { orderBy: { createdAt: "desc" }, take: 5 },
      _count: { select: { tasks: true, campaigns: true, contracts: true } },
      // A última gravação ENTREGUE. Não é campo novo nem coisa pra alguém
      // preencher: a baixa da entrega, lá em Gravações, já é o registro. Um
      // dado que se digita em dois lugares desencontra num deles.
      gravacoes: {
        where: { entregueEm: { not: null } },
        orderBy: { entregueEm: "desc" },
        take: 1,
        select: { entregueEm: true, gravadoEm: true, quantidade: true },
      },
      // Contas de anúncio da Meta, com a última leitura de saldo de cada uma.
      // take: 1 no snapshot porque a tela só mostra o número de agora — o
      // histórico existe pra olhar consumo, e isso é outra tela.
      metaAdAccounts: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          metaAccountId: true,
          isPrepay: true,
          lastSyncedAt: true,
          lastSyncError: true,
          balanceSnapshots: {
            orderBy: { capturedAt: "desc" },
            take: 1,
            select: { availableCents: true, capturedAt: true },
          },
        },
      },
    },
  });

  if (!client) notFound();

  const ultimaGravacao = client.gravacoes[0] ?? null;
  const diasSemGravar = ultimaGravacao?.entregueEm
    ? Math.max(0, Math.round((Date.now() - ultimaGravacao.entregueEm.getTime()) / 86_400_000))
    : null;

  const boundDelete = deleteClient.bind(null, client.id);

  // Vincular conta é da direção; ver o saldo é de quem cuida da loja.
  const podeVincularConta = user.role === "ADMIN" || user.role === "GERENTE";

  // "Atualizado há X" conta a idade do NÚMERO (quando o saldo foi capturado),
  // não da tentativa. Se a última busca falhou, o saldo na tela continua sendo
  // o de ontem — e dizer "atualizado agora" em cima dele seria mentira, com o
  // erro logo abaixo desmentindo a própria tela.
  const contasMeta: ContaNaTela[] = client.metaAdAccounts.map((c) => {
    const ultimo = c.balanceSnapshots[0] ?? null;
    const quando = c.isPrepay ? (ultimo?.capturedAt ?? null) : c.lastSyncedAt;
    return {
      id: c.id,
      metaAccountId: c.metaAccountId,
      isPrepay: c.isPrepay,
      saldoTexto: ultimo ? saldoEmReais(ultimo.availableCents) : null,
      atualizadoTexto: quando ? tempoDesde(quando) : null,
      erro: c.lastSyncError,
    };
  });

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
            <Building2 size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{client.companyName}</h1>
            <p className="text-sm text-foreground-muted">
              {client.contactName} · Gestor: {client.manager?.name ?? "sem gestor"}
            </p>
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
            {canSeeValues && <span className="font-semibold text-base">{formatCurrency(client.monthlyValue.toString())}/mês</span>}
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

      {/* Última visita na loja: um botão, apertou marca hoje. */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium flex items-center gap-2">
            <MapPinCheck size={14} /> Última visita na loja
          </p>
          <p className="text-xs text-foreground-muted mt-1">
            Apertou o botão, marca o dia de hoje. No lápis dá pra escrever outra data.
          </p>
        </div>
        <VisitaCliente
          clientId={client.id}
          ultimaVisitaEm={client.ultimaVisitaEm?.toISOString() ?? null}
          dataForm={client.ultimaVisitaEm ? client.ultimaVisitaEm.toISOString().slice(0, 10) : ""}
          dataLabel={formatDate(client.ultimaVisitaEm)}
        />
      </div>

      {/* Vídeos: quando foi a última entrega. Um dos três motivos de uma loja
          parar de vender é ficar sem vídeo novo. */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium flex items-center gap-2">
            <Video size={14} /> Última gravação entregue
          </p>
          <p className="text-xs text-foreground-muted mt-1">
            Vem da baixa da entrega, em Gravações — não precisa marcar aqui.
          </p>
        </div>
        {ultimaGravacao ? (
          <div className="text-right">
            <p className="font-medium">{formatDate(ultimaGravacao.gravadoEm)}</p>
            <p className="text-xs text-foreground-muted">
              {diasSemGravar === 0
                ? "entregue hoje"
                : `há ${diasSemGravar} ${diasSemGravar === 1 ? "dia" : "dias"}`}{" "}
              · {ultimaGravacao.quantidade} {ultimaGravacao.quantidade === 1 ? "carro" : "carros"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-foreground-muted">Nenhuma entrega registrada ainda</p>
        )}
      </div>

      {/* Meta Ads: saldo pré-pago (Pix). Conta que zera para a campanha, e
          campanha parada é loja sem lead no dia seguinte. */}
      <BlocoMetaAds clientId={client.id} contas={contasMeta} podeVincular={podeVincularConta} />

      {client.onboardings[0] && (
        <DiagnosticoSection
          onboardingId={client.onboardings[0].id}
          meetingNotes={client.onboardings[0].meetingNotes}
        />
      )}

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

      {canSeeValues && (
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
      )}
    </div>
  );
}
