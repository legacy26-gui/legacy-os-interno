import Link from "next/link";
import { ArrowLeft, Megaphone, AlertTriangle, Wallet, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { exigirClienteDaCarteira } from "@/lib/carteira";
import { saldoEmReais, estadoDoSaldo, COR_DO_SALDO, tempoDesde } from "@/lib/meta/saldo";
import {
  somar,
  custoPorLead,
  ctr,
  reais,
  numero,
  janelaDoTexto,
  rotuloDaJanela,
  rotuloDoTipoDeLead,
  PERIODOS,
  DIAS_PADRAO,
} from "@/lib/meta/insights";
import { AbasDaSecao } from "@/components/abas-da-secao";
import { AcoesDaLoja } from "./acoes";
import { linhasDaLoja, porCampanha, porConjunto, porAnuncio, nomeDe, type Nivel } from "./dados";

// Uma loja, do jeito que se olha no Gerenciador: campanha → conjunto →
// anúncio, descendo um nível a cada clique.
//
// Por que descer em vez de mostrar tudo aberto: uma loja tem 4 campanhas, 20
// conjuntos e 60 anúncios. Tudo aberto são 84 linhas, e aí não se lê nenhuma.
// Fechado, são 4 linhas e a pergunta certa — "qual campanha está cara?" —
// antes de descer pra "qual conjunto dentro dela".
//
// O número que manda é o custo por lead, não o gasto. Gasto grande em
// campanha com lead barato é dinheiro bem posto; gasto pequeno em campanha
// que não entrega nada é dinheiro queimado devagar, que é pior porque ninguém
// percebe.

export const maxDuration = 60;

type Busca = { dias?: string; conta?: string; campanha?: string; conjunto?: string };

export default async function LojaNoMetaAdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Busca>;
}) {
  const user = await requireModuleAccess("clientes");
  const { clientId } = await params;
  const busca = await searchParams;

  // A trava que importa: o id vem da URL, e loja de outro gestor dá 404 — não
  // "acesso negado", que confirmaria que ela existe.
  const cliente = await exigirClienteDaCarteira(user, clientId, {
    id: true,
    companyName: true,
    manager: { select: { name: true } },
  });

  const janela = janelaDoTexto(busca.dias);

  let contas: Awaited<ReturnType<typeof carregarContas>>;
  let linhas: Awaited<ReturnType<typeof linhasDaLoja>>;
  try {
    contas = await carregarContas(clientId);
    // A conta escolhida no seletor. Vinda da URL, então é conferida contra as
    // contas DESTA loja: senão bastava trocar o número no endereço pra ver o
    // gasto de outra.
    const escolhida = contas.find((c) => c.metaAccountId === busca.conta);
    const doFiltro = escolhida ? [escolhida.id] : contas.map((c) => c.id);
    linhas = await linhasDaLoja(doFiltro, janela);
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return <Falha nome={cliente.companyName} detalhe={podeVerDetalhe(user.role) ? detalhe : null} />;
  }

  const contaEscolhida = contas.find((c) => c.metaAccountId === busca.conta);

  // Onde a pessoa está: na lista de campanhas, dentro de uma campanha, ou
  // dentro de um conjunto.
  const campanhaAberta = busca.campanha ?? null;
  const conjuntoAberto = busca.conjunto ?? null;

  const doNivel = conjuntoAberto
    ? linhas.filter((l) => l.adsetId === conjuntoAberto)
    : campanhaAberta
      ? linhas.filter((l) => (l.campaignId ?? "sem-campanha") === campanhaAberta)
      : linhas;

  const itens: Nivel[] = conjuntoAberto
    ? porAnuncio(doNivel)
    : campanhaAberta
      ? porConjunto(doNivel)
      : porCampanha(doNivel);

  const rotuloDoNivel = conjuntoAberto ? "Anúncio" : campanhaAberta ? "Conjunto" : "Campanha";
  const temFilho = !conjuntoAberto;

  const total = somar(doNivel);
  const cplTotal = custoPorLead(total);
  const ctrTotal = ctr(total);

  const prePagas = contas.filter((c) => c.isPrepay && c.balanceSnapshots[0]);
  const saldo = prePagas.length
    ? prePagas.reduce((s, c) => s + c.balanceSnapshots[0].availableCents, 0)
    : null;
  const leituraMaisVelha = prePagas.length
    ? new Date(Math.min(...prePagas.map((c) => c.balanceSnapshots[0].capturedAt.getTime())))
    : null;

  // Buscado quer dizer buscado COM SUCESSO: tentativa que deu erro não ensina
  // nada sobre o gasto, e R$ 0,00 em cima dela seria mentira.
  const jaBuscou = contas.some((c) => c.lastSyncedAt && !c.lastSyncError);
  const podeConfigurar = user.role === "ADMIN" || user.role === "GERENTE";
  const tiposUsados = [...new Set(contas.map((c) => c.leadActionType))];

  /** Monta um endereço desta tela mudando só o que o clique muda. */
  const href = (mudar: Partial<Busca>) => {
    const q = new URLSearchParams();
    const final = { ...busca, ...mudar };
    if (final.dias && final.dias !== String(DIAS_PADRAO)) q.set("dias", final.dias);
    if (final.conta) q.set("conta", final.conta);
    if (final.campanha) q.set("campanha", final.campanha);
    if (final.conjunto) q.set("conjunto", final.conjunto);
    const s = q.toString();
    return `/meta-ads/${cliente.id}${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-5 max-w-6xl">
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
              {cliente.manager?.name
                ? `Gestor: ${cliente.manager.name.split(" ")[0]}`
                : "Sem gestor"}
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

      {/* O seletor de conta. Só aparece com mais de uma: com uma só, uma aba
          sozinha não é escolha, é enfeite. */}
      {contas.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase text-foreground-muted tracking-wide font-medium">
            Conta
          </span>
          <AbasDaSecao
            abas={[
              { href: href({ conta: undefined, campanha: undefined, conjunto: undefined }), label: "Todas" },
              ...contas.map((c) => ({
                href: href({ conta: c.metaAccountId, campanha: undefined, conjunto: undefined }),
                label: c.name ?? c.metaAccountId,
              })),
            ]}
          />
        </div>
      )}

      <AbasDaSecao
        abas={[
          ...PERIODOS.map((p) => ({ href: href({ dias: String(p) }), label: `${p} dias` })),
          { href: href({ dias: "tudo" }), label: "Vida inteira" },
        ]}
      />

      {contas.some((c) => c.lastSyncError) && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 flex flex-col gap-1">
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
        <Resumo titulo="Investido" valor={jaBuscou ? reais(total.spendCents) : "—"} fraco={!jaBuscou} />
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
            Gastou {reais(total.spendCents)} {janela === "tudo" ? "na vida inteira" : `nestes ${janela} dias`}{" "}
            e não registrou nenhum lead. Hoje esta loja conta como lead:{" "}
            <strong>{tiposUsados.map(rotuloDoTipoDeLead).join(", ")}</strong>. Se as campanhas dela
            são de outro tipo, o número fica em zero mesmo havendo resultado — dá pra trocar aqui
            em cima.
          </p>
        </div>
      )}

      {/* O caminho de volta. Só aparece quando há onde voltar. */}
      {(campanhaAberta || conjuntoAberto) && (
        <nav className="flex flex-wrap items-center gap-1.5 text-sm">
          <Link
            href={href({ campanha: undefined, conjunto: undefined })}
            className="text-foreground-muted hover:text-accent"
          >
            Campanhas
          </Link>
          {campanhaAberta && (
            <>
              <ChevronRight size={13} className="text-foreground-muted" />
              {conjuntoAberto ? (
                <Link
                  href={href({ conjunto: undefined })}
                  className="text-foreground-muted hover:text-accent"
                >
                  {nomeDe(linhas, "campaignId", campanhaAberta) ?? "Campanha"}
                </Link>
              ) : (
                <span className="font-medium">
                  {nomeDe(linhas, "campaignId", campanhaAberta) ?? "Campanha"}
                </span>
              )}
            </>
          )}
          {conjuntoAberto && (
            <>
              <ChevronRight size={13} className="text-foreground-muted" />
              <span className="font-medium">
                {nomeDe(linhas, "adsetId", conjuntoAberto) ?? "Conjunto"}
              </span>
            </>
          )}
        </nav>
      )}

      {contas.length === 0 ? (
        <Vazio>
          Esta loja ainda não tem conta de anúncio vinculada.{" "}
          <Link href={`/clientes/${cliente.id}`} className="text-accent hover:underline">
            Vincular na ficha dela
          </Link>
          .
        </Vazio>
      ) : itens.length === 0 ? (
        <Vazio>
          Nenhum número {janela === "tudo" ? "guardado" : `nestes ${janela} dias`}. Aperte
          “Atualizar agora” pra buscar na Meta — ou a conta não rodou nada no período.
        </Vazio>
      ) : (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {itens.length} {rotuloDoNivel.toLowerCase()}
              {itens.length === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-foreground-muted">{rotuloDaJanela(janela)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
                  <th className="px-5 py-2.5 font-medium">{rotuloDoNivel}</th>
                  <th className="px-5 py-2.5 font-medium text-right">Investido</th>
                  <th className="px-5 py-2.5 font-medium text-right">Leads</th>
                  <th className="px-5 py-2.5 font-medium text-right">Custo/lead</th>
                  <th className="px-5 py-2.5 font-medium text-right hidden md:table-cell">
                    Cliques
                  </th>
                  <th className="px-5 py-2.5 font-medium text-right hidden lg:table-cell">CTR</th>
                  {temFilho && <th className="px-3 py-2.5 w-8" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {itens.map((i) => {
                  const destino = conjuntoAberto
                    ? null
                    : campanhaAberta
                      ? href({ conjunto: i.id })
                      : href({ campanha: i.id });
                  return (
                    <tr key={i.id} className="hover:bg-surface-muted transition-colors">
                      <td className="px-5 py-3">
                        {destino ? (
                          <Link href={destino} className="font-medium hover:text-accent">
                            {i.nome}
                          </Link>
                        ) : (
                          <span className="font-medium">{i.nome}</span>
                        )}
                        {temFilho && (
                          <span className="block text-xs text-foreground-muted mt-0.5">
                            {i.dentro} {campanhaAberta ? "anúncio" : "conjunto"}
                            {i.dentro === 1 ? "" : "s"}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums align-top">
                        {reais(i.spendCents)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums align-top">
                        {i.leads > 0 ? (
                          <span className="font-semibold">{numero(i.leads)}</span>
                        ) : (
                          <span className="text-foreground-muted">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums align-top">
                        {/* Sem lead não existe custo por lead: "—" e não
                            R$ 0,00. Gastar sem lead é problema, e zero ali
                            pareceria o melhor resultado da lista. */}
                        {i.cpl === null ? (
                          <span className="text-foreground-muted">—</span>
                        ) : (
                          reais(i.cpl)
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-foreground-muted hidden md:table-cell align-top">
                        {numero(i.linkClicks)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-foreground-muted hidden lg:table-cell align-top">
                        {i.ctrLink === null ? "—" : `${i.ctrLink.toFixed(2)}%`}
                      </td>
                      {temFilho && (
                        <td className="px-3 py-3 align-top text-right">
                          {destino && (
                            <Link href={destino} className="text-foreground-muted hover:text-accent">
                              <ChevronRight size={16} />
                            </Link>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-foreground-muted">
        {janela === "tudo" ? (
          <>
            Vida inteira é o acumulado que a Meta devolve para o que ainda existe na conta —
            campanha apagada lá some daqui também, e isso é limite dela, não do sistema.
          </>
        ) : (
          <>
            Números dos últimos {janela} dias, dia a dia, como a Meta fecha. O sistema guarda 30
            dias de detalhe; para períodos entre 30 dias e a vida inteira, o Gerenciador.
          </>
        )}{" "}
        O investido aqui é o gasto na Meta, não a mensalidade da loja.
      </p>
    </div>
  );
}

function podeVerDetalhe(role: string) {
  return role === "ADMIN" || role === "GERENTE";
}

/** As contas de anúncio da loja, com a última leitura de saldo. */
async function carregarContas(clientId: string) {
  return prisma.metaAdAccount.findMany({
    where: { clientId, active: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
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

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-foreground-muted rounded-xl border border-border bg-surface p-8 text-center">
      {children}
    </p>
  );
}

function Falha({ nome, detalhe }: { nome: string; detalhe: string | null }) {
  return (
    <div className="max-w-2xl rounded-2xl border border-red-500/50 bg-red-500/5 p-6 flex flex-col gap-3">
      <h1 className="font-semibold flex items-center gap-2">
        <AlertTriangle size={18} className="text-red-500" /> Não deu pra carregar {nome}
      </h1>
      <p className="text-sm text-foreground-muted">
        O resto do sistema continua funcionando — é só esta tela.
      </p>
      {detalhe && (
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
