import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCheck, Inbox, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { veTodaACarteira } from "@/lib/carteira";
import { formatCurrency, formatDate } from "@/lib/labels";
import {
  EXPLICACAO,
  TETO_DO_CPL_AUTOMATICO,
  type MotivoDaEspera,
} from "@/lib/whatsapp/decidir-envio";
import { DecidirRelatorio } from "./decidir";

// A fila de relatórios que o robô não mandou sozinho.
//
// ── A pergunta desta tela ────────────────────────────────────────────────
//
// "Este relatório pode chegar no grupo do cliente do jeito que está?"
//
// Regra do Guilherme: custo por lead abaixo de R$ 12 sai automático na manhã
// de segunda; de R$ 12 pra cima para aqui e espera a Andrielli.
//
// ── Por que a imagem aparece inteira, e não um resumo ────────────────────
//
// Porque o que vai ser aprovado é a IMAGEM, não os três números do cabeçalho.
// Aprovar por resumo é aprovar outra coisa — e o jeito mais fácil de alguém
// mandar pro cliente um relatório com a campanha errada em destaque é decidir
// sem ter olhado o que o cliente vai ver.
//
// É a mesma imagem que o robô mandaria, desenhada pela mesma rota.

export const metadata = { title: "Relatórios para aprovar" };
export const dynamic = "force-dynamic";

/** A cor de cada motivo. Vermelho pro que é prejuízo, âmbar pro resto. */
const TOM: Record<MotivoDaEspera, string> = {
  "cpl-alto": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "sem-lead": "bg-red-500/15 text-red-600 dark:text-red-400",
  "sem-gasto": "bg-zinc-500/15 text-foreground-muted",
};

export default async function AprovarRelatoriosPage() {
  const user = await requireModuleAccess("gestao-contas");
  // Mesma régua da ação que decide: quem não enxerga a casa inteira não tem
  // como saber se R$ 18 por lead é ruim nesta loja ou normal nela.
  if (!veTodaACarteira(user)) redirect("/dashboard?erro=acesso-negado");

  const [pendentes, decididos] = await Promise.all([
    prisma.relatorioParaAprovar.findMany({
      where: { estado: "PENDENTE" },
      orderBy: [{ semana: "desc" }, { cplCents: "desc" }],
      select: {
        id: true,
        semana: true,
        cplCents: true,
        spendCents: true,
        leads: true,
        motivoDaEspera: true,
        client: { select: { id: true, companyName: true } },
      },
    }),
    // As últimas decisões, pra a tela não ficar vazia e sem memória depois de
    // tudo resolvido — e pra a recusa de alguém ter onde ser consultada.
    prisma.relatorioParaAprovar.findMany({
      where: { estado: { not: "PENDENTE" } },
      orderBy: { decididoEm: "desc" },
      take: 12,
      select: {
        id: true,
        semana: true,
        estado: true,
        observacao: true,
        decididoEm: true,
        client: { select: { companyName: true } },
        decididoPor: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <CheckCheck size={19} className="text-accent" /> Relatórios para
          aprovar
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Custo por lead abaixo de{" "}
          {formatCurrency(TETO_DO_CPL_AUTOMATICO / 100)} sai sozinho na segunda
          de manhã. Daí pra cima para aqui e espera você olhar.
        </p>
      </div>

      {pendentes.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface text-center py-16 text-foreground-muted">
          <Inbox size={28} className="mx-auto mb-2 opacity-40" />
          <p className="font-medium">Nada esperando</p>
          <p className="text-sm mt-1">
            Ou a semana foi barata em todas as lojas, ou o robô ainda não rodou.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {pendentes.map((p) => {
            const motivo = p.motivoDaEspera as MotivoDaEspera;
            return (
              <div
                key={p.id}
                className="rounded-2xl border border-border bg-surface overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <Link
                      href={`/meta-ads/${p.client.id}`}
                      className="font-semibold hover:text-accent hover:underline"
                    >
                      {p.client.companyName}
                    </Link>
                    <p className="text-xs text-foreground-muted mt-0.5">
                      Semana de {formatDate(p.semana)}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${TOM[motivo] ?? TOM["sem-gasto"]}`}
                  >
                    {EXPLICACAO[motivo] ?? p.motivoDaEspera}
                  </span>
                </div>

                <div className="px-5 py-3 flex gap-6 flex-wrap border-b border-border bg-surface-muted/40">
                  <Numero
                    titulo="Custo por lead"
                    valor={
                      p.cplCents === null
                        ? "—"
                        : formatCurrency(p.cplCents / 100)
                    }
                    forte
                  />
                  <Numero
                    titulo="Investido"
                    valor={formatCurrency(p.spendCents / 100)}
                  />
                  <Numero titulo="Leads" valor={String(p.leads)} />
                </div>

                {/* A imagem que o cliente receberia, exatamente ela.
                    `loading="lazy"` porque numa segunda com dez lojas na fila
                    isto são dez desenhos de imagem no servidor — e quem está
                    decidindo olha uma de cada vez. */}
                <div className="px-5 py-4 border-b border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/meta-ads/relatorio?loja=${p.client.id}&periodo=7`}
                    alt={`Relatório da semana — ${p.client.companyName}`}
                    loading="lazy"
                    className="w-full max-w-md rounded-xl border border-border"
                  />
                </div>

                <div className="px-5 py-4">
                  <DecidirRelatorio id={p.id} loja={p.client.companyName} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {decididos.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium flex items-center gap-2">
              <TrendingUp size={13} /> Decididos recentemente
            </p>
          </div>
          <div className="divide-y divide-border/60">
            {decididos.map((d) => (
              <div key={d.id} className="px-5 py-2.5">
                <p className="text-sm">
                  <span className="font-medium">{d.client.companyName}</span>
                  <span className="text-foreground-muted">
                    {" "}
                    · semana de {formatDate(d.semana)} ·{" "}
                  </span>
                  <span
                    className={
                      d.estado === "APROVADO"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }
                  >
                    {d.estado === "APROVADO" ? "mandado" : "não mandado"}
                  </span>
                  {d.decididoPor && (
                    <span className="text-foreground-muted">
                      {" "}
                      por {d.decididoPor.name.split(" ")[0]}
                    </span>
                  )}
                </p>
                {d.observacao && (
                  <p className="text-xs text-foreground-muted mt-0.5">
                    {d.observacao}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Numero({
  titulo,
  valor,
  forte,
}: {
  titulo: string;
  valor: string;
  forte?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-foreground-muted font-medium">
        {titulo}
      </p>
      <p className={`mt-0.5 ${forte ? "text-lg font-semibold" : "text-sm"}`}>
        {valor}
      </p>
    </div>
  );
}
