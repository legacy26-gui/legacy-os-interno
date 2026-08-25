import Link from "next/link";
import { ClipboardPen, Link2, UserPlus, Phone, Mail, MapPin, CalendarDays } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { formatDateTime } from "@/lib/labels";
import {
  ONBOARDING_SECTIONS,
  ONBOARDING_STATUS_LABELS,
  ONBOARDING_STATUS_COLORS,
  labelFor,
  formatAnswer,
} from "@/lib/onboarding-form";
import { deleteOnboarding, saveOnboardingNotes } from "@/lib/actions/onboarding";
import { DiagnosticoSection } from "@/components/diagnostico/diagnostico-section";
import { CopyLink } from "./copy-link";
import { StatusButtons } from "./status-buttons";
import { DeleteFichaButton } from "./delete-ficha-button";
import type { OnboardingStatus } from "@/generated/prisma/enums";

// Os botões de gerar/regenerar diagnóstico rodam a IA nesta rota.
export const maxDuration = 300;

const FILTROS: { key: string; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "NOVO", label: "Novos" },
  { key: "EM_ANDAMENTO", label: "Em andamento" },
  { key: "CONCLUIDO", label: "Concluídos" },
];

export default async function FormulariosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireModuleAccess("formularios");
  const { status } = await searchParams;
  const filtro = FILTROS.some((f) => f.key === status) ? status! : "todos";

  const [fichas, contagem] = await Promise.all([
    prisma.clientOnboarding.findMany({
      where: filtro === "todos" ? {} : { status: filtro as OnboardingStatus },
      orderBy: { createdAt: "desc" },
      include: { client: { select: { id: true, companyName: true } } },
    }),
    prisma.clientOnboarding.groupBy({ by: ["status"], _count: true }),
  ]);

  const novas = contagem.find((c) => c.status === "NOVO")?._count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ClipboardPen size={20} className="text-accent" /> Formulários de novos clientes
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Fichas preenchidas pelos clientes que estão entrando na operação
          {novas > 0 && ` · ${novas} nova(s) pra olhar`}
        </p>
      </div>

      {/* Link que a equipe manda pro cliente */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium flex items-center gap-1.5">
          <Link2 size={13} /> Link do formulário
        </p>
        <CopyLink />
        <p className="text-xs text-foreground-muted">
          É o mesmo link pra todos os clientes novos — pode mandar no WhatsApp assim que fechar a venda. Cada resposta
          cai aqui embaixo.
        </p>
      </div>

      {/* Filtros por status */}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const qtd =
            f.key === "todos"
              ? contagem.reduce((s, c) => s + c._count, 0)
              : contagem.find((c) => c.status === f.key)?._count ?? 0;
          return (
            <Link
              key={f.key}
              href={f.key === "todos" ? "/formularios" : `/formularios?status=${f.key}`}
              className={`text-xs font-medium px-3.5 py-2 rounded-lg border transition-colors ${
                filtro === f.key
                  ? "bg-accent text-accent-foreground border-accent"
                  : "border-border text-foreground-muted hover:bg-surface-muted"
              }`}
            >
              {f.label} ({qtd})
            </Link>
          );
        })}
      </div>

      {fichas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-foreground-muted">
            Nenhuma ficha {filtro === "todos" ? "recebida ainda" : "nesse status"}. Mande o link acima pro cliente novo e
            a resposta aparece aqui.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {fichas.map((ficha) => {
            const respostas = (ficha.answers ?? {}) as Record<string, string | string[]>;
            // Perguntas que já saíram do formulário continuam aparecendo, pra
            // não perder resposta de ficha antiga.
            const idsConhecidos = new Set(ONBOARDING_SECTIONS.flatMap((s) => s.fields.map((f) => f.id)));
            const extras = Object.keys(respostas).filter((k) => !idsConhecidos.has(k));

            return (
              <div key={ficha.id} className="rounded-2xl border border-border bg-surface overflow-hidden">
                <div className="p-5 flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-semibold">{ficha.companyName}</h2>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            ONBOARDING_STATUS_COLORS[ficha.status]
                          }`}
                        >
                          {ONBOARDING_STATUS_LABELS[ficha.status]}
                        </span>
                      </div>
                      <p className="text-sm text-foreground-muted mt-0.5">{ficha.contactName}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-foreground-muted">
                        {ficha.phone && (
                          <a
                            href={`https://wa.me/55${ficha.phone.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:text-accent"
                          >
                            <Phone size={12} /> {ficha.phone}
                          </a>
                        )}
                        {ficha.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail size={12} /> {ficha.email}
                          </span>
                        )}
                        {ficha.city && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={12} /> {ficha.city}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={12} /> {formatDateTime(ficha.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {ficha.client ? (
                        <Link
                          href={`/clientes/${ficha.client.id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-border hover:bg-surface-muted"
                        >
                          Ver cliente
                        </Link>
                      ) : (
                        <Link
                          href={`/clientes/novo?ficha=${ficha.id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent text-accent-foreground hover:opacity-90"
                        >
                          <UserPlus size={14} /> Cadastrar cliente
                        </Link>
                      )}
                      <DeleteFichaButton
                        action={deleteOnboarding.bind(null, ficha.id)}
                        companyName={ficha.companyName}
                      />
                    </div>
                  </div>

                  <StatusButtons id={ficha.id} status={ficha.status} />

                  <details className="group">
                    <summary className="cursor-pointer text-sm font-medium text-accent hover:underline w-fit">
                      Ver todas as respostas
                    </summary>

                    <div className="mt-4 flex flex-col gap-5">
                      {ONBOARDING_SECTIONS.map((secao) => {
                        const preenchidos = secao.fields.filter((f) => {
                          const v = respostas[f.id];
                          return Array.isArray(v) ? v.length > 0 : !!v;
                        });
                        if (preenchidos.length === 0) return null;
                        return (
                          <div key={secao.title}>
                            <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium mb-2">
                              {secao.title}
                            </p>
                            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                              {preenchidos.map((f) => (
                                <div key={f.id} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
                                  <dt className="text-xs text-foreground-muted">{f.label}</dt>
                                  <dd className="text-sm whitespace-pre-wrap">{formatAnswer(respostas[f.id])}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        );
                      })}

                      {extras.length > 0 && (
                        <div>
                          <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium mb-2">
                            Respostas de perguntas antigas
                          </p>
                          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                            {extras.map((k) => (
                              <div key={k}>
                                <dt className="text-xs text-foreground-muted">{labelFor(k)}</dt>
                                <dd className="text-sm whitespace-pre-wrap">{formatAnswer(respostas[k])}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}

                      <form action={saveOnboardingNotes.bind(null, ficha.id)} className="flex flex-col gap-2">
                        <label className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
                          Anotações internas
                        </label>
                        <textarea
                          name="internalNotes"
                          rows={2}
                          defaultValue={ficha.internalNotes ?? ""}
                          placeholder="O que já foi feito, o que falta pedir pro cliente..."
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
                        />
                        <button
                          type="submit"
                          className="self-start text-xs font-medium px-3.5 py-2 rounded-lg border border-border hover:bg-surface-muted"
                        >
                          Salvar anotação
                        </button>
                      </form>
                    </div>
                  </details>

                  <DiagnosticoSection onboardingId={ficha.id} meetingNotes={ficha.meetingNotes} />

                  {ficha.internalNotes && (
                    <p className="text-xs text-foreground-muted border-t border-border pt-3">
                      <span className="font-medium">Anotação:</span> {ficha.internalNotes}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
