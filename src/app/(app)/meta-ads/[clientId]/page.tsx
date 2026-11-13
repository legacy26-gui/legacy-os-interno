import Link from "next/link";
import { ArrowLeft, Megaphone, AlertTriangle, Wallet, ChevronRight } from "lucide-react";
import { Voltar } from "@/components/voltar";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { exigirClienteDaCarteira } from "@/lib/carteira";
import { saldoEmReais, tempoDesde } from "@/lib/meta/saldo";
import { avaliarLoja, comoDias } from "@/lib/meta/estado-da-loja";
import { COR_DO_NUMERO, ETIQUETA_DA_LOJA } from "@/lib/meta/tons";
import {
  somar,
  custoPorLead,
  ctr,
  reais,
  numero,
  lerIntervalo,
  textoDaData,
  rotuloDoTipoDeLead,
} from "@/lib/meta/insights";
import { AbasDaSecao } from "@/components/abas-da-secao";
import { SeletorDePeriodo } from "@/components/seletor-de-periodo";
import { AcoesDaLoja } from "./acoes";
import { Criativo } from "./criativo";
import { ChaveDeStatus } from "./chave";
import {
  linhasDaLoja,
  cadastroDaLoja,
  ritmoDaLoja,
  montarNivel,
  nomeNoCadastro,
  estaLigado,
  type Nivel,
  type LinhaDaTela,
} from "./dados";

// Uma loja, do jeito que se olha no Gerenciador.
//
// ── Abas E descida, as duas coisas ────────────────────────────────────────
//
// As ABAS trocam o nível: campanhas, conjuntos, anúncios — da conta inteira.
// CLICAR numa linha desce pra dentro dela: os conjuntos daquela campanha, os
// anúncios daquele conjunto. É assim no Gerenciador e é assim aqui, porque
// são duas perguntas diferentes: "quais conjuntos existem?" e "o que tem
// dentro desta campanha?".
//
// ── Quem aparece ─────────────────────────────────────────────────────────
//
// O cadastro manda, não os números. Campanha pausada que não gastou nada no
// período continua na lista, zerada, com a chave mostrando que está
// desligada. Antes ela sumia — e sumir é a pior forma de mostrar que algo
// está parado, porque ninguém procura o que não vê.

export const maxDuration = 60;

/** Enquanto não há acesso de escrita, a chave mostra mas não mexe. */
const POR_QUE_NAO_LIGA =
  "Ligar e desligar pela tela ainda não está liberado — falta o acesso de escrita na Meta. Por enquanto a chave só mostra como está.";

type Busca = {
  periodo?: string;
  de?: string;
  ate?: string;
  conta?: string;
  nivel?: string;
  campanha?: string;
  conjunto?: string;
};

const ABAS: { valor: Nivel; rotulo: string }[] = [
  { valor: "campanha", rotulo: "Campanhas" },
  { valor: "conjunto", rotulo: "Conjuntos de anúncios" },
  { valor: "anuncio", rotulo: "Anúncios" },
];

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
    gastoMensalPrevistoCents: true,
    manager: { select: { name: true } },
  });

  const periodo = lerIntervalo(busca);
  const nivel: Nivel = (ABAS.find((a) => a.valor === busca.nivel)?.valor ?? "campanha") as Nivel;

  let contas: Awaited<ReturnType<typeof carregarContas>>;
  let numeros: Awaited<ReturnType<typeof linhasDaLoja>>;
  let cadastro: Awaited<ReturnType<typeof cadastroDaLoja>>;
  let ritmo: Awaited<ReturnType<typeof ritmoDaLoja>>;
  try {
    contas = await carregarContas(clientId);
    // A conta escolhida no seletor. Vinda da URL, então é conferida contra as
    // contas DESTA loja: senão bastava trocar o número no endereço pra ver o
    // gasto de outra.
    const escolhida = contas.find((c) => c.metaAccountId === busca.conta);
    const doFiltro = escolhida ? [escolhida.id] : contas.map((c) => c.id);
    [numeros, cadastro, ritmo] = await Promise.all([
      linhasDaLoja(doFiltro, periodo),
      cadastroDaLoja(doFiltro),
      // O ritmo é da loja inteira, não do recorte: o saldo é da conta e não
      // da campanha, então quem o consome é tudo que está rodando ali.
      ritmoDaLoja(contas.map((c) => c.id)),
    ]);
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return <Falha nome={cliente.companyName} detalhe={podeVerDetalhe(user.role) ? detalhe : null} />;
  }

  const campanhaAberta = busca.campanha ?? null;
  const conjuntoAberto = busca.conjunto ?? null;

  const itens = montarNivel(nivel, cadastro, numeros, {
    campanha: campanhaAberta,
    conjunto: conjuntoAberto,
  });

  // O total é dos NÚMEROS do recorte aberto, não da soma das linhas: linha
  // zerada não muda total, mas somar as linhas depois de filtrar daria o
  // mesmo resultado por caminho mais longo.
  const doRecorte = conjuntoAberto
    ? numeros.filter((l) => l.adsetId === conjuntoAberto)
    : campanhaAberta
      ? numeros.filter((l) => (l.campaignId ?? "sem-campanha") === campanhaAberta)
      : numeros;
  const total = somar(doRecorte);
  const cplTotal = custoPorLead(total);
  const ctrTotal = ctr(total);

  // "É conta de Pix" e "o saldo foi lido" são duas coisas, e misturá-las
  // fazia a tela dizer "cartão" pra conta de Pix que ainda não tinha leitura —
  // ou seja, escondia justamente a conta que ninguém está vigiando.
  const prePagas = contas.filter((c) => c.isPrepay);
  const lidas = prePagas.filter((c) => c.balanceSnapshots[0]);
  // Só soma quando TODAS as pré-pagas foram lidas: saldo pela metade parece
  // número e não é.
  const saldo =
    prePagas.length > 0 && lidas.length === prePagas.length
      ? lidas.reduce((s, c) => s + c.balanceSnapshots[0].availableCents, 0)
      : null;
  const leituraMaisVelha = lidas.length
    ? new Date(Math.min(...lidas.map((c) => c.balanceSnapshots[0].capturedAt.getTime())))
    : null;

  const jaBuscou = contas.some((c) => c.lastSyncedAt && !c.lastSyncError);

  // A mesma régua da lista: dias de saldo, não valor fixo.
  const veredito = avaliarLoja({
    temConta: contas.length > 0,
    saldoCents: saldo,
    temPrePaga: prePagas.length > 0,
    comErro: contas.some((c) => c.lastSyncError),
    gastoRecenteCents: ritmo.gastoRecenteCents,
    diasComDado: ritmo.diasComDado,
    gastoMensalPrevistoCents: cliente.gastoMensalPrevistoCents,
    gastoDoPeriodoCents: total.spendCents,
    leads: total.leads,
  });
  const diasDeSaldo = comoDias(veredito.diasDeSaldo);
  const etiquetaDoSaldo = ETIQUETA_DA_LOJA[veredito.tom];
  const podeConfigurar = user.role === "ADMIN" || user.role === "GERENTE";
  const tiposUsados = [...new Set(contas.map((c) => c.leadActionType))];
  const tipoDeLead = rotuloDoTipoDeLead(tiposUsados[0] ?? "");

  /** Endereço desta tela mudando só o que o clique muda. */
  const href = (mudar: Partial<Busca>) => {
    const q = new URLSearchParams();
    const final = { ...busca, ...mudar };
    if (final.periodo) q.set("periodo", final.periodo);
    if (final.de) q.set("de", final.de);
    if (final.ate) q.set("ate", final.ate);
    if (final.conta) q.set("conta", final.conta);
    if (final.nivel && final.nivel !== "campanha") q.set("nivel", final.nivel);
    if (final.campanha) q.set("campanha", final.campanha);
    if (final.conjunto) q.set("conjunto", final.conjunto);
    const s = q.toString();
    return `/meta-ads/${cliente.id}${s ? `?${s}` : ""}`;
  };

  const manter: Record<string, string> = {
    ...(busca.conta ? { conta: busca.conta } : {}),
    ...(nivel !== "campanha" ? { nivel } : {}),
    ...(campanhaAberta ? { campanha: campanhaAberta } : {}),
    ...(conjuntoAberto ? { conjunto: conjuntoAberto } : {}),
  };

  return (
    <div className="flex flex-col gap-5 max-w-6xl">
      <div>
        <Voltar href="/meta-ads">Todas as lojas</Voltar>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Megaphone size={20} className="text-accent" /> {cliente.companyName}
            </h1>
            <p className="text-sm text-foreground-muted mt-0.5">
              {cliente.manager?.name ? `Gestor: ${cliente.manager.name.split(" ")[0]}` : "Sem gestor"}
            </p>
          </div>
          <AcoesDaLoja
            clientId={cliente.id}
            contas={contas.map((c) => ({
              id: c.id,
              metaAccountId: c.metaAccountId,
              leadActionType: c.leadActionType,
              isPrepay: c.isPrepay,
            }))}
            podeConfigurar={podeConfigurar}
          />
        </div>
      </div>

      {contas.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase text-foreground-muted tracking-wide font-medium">
            Conta
          </span>
          <AbasDaSecao
            abas={[
              {
                href: href({ conta: undefined, campanha: undefined, conjunto: undefined }),
                label: "Todas",
              },
              ...contas.map((c) => ({
                href: href({
                  conta: c.metaAccountId,
                  campanha: undefined,
                  conjunto: undefined,
                }),
                label: c.name ?? c.metaAccountId,
              })),
            ]}
          />
        </div>
      )}

      {/* As três abas do Gerenciador. Trocar de aba NÃO apaga o recorte: quem
          abriu uma campanha e clicou em "Anúncios" quer os anúncios daquela
          campanha, não os da conta toda. */}
      <AbasDaSecao
        abas={ABAS.map((a) => ({ href: href({ nivel: a.valor }), label: a.rotulo }))}
      />

      <SeletorDePeriodo
        caminho={`/meta-ads/${cliente.id}`}
        manter={manter}
        atalhoAtivo={periodo.chave}
        deAtual={periodo.de && !periodo.chave ? textoDaData(periodo.de) : ""}
        ateAtual={periodo.ate && !periodo.chave ? textoDaData(periodo.ate) : ""}
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

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div
          className={`rounded-xl border px-4 py-3 ${
            veredito.tom === "sem-saldo"
              ? "border-red-500 bg-red-500/10"
              : veredito.tom === "acabando"
                ? "border-red-400 dark:border-red-500/70 bg-red-500/5"
                : "border-border bg-surface"
          }`}
        >
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
              <p className={`text-xl font-semibold mt-1 ${COR_DO_NUMERO[veredito.tom]}`}>
                {saldoEmReais(saldo)}
              </p>
              {/* Quantos dias ainda roda: é o que transforma o saldo em
                  decisão. "R$ 180" não diz se é pra mandar Pix hoje. */}
              {diasDeSaldo && (
                <p
                  className={`text-xs ${
                    etiquetaDoSaldo && veredito.tom !== "atencao"
                      ? "font-semibold text-red-600 dark:text-red-400"
                      : "text-foreground-muted"
                  }`}
                >
                  dá pra {diasDeSaldo}
                </p>
              )}
              {leituraMaisVelha && (
                <p className="text-xs text-foreground-muted">
                  lido {tempoDesde(leituraMaisVelha)}
                </p>
              )}
            </>
          )}
        </div>
        <Resumo titulo="Investido" valor={jaBuscou ? reais(total.spendCents) : "—"} fraco={!jaBuscou} />
        <Resumo titulo="Resultados" valor={jaBuscou ? numero(total.leads) : "—"} sob={tipoDeLead} fraco={!jaBuscou} />
        <Resumo
          titulo="Custo por resultado"
          valor={jaBuscou && cplTotal !== null ? reais(cplTotal) : "—"}
          fraco={!jaBuscou || cplTotal === null}
        />
        <Resumo
          titulo="Impressões"
          valor={jaBuscou ? numero(total.impressions) : "—"}
          fraco={!jaBuscou}
        />
        <Resumo
          titulo="Alcance"
          valor={jaBuscou ? numero(total.reach) : "—"}
          sob="pessoas"
          fraco={!jaBuscou}
        />
      </div>

      {total.spendCents > 0 && total.leads === 0 && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Gastou {reais(total.spendCents)}{" "}
            {periodo.vidaInteira ? "na vida inteira" : `no período de ${periodo.rotulo}`} e não
            registrou nenhum resultado. Hoje esta loja conta como lead:{" "}
            <strong>{tiposUsados.map(rotuloDoTipoDeLead).join(", ")}</strong>. Se as campanhas dela
            são de outro tipo, o número fica em zero mesmo havendo resultado — dá pra trocar aqui em
            cima.
          </p>
        </div>
      )}

      {(campanhaAberta || conjuntoAberto) && (
        <nav className="flex flex-wrap items-center gap-1.5 text-sm">
          <Link
            href={href({ campanha: undefined, conjunto: undefined, nivel: "campanha" })}
            className="text-foreground-muted hover:text-accent"
          >
            Todas as campanhas
          </Link>
          {campanhaAberta && (
            <>
              <ChevronRight size={13} className="text-foreground-muted" />
              <Link
                href={href({ conjunto: undefined, nivel: "conjunto" })}
                className={
                  conjuntoAberto ? "text-foreground-muted hover:text-accent" : "font-medium"
                }
              >
                {nomeNoCadastro(cadastro, "campanha", campanhaAberta) ?? "Campanha"}
              </Link>
            </>
          )}
          {conjuntoAberto && (
            <>
              <ChevronRight size={13} className="text-foreground-muted" />
              <span className="font-medium">
                {nomeNoCadastro(cadastro, "conjunto", conjuntoAberto) ?? "Conjunto"}
              </span>
            </>
          )}
        </nav>
      )}

      {contas.length === 0 ? (
        <Vazio>
          Esta loja ainda não tem conta de anúncio vinculada.{" "}
          <Link href="/meta-ads/vincular" className="text-accent hover:underline">
            Vincular agora
          </Link>
          .
        </Vazio>
      ) : itens.length === 0 ? (
        <Vazio>
          Nada em {periodo.rotulo.toLowerCase()}. Aperte “Atualizar agora” pra buscar na Meta — ou a
          conta não tem {nivel === "campanha" ? "campanha" : nivel === "conjunto" ? "conjunto" : "anúncio"}{" "}
          nenhum{nivel === "campanha" ? "a" : ""} aqui.
        </Vazio>
      ) : (
        <Tabela
          itens={itens}
          nivel={nivel}
          tipoDeLead={tipoDeLead}
          periodo={periodo.rotulo}
          href={href}
        />
      )}

      <p className="text-xs text-foreground-muted">
        {periodo.vidaInteira ? (
          <>
            Vida inteira é o acumulado que a Meta devolve para o que ainda existe na conta —
            campanha apagada lá some daqui também.
          </>
        ) : (
          <>
            Números de {periodo.rotulo.toLowerCase()}, dia a dia, como a Meta fecha. O sistema busca
            os últimos 30 dias a cada passada e guarda o que já buscou, então o histórico cresce
            sozinho.
          </>
        )}{" "}
        Alcance é a soma do alcance de cada linha — a mesma pessoa em dois conjuntos conta duas
        vezes, então ele é aproximado. O investido é o gasto na Meta, não a mensalidade da loja.
      </p>
    </div>
  );
}

function Tabela({
  itens,
  nivel,
  tipoDeLead,
  periodo,
  href,
}: {
  itens: LinhaDaTela[];
  nivel: Nivel;
  tipoDeLead: string;
  periodo: string;
  href: (m: Partial<Busca>) => string;
}) {
  const rotulo = nivel === "campanha" ? "Campanha" : nivel === "conjunto" ? "Conjunto" : "Anúncio";
  const temFilho = nivel !== "anuncio";

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
        <p className="text-sm font-medium">
          {itens.length} {rotulo.toLowerCase()}
          {itens.length === 1 ? "" : "s"}
        </p>
        <p className="text-xs text-foreground-muted">{periodo}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 font-medium w-12">
                <span className="sr-only">Ativo</span>
              </th>
              <th className="px-3 py-2.5 font-medium">{rotulo}</th>
              <th className="px-4 py-2.5 font-medium text-right hidden lg:table-cell">Orçamento</th>
              <th className="px-4 py-2.5 font-medium text-right">Investido</th>
              <th className="px-4 py-2.5 font-medium text-right">Resultados</th>
              <th className="px-4 py-2.5 font-medium text-right">Custo/result.</th>
              <th className="px-4 py-2.5 font-medium text-right hidden md:table-cell">
                Impressões
              </th>
              <th className="px-4 py-2.5 font-medium text-right hidden xl:table-cell">Alcance</th>
              {temFilho && <th className="px-3 py-2.5 w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {itens.map((i) => {
              const destino =
                nivel === "campanha"
                  ? href({ campanha: i.id, conjunto: undefined, nivel: "conjunto" })
                  : nivel === "conjunto"
                    ? href({ conjunto: i.id, nivel: "anuncio" })
                    : null;
              const ligado = estaLigado(i);
              return (
                <tr key={i.id} className="hover:bg-surface-muted transition-colors">
                  <td className="px-3 py-3 align-top">
                    <ChaveDeStatus ligado={ligado} nome={i.nome} motivoDaTrava={POR_QUE_NAO_LIGA} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-start gap-3">
                      {nivel === "anuncio" && (
                        <Criativo url={i.miniatura ?? null} preview={i.preview ?? null} nome={i.nome} />
                      )}
                      <div className="min-w-0">
                        {destino ? (
                          <Link href={destino} className="font-medium hover:text-accent">
                            {i.nome}
                          </Link>
                        ) : (
                          <span className="font-medium">{i.nome}</span>
                        )}
                        {/* O separador só existe quando há os dois lados —
                            senão sobra um "·" solto no fim da linha. */}
                        <span className="block text-xs text-foreground-muted mt-0.5">
                          {!ligado && (
                            <span className="text-amber-600 dark:text-amber-400">Pausado</span>
                          )}
                          {!ligado && temFilho && " · "}
                          {temFilho &&
                            `${i.dentro} ${nivel === "campanha" ? "conjunto" : "anúncio"}${i.dentro === 1 ? "" : "s"}`}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right align-top hidden lg:table-cell">
                    {i.orcamentoCents === null ? (
                      <span className="text-foreground-muted">—</span>
                    ) : (
                      <>
                        <span className="tabular-nums">{reais(i.orcamentoCents)}</span>
                        <span className="block text-xs text-foreground-muted">
                          {i.orcamentoDiario ? "Diário" : "Total"}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    {i.spendCents > 0 ? reais(i.spendCents) : <span className="text-foreground-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    {i.leads > 0 ? (
                      <>
                        <span className="font-semibold">{numero(i.leads)}</span>
                        <span className="block text-xs text-foreground-muted font-normal truncate max-w-[9rem] ml-auto">
                          {tipoDeLead}
                        </span>
                      </>
                    ) : (
                      <span className="text-foreground-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    {/* Sem resultado não existe custo por resultado: "—" e não
                        R$ 0,00, que pareceria o melhor da lista. */}
                    {i.cpl === null ? <span className="text-foreground-muted">—</span> : reais(i.cpl)}
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums text-foreground-muted hidden md:table-cell">
                    {numero(i.impressions)}
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums text-foreground-muted hidden xl:table-cell">
                    {numero(i.reach)}
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
  );
}

function podeVerDetalhe(role: string) {
  return role === "ADMIN" || role === "GERENTE";
}

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

function Resumo({
  titulo,
  valor,
  sob,
  fraco,
}: {
  titulo: string;
  valor: string;
  sob?: string;
  fraco?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">{titulo}</p>
      <p className={`text-xl font-semibold mt-1 tabular-nums ${fraco ? "text-foreground-muted" : ""}`}>
        {valor}
      </p>
      {sob && !fraco && (
        <p className="text-xs text-foreground-muted truncate" title={sob}>
          {sob}
        </p>
      )}
    </div>
  );
}
