import Link from "next/link";
import { ArrowLeft, Megaphone, AlertTriangle, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { exigirClienteDaCarteira } from "@/lib/carteira";
import { canAccessModule } from "@/lib/permissions";
import { saldoEmReais, estadoDoSaldo, COR_DO_SALDO, tempoDesde } from "@/lib/meta/saldo";
import {
  somar,
  custoPorLead,
  ctr,
  reais,
  numero,
  desdeQuando,
  rotuloDoTipoDeLead,
  PERIODOS,
  DIAS_PADRAO,
  type Numeros,
  type Periodo,
} from "@/lib/meta/insights";
import { AbasDaSecao } from "@/components/abas-da-secao";
import { AcoesDaLoja } from "./acoes";

// Uma loja, campanha por campanha.
//
// A hierarquia é a mesma da Meta — campanha, e dentro dela os conjuntos — mas
// o número que manda aqui é o custo por lead, não o gasto. Gasto grande em
// campanha que entrega lead barato é dinheiro bem posto; gasto pequeno em
// campanha que não entrega nada é dinheiro queimado devagar, que é pior
// porque ninguém percebe.

export const maxDuration = 60;

export default async function LojaNoMetaAdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ dias?: string }>;
}) {
  const user = await requireModuleAccess("clientes");
  const { clientId } = await params;
  const { dias } = await searchParams;

  // A trava que importa: o id vem da URL, e loja de outro gestor dá 404 —
  // não "acesso negado", que confirmaria que ela existe.
  const cliente = await exigirClienteDaCarteira(user, clientId, {
    id: true,
    companyName: true,
    manager: { select: { name: true } },
  });

  const periodo: Periodo = PERIODOS.find((p) => String(p) === dias) ?? DIAS_PADRAO;
  const de = desdeQuando(periodo);

  // Mesma proteção da lista: se o banco recusar alguma coisa, a direção vê a
  // frase dele em vez da tela preta do Next.
  let contas: Awaited<ReturnType<typeof carregarContas>>;
  let linhas: Awaited<ReturnType<typeof carregarLinhas>>;
  try {
    contas = await carregarContas(clientId);
    linhas = await carregarLinhas(contas.map((c) => c.id), de);
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return (
      <div className="max-w-2xl rounded-2xl border border-red-500/50 bg-red-500/5 p-6 flex flex-col gap-3">
        <h1 className="font-semibold flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-500" /> Não deu pra carregar{" "}
          {cliente.companyName}
        </h1>
        <p className="text-sm text-foreground-muted">
          O resto do sistema continua funcionando — é só esta tela.
        </p>
        {(user.role === "ADMIN" || user.role === "GERENTE") && (
          <div className="border-t border-border pt-3">
            <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-1">
              O que o servidor respondeu
            </p>
            <p className="text-xs font-mono text-red-500 break-words">{detalhe}</p>
          </div>
        )}
        <Link href="/meta-ads" className="text-sm text-accent hover:underline">
          Voltar para todas as lojas
        </Link>
      </div>
    );
  }

  // Junta por campanha, e dentro dela por conjunto. Feito em memória de
  // propósito: são os conjuntos de uma loja num período curto, e agrupar em
  // dois níveis no banco custaria duas consultas pra economizar nada.
  const campanhas = new Map<
    string,
    { nome: string; conjuntos: Map<string, { nome: string; n: Numeros[] }> }
  >();

  for (const l of linhas) {
    const chaveC = l.campaignId ?? "sem-campanha";
    if (!campanhas.has(chaveC)) {
      campanhas.set(chaveC, {
        nome: l.campaignName ?? "Campanha sem nome",
        conjuntos: new Map(),
      });
    }
    const c = campanhas.get(chaveC)!;
    if (l.campaignName) c.nome = l.campaignName;
    if (!c.conjuntos.has(l.adsetId)) {
      c.conjuntos.set(l.adsetId, { nome: l.adsetName, n: [] });
    }
    c.conjuntos.get(l.adsetId)!.n.push(l);
  }

  const porCampanha = [...campanhas.values()]
    .map((c) => {
      const conjuntos = [...c.conjuntos.values()]
        .map((cj) => ({ nome: cj.nome, numeros: somar(cj.n) }))
        .sort((a, b) => b.numeros.spendCents - a.numeros.spendCents);
      return { nome: c.nome, conjuntos, numeros: somar(conjuntos.map((x) => x.numeros)) };
    })
    // Quem mais consumiu dinheiro primeiro: é onde a decisão pesa mais.
    .sort((a, b) => b.numeros.spendCents - a.numeros.spendCents);

  const total = somar(porCampanha.map((c) => c.numeros));
  const cplTotal = custoPorLead(total);
  const ctrTotal = ctr(total);

  const prePagas = contas.filter((c) => c.isPrepay && c.balanceSnapshots[0]);
  const saldo = prePagas.length
    ? prePagas.reduce((s, c) => s + c.balanceSnapshots[0].availableCents, 0)
    : null;
  const leituraMaisVelha = prePagas.length
    ? new Date(Math.min(...prePagas.map((c) => c.balanceSnapshots[0].capturedAt.getTime())))
    : null;

  // Nunca buscado não é zero: antes da primeira leitura, "R$ 0,00 investido"
  // diria que a loja não gastou nada, quando a verdade é que ninguém
  // perguntou ainda.
  const jaBuscou = contas.some((c) => c.lastSyncedAt);

  const podeConfigurar = user.role === "ADMIN" || user.role === "GERENTE";
  const tiposUsados = [...new Set(contas.map((c) => c.leadActionType))];

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div>
        <Link
          href="/meta-ads"
          className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground mb-2"
        >
          <ArrowLeft size={14} /> Todas as lojas
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Megaphone size={20} className="text-accent" /> {cliente.companyName}
            </h1>
            <p className="text-sm text-foreground-muted mt-0.5">
              {contas.map((c) => c.metaAccountId).join(" · ")}
              {cliente.manager?.name && ` · Gestor: ${cliente.manager.name.split(" ")[0]}`}
            </p>
          </div>
          <AcoesDaLoja
            clientId={cliente.id}
            contas={contas.map((c) => ({
              id: c.id,
              metaAccountId: c.metaAccountId,
              leadActionType: c.leadActionType,
            }))}
            podeConfigurar={podeConfigurar}
          />
        </div>
      </div>

      <AbasDaSecao
        abas={PERIODOS.map((p) => ({
          href:
            p === DIAS_PADRAO
              ? `/meta-ads/${cliente.id}`
              : `/meta-ads/${cliente.id}?dias=${p}`,
          label: `${p} dias`,
        }))}
      />

      {contas.some((c) => c.lastSyncError) && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3">
          {contas
            .filter((c) => c.lastSyncError)
            .map((c) => (
              <p
                key={c.id}
                className="text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2"
              >
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <span>
                  <span className="font-mono text-xs">{c.metaAccountId}</span>: {c.lastSyncError}
                </span>
              </p>
            ))}
        </div>
      )}

      {/* Saldo e resultado lado a lado: é a conversa inteira sobre uma loja. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium flex items-center gap-1.5">
            <Wallet size={12} /> Saldo
          </p>
          {prePagas.length === 0 ? (
            <p className="text-sm text-foreground-muted mt-1.5">
              {contas.length === 0 ? "sem conta" : "cartão"}
            </p>
          ) : saldo === null ? (
            <p className="text-sm text-foreground-muted mt-1.5">indisponível</p>
          ) : (
            <>
              <p className={`text-xl font-semibold mt-1 ${COR_DO_SALDO[estadoDoSaldo(saldo)]}`}>
                {saldoEmReais(saldo)}
              </p>
              {leituraMaisVelha && (
                <p className="text-xs text-foreground-muted">{tempoDesde(leituraMaisVelha)}</p>
              )}
            </>
          )}
        </div>
        <Resumo
          titulo="Investido"
          valor={jaBuscou ? reais(total.spendCents) : "—"}
          fraco={!jaBuscou}
        />
        <Resumo titulo="Leads" valor={jaBuscou ? numero(total.leads) : "—"} fraco={!jaBuscou} />
        <Resumo
          titulo="Custo por lead"
          valor={jaBuscou && cplTotal !== null ? reais(cplTotal) : "—"}
          fraco={!jaBuscou || cplTotal === null}
        />
        <Resumo
          titulo="CTR do link"
          valor={jaBuscou && ctrTotal !== null ? `${ctrTotal.toFixed(2)}%` : "—"}
          fraco={!jaBuscou || ctrTotal === null}
        />
      </div>

      {total.spendCents > 0 && total.leads === 0 && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Gastou {reais(total.spendCents)} nestes {periodo} dias e não registrou nenhum lead.
            Hoje esta loja conta como lead:{" "}
            <strong>{tiposUsados.map(rotuloDoTipoDeLead).join(", ")}</strong>. Se as campanhas dela
            são de outro tipo, o número fica em zero mesmo havendo resultado — dá pra trocar aqui
            em cima.
          </p>
        </div>
      )}

      {contas.length === 0 ? (
        <p className="text-sm text-foreground-muted rounded-xl border border-border bg-surface p-8 text-center">
          Esta loja ainda não tem conta de anúncio vinculada.{" "}
          <Link href={`/clientes/${cliente.id}`} className="text-accent hover:underline">
            Vincular na ficha dela
          </Link>
          .
        </p>
      ) : porCampanha.length === 0 ? (
        <p className="text-sm text-foreground-muted rounded-xl border border-border bg-surface p-8 text-center">
          Nenhum número nestes {periodo} dias. Aperte “Atualizar números” pra buscar na Meta — ou a
          conta não rodou nada no período.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {porCampanha.map((c) => {
            const cpl = custoPorLead(c.numeros);
            return (
              <div key={c.nome} className="rounded-2xl border border-border bg-surface overflow-hidden">
                <div className="px-5 py-3 border-b border-border flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-medium">{c.nome}</p>
                  <p className="text-sm text-foreground-muted tabular-nums">
                    {reais(c.numeros.spendCents)} · {numero(c.numeros.leads)}{" "}
                    {c.numeros.leads === 1 ? "lead" : "leads"} ·{" "}
                    <span className={cpl === null ? "" : "font-semibold text-foreground"}>
                      {cpl === null ? "sem lead" : `${reais(cpl)}/lead`}
                    </span>
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
                        <th className="px-5 py-2 font-medium">Conjunto</th>
                        <th className="px-5 py-2 font-medium text-right">Investido</th>
                        <th className="px-5 py-2 font-medium text-right">Leads</th>
                        <th className="px-5 py-2 font-medium text-right">Custo/lead</th>
                        <th className="px-5 py-2 font-medium text-right hidden md:table-cell">
                          Cliques
                        </th>
                        <th className="px-5 py-2 font-medium text-right hidden lg:table-cell">
                          CTR
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {c.conjuntos.map((cj) => {
                        const cplCj = custoPorLead(cj.numeros);
                        const ctrCj = ctr(cj.numeros);
                        return (
                          <tr key={cj.nome} className="hover:bg-surface-muted transition-colors">
                            <td className="px-5 py-2.5">{cj.nome}</td>
                            <td className="px-5 py-2.5 text-right tabular-nums">
                              {reais(cj.numeros.spendCents)}
                            </td>
                            <td className="px-5 py-2.5 text-right tabular-nums">
                              {cj.numeros.leads > 0 ? (
                                numero(cj.numeros.leads)
                              ) : (
                                <span className="text-foreground-muted">—</span>
                              )}
                            </td>
                            <td className="px-5 py-2.5 text-right tabular-nums">
                              {cplCj === null ? (
                                <span className="text-foreground-muted">—</span>
                              ) : (
                                reais(cplCj)
                              )}
                            </td>
                            <td className="px-5 py-2.5 text-right tabular-nums text-foreground-muted hidden md:table-cell">
                              {numero(cj.numeros.linkClicks)}
                            </td>
                            <td className="px-5 py-2.5 text-right tabular-nums text-foreground-muted hidden lg:table-cell">
                              {ctrCj === null ? "—" : `${ctrCj.toFixed(2)}%`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-foreground-muted">
        Os números são dos últimos {periodo} dias, dia a dia, como a Meta fecha. O sistema guarda
        30 dias — períodos maiores ficam no Gerenciador.{" "}
        {canAccessModule(user.role, "financeiro") && (
          <>
            O investido aqui é o gasto na Meta, não a mensalidade da loja — essa fica no
            Financeiro.
          </>
        )}
      </p>
    </div>
  );
}

/** As contas de anúncio da loja, com a última leitura de saldo. */
async function carregarContas(clientId: string) {
  return prisma.metaAdAccount.findMany({
    where: { clientId, active: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      metaAccountId: true,
      isPrepay: true,
      leadActionType: true,
      lastSyncedAt: true,
      lastSyncError: true,
      balanceSnapshots: {
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: { availableCents: true, capturedAt: true },
      },
    },
  });
}

/** Os dias de conjunto do período. */
async function carregarLinhas(idsDasContas: string[], de: Date) {
  if (idsDasContas.length === 0) return [];
  return prisma.adsetInsightDaily.findMany({
    where: { adAccountId: { in: idsDasContas }, date: { gte: de } },
    select: {
      adsetId: true,
      adsetName: true,
      campaignId: true,
      campaignName: true,
      spendCents: true,
      impressions: true,
      clicks: true,
      linkClicks: true,
      leads: true,
    },
  });
}

function Resumo({ titulo, valor, fraco }: { titulo: string; valor: string; fraco?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">{titulo}</p>
      <p
        className={`text-xl font-semibold mt-1 tabular-nums ${fraco ? "text-foreground-muted" : ""}`}
      >
        {valor}
      </p>
    </div>
  );
}
