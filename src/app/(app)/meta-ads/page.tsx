import Link from "next/link";
import { Megaphone, AlertTriangle, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CARTEIRA, escopoDaCarteira, veTodaACarteira } from "@/lib/carteira";
import {
  saldoEmReais,
  tempoDesde,
  estadoDoSaldo,
  COR_DO_SALDO,
  SALDO_BAIXO,
} from "@/lib/meta/saldo";
import {
  somar,
  custoPorLead,
  reais,
  numero,
  desdeQuando,
  janelaDoTexto,
  PERIODOS,
  DIAS_PADRAO,
  ZERO,
  type Numeros,
  type Janela,
} from "@/lib/meta/insights";
import { AbasDaSecao } from "@/components/abas-da-secao";
import { BotaoAtualizarTudo } from "./atualizar-tudo";
import { AtualizarLoja } from "./atualizar-loja";

// Meta Ads: a carteira inteira numa tela — saldo e resultado de cada loja.
//
// Pra que serve: as duas perguntas que se faz todo dia sobre uma loja são
// "tem dinheiro na conta?" e "está dando lead?". Elas moram em telas
// diferentes no Gerenciador da Meta, e por isso ninguém olha as duas. Aqui
// são a mesma linha.
//
// "Cada um só vê o seu": o recorte é o mesmo do resto do sistema
// (escopoDaCarteira). Gestor de tráfego vê as lojas dele, direção vê a casa.
//
// A ordem é UMA: nome da loja, de A a Z. Lista que se reordena pelo gasto ou
// pelo saldo embaralha a tela a cada atualização, e aí ninguém acha a loja que
// veio procurar. A urgência vem da cor e do aviso no topo, não da posição.

// A varredura tem orçamento de 45s (ver ORCAMENTO_MS em lib/actions/meta-ads).
// 60 aqui dá a folga pra ela terminar e responder, e é um valor que vale em
// qualquer plano da Vercel — 300 só vale em alguns.
export const maxDuration = 60;

export default async function MetaAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const user = await requireModuleAccess("clientes");
  const { dias } = await searchParams;

  const janela = janelaDoTexto(dias);

  // Buscar os dados dentro de um try: se o banco recusar alguma coisa, a
  // direção vê a MENSAGEM, não a tela preta do Next.
  //
  // Em produção o Next apaga a mensagem do erro e deixa só um código, que só
  // se lê no painel da Vercel. Na prática isso vira "quebrou e ninguém sabe
  // por quê". Pegando aqui, a frase do Postgres aparece na tela de quem pode
  // fazer algo com ela.
  let dados: Awaited<ReturnType<typeof carregar>>;
  try {
    dados = await carregar(user, janela);
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return (
      <TelaDeFalha
        detalhe={veTodaACarteira(user) ? detalhe : null}
      />
    );
  }

  const { clientes, numerosDaConta } = dados;

  const linhas = clientes.map((c) => {
    const n = somar(c.metaAdAccounts.map((a) => numerosDaConta.get(a.id) ?? ZERO));
    return { cliente: c, numeros: n, cpl: custoPorLead(n) };
  });

  const comConta = clientes.filter((c) => c.metaAdAccounts.length > 0);
  const semConta = clientes.filter((c) => c.metaAdAccounts.length === 0);

  // Quem está acabando. Só conta pré-paga com leitura boa entra: conta sem
  // saldo lido não é conta com saldo baixo, e juntar as duas faria o aviso
  // gritar por um erro de leitura.
  const acabando = comConta.flatMap((c) =>
    c.metaAdAccounts
      .filter((a) => a.isPrepay && a.balanceSnapshots[0])
      .filter((a) => a.balanceSnapshots[0].availableCents < SALDO_BAIXO)
      .map((a) => ({
        loja: c.companyName,
        centavos: a.balanceSnapshots[0].availableCents,
      }))
  );

  // Gastou e não teve lead nenhum: ou a campanha está mesmo sem resultado, ou
  // o tipo de lead configurado não é o que essa conta usa. Os dois casos
  // pedem alguém olhando, e os dois se resolvem na tela da loja.
  const gastandoSemLead = linhas.filter((l) => l.numeros.spendCents > 0 && l.numeros.leads === 0);

  const totalDaCasa = somar(linhas.map((l) => l.numeros));
  const cplDaCasa = custoPorLead(totalDaCasa);
  const vePorGestor = veTodaACarteira(user);

  // Nunca buscado não é zero.
  //
  // Enquanto nenhuma conta foi lida, "Investido: R$ 0,00" diria que a casa não
  // gastou nada — e o que é verdade é que o sistema ainda não perguntou. É o
  // mesmo erro de mostrar saldo zerado quando a leitura falhou, e aqui é mais
  // traiçoeiro: zero de gasto parece notícia boa.
  //
  // Depois de buscado, zero é zero de verdade: a conta não rodou no período.
  //
  // "Buscado" quer dizer buscado COM SUCESSO. Tentativa que terminou em erro
  // não ensina nada sobre o gasto, e mostrar R$ 0,00 em cima dela seria a
  // mesma mentira de antes — com o agravante de que zero de gasto parece
  // notícia boa.
  const jaBuscou = clientes.some((c) =>
    c.metaAdAccounts.some((a) => a.lastSyncedAt && !a.lastSyncError)
  );

  return (
    <div className="flex flex-col gap-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Megaphone size={20} className="text-accent" /> Meta Ads
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Saldo e resultado de cada conta de anúncio.{" "}
            {vePorGestor ? "Todas as lojas da casa." : "Suas lojas."}
          </p>
        </div>
        <BotaoAtualizarTudo />
      </div>

      <AbasDaSecao
        abas={[
          ...PERIODOS.map((p) => ({
            href: p === DIAS_PADRAO ? "/meta-ads" : `/meta-ads?dias=${p}`,
            label: `${p} dias`,
          })),
          { href: "/meta-ads?dias=tudo", label: "Vida inteira" },
        ]}
      />

      {acabando.length > 0 && (
        <div className="rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-red-500 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              {acabando.length} {acabando.length === 1 ? "conta" : "contas"} com saldo acabando:{" "}
              <span className="font-normal">
                {acabando.map((a) => `${a.loja} (${saldoEmReais(a.centavos)})`).join(", ")}
              </span>
            </span>
          </p>
        </div>
      )}

      {gastandoSemLead.length > 0 && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3">
          <p className="text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              <strong>
                {gastandoSemLead.length}{" "}
                {gastandoSemLead.length === 1 ? "loja gastou" : "lojas gastaram"} sem nenhum lead
              </strong>{" "}
              {janela === "tudo" ? " na vida inteira das contas" : ` nestes ${janela} dias`}:{" "}
              {gastandoSemLead.map((l) => l.cliente.companyName).join(", ")}. Pode ser campanha sem
              resultado mesmo, ou o tipo de lead configurado não ser o que a conta usa — abra a
              loja pra ver.
            </span>
          </p>
        </div>
      )}

      {/* O resumo do período: é o número que se olha antes de olhar a lista. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Resumo
          titulo="Investido"
          valor={jaBuscou ? reais(totalDaCasa.spendCents) : "—"}
          fraco={!jaBuscou}
        />
        <Resumo
          titulo="Leads"
          valor={jaBuscou ? numero(totalDaCasa.leads) : "—"}
          fraco={!jaBuscou}
        />
        <Resumo
          titulo="Custo por lead"
          valor={jaBuscou && cplDaCasa !== null ? reais(cplDaCasa) : "—"}
          fraco={!jaBuscou || cplDaCasa === null}
        />
        <Resumo
          titulo="Lojas com conta"
          valor={`${comConta.length} de ${clientes.length}`}
          fraco={semConta.length > 0}
        />
      </div>

      {clientes.length === 0 ? (
        <p className="text-sm text-foreground-muted rounded-xl border border-border bg-surface p-8 text-center">
          Nenhuma loja na sua carteira ainda.
        </p>
      ) : (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Loja</th>
                  {vePorGestor && (
                    <th className="px-4 py-3 font-medium hidden xl:table-cell">Gestor</th>
                  )}
                  <th className="px-4 py-3 font-medium text-right">Saldo</th>
                  <th className="px-4 py-3 font-medium text-right">Investido</th>
                  <th className="px-4 py-3 font-medium text-right">Leads</th>
                  <th className="px-4 py-3 font-medium text-right">Custo/lead</th>
                  <th className="px-4 py-3 font-medium text-right hidden lg:table-cell">
                    Atualizado
                  </th>
                  <th className="px-2 py-3 font-medium w-10">
                    <span className="sr-only">Atualizar</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map(({ cliente: c, numeros: n, cpl }) => {
                  const contas = c.metaAdAccounts;
                  const prePagas = contas.filter((a) => a.isPrepay);
                  const comSaldo = prePagas.filter((a) => a.balanceSnapshots[0]);
                  const saldo = comSaldo.length
                    ? comSaldo.reduce((s, a) => s + a.balanceSnapshots[0].availableCents, 0)
                    : null;
                  // A idade do NÚMERO, não da tentativa: a leitura mais velha
                  // entre as contas da loja é o que vale, porque é ela que
                  // está atrasando a linha.
                  const capturas = comSaldo.map((a) => a.balanceSnapshots[0].capturedAt.getTime());
                  const quando = capturas.length ? new Date(Math.min(...capturas)) : null;
                  const erro = contas.find((a) => a.lastSyncError)?.lastSyncError ?? null;

                  return (
                    <tr key={c.id} className="hover:bg-surface-muted transition-colors">
                      <td className="px-4 py-3 align-top">
                        {contas.length > 0 ? (
                          <Link
                            href={`/meta-ads/${c.id}`}
                            className="font-medium hover:text-accent"
                          >
                            {c.companyName}
                          </Link>
                        ) : (
                          <span className="font-medium">{c.companyName}</span>
                        )}
                        <span className="block text-xs font-mono text-foreground-muted mt-0.5">
                          {contas.map((a) => a.metaAccountId).join(" · ") || (
                            <Link
                              href={`/clientes/${c.id}`}
                              className="inline-flex items-center gap-1 font-sans hover:text-accent"
                            >
                              <Plus size={12} /> vincular conta
                            </Link>
                          )}
                        </span>
                        {erro && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-start gap-1.5">
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                            <span>{erro}</span>
                          </p>
                        )}
                      </td>
                      {vePorGestor && (
                        <td className="px-4 py-3 text-foreground-muted hidden xl:table-cell align-top">
                          {c.manager?.name?.split(" ")[0] ?? "—"}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right align-top">
                        {prePagas.length === 0 ? (
                          <span className="text-xs text-foreground-muted">cartão</span>
                        ) : saldo === null ? (
                          // "indisponível", nunca R$ 0,00: saldo que o sistema
                          // não conseguiu ler não é conta zerada.
                          <span className="text-xs text-foreground-muted">indisponível</span>
                        ) : (
                          <span className={`font-semibold ${COR_DO_SALDO[estadoDoSaldo(saldo)]}`}>
                            {saldoEmReais(saldo)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right align-top tabular-nums">
                        {n.spendCents > 0 ? (
                          reais(n.spendCents)
                        ) : (
                          <span className="text-foreground-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right align-top tabular-nums">
                        {n.leads > 0 ? (
                          <span className="font-semibold">{numero(n.leads)}</span>
                        ) : (
                          <span className="text-foreground-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right align-top tabular-nums">
                        {/* Sem lead não existe custo por lead: "—" e não
                            R$ 0,00. Gastar sem lead é problema, e zero ali
                            pareceria o melhor resultado da lista. */}
                        {cpl === null ? (
                          <span className="text-foreground-muted">—</span>
                        ) : (
                          reais(cpl)
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-foreground-muted hidden lg:table-cell align-top">
                        {quando ? tempoDesde(quando) : contas.length ? "nunca" : ""}
                      </td>
                      <td className="px-2 py-3 align-top text-right">
                        {/* Loja sem conta não tem o que buscar. */}
                        {contas.length > 0 && (
                          <AtualizarLoja clientId={c.id} nome={c.companyName} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-foreground-muted">
        Clique na loja pra ver campanha por campanha. Investido, leads e custo por lead são dos
        {janela === "tudo" ? "toda a vida das contas" : `últimos ${janela} dias`}. Para vincular
        uma conta, abra a loja e use o bloco “Meta Ads” na
        ficha dela.
      </p>
    </div>
  );
}

/**
 * As duas consultas da tela, num lugar só pra poderem ser protegidas por um
 * try/catch sem embrulhar o desenho da página junto.
 */
async function carregar(user: Parameters<typeof escopoDaCarteira>[0], janela: Janela) {
  const clientes = await prisma.client.findMany({
    where: { ...CARTEIRA, ...escopoDaCarteira(user) },
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      manager: { select: { name: true } },
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

  // Os números do período, somados por conta. groupBy e não somar em
  // JavaScript: trinta dias de conjunto de anúncio por loja é muita linha pra
  // trazer só pra somar.
  const idsDasContas = clientes.flatMap((c) => c.metaAdAccounts.map((a) => a.id));
  const SOMAS = {
    spendCents: true,
    impressions: true,
    clicks: true,
    linkClicks: true,
    leads: true,
  } as const;

  // "Vida inteira" vem da outra tabela: ela guarda um total por anúncio em vez
  // de um por dia, justamente pra não ter que somar anos de linha toda vez.
  const porConta = !idsDasContas.length
    ? []
    : janela === "tudo"
      ? await prisma.metaLifetime.groupBy({
          by: ["adAccountId"],
          where: { adAccountId: { in: idsDasContas } },
          _sum: SOMAS,
        })
      : await prisma.metaInsightDaily.groupBy({
          by: ["adAccountId"],
          where: { adAccountId: { in: idsDasContas }, date: { gte: desdeQuando(janela) } },
          _sum: SOMAS,
        });

  const numerosDaConta = new Map<string, Numeros>(
    porConta.map((g: (typeof porConta)[number]) => [
      g.adAccountId,
      {
        spendCents: g._sum.spendCents ?? 0,
        impressions: g._sum.impressions ?? 0,
        clicks: g._sum.clicks ?? 0,
        linkClicks: g._sum.linkClicks ?? 0,
        leads: g._sum.leads ?? 0,
      },
    ])
  );

  return { clientes, numerosDaConta };
}

/** Quando o banco recusa alguma coisa: a frase dele, não uma tela preta. */
function TelaDeFalha({ detalhe }: { detalhe: string | null }) {
  return (
    <div className="max-w-2xl rounded-2xl border border-red-500/50 bg-red-500/5 p-6 flex flex-col gap-3">
      <h1 className="font-semibold flex items-center gap-2">
        <AlertTriangle size={18} className="text-red-500" /> O Meta Ads não conseguiu carregar
      </h1>
      <p className="text-sm text-foreground-muted">
        O resto do sistema continua funcionando — é só esta tela. Nada foi perdido.
      </p>
      {detalhe && (
        <div className="border-t border-border pt-3">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-1">
            O que o servidor respondeu
          </p>
          <p className="text-xs font-mono text-red-500 break-words">{detalhe}</p>
        </div>
      )}
    </div>
  );
}

function Resumo({
  titulo,
  valor,
  fraco,
}: {
  titulo: string;
  valor: string;
  fraco?: boolean;
}) {
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
