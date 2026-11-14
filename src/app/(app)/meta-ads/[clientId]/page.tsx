import Link from "next/link";
import { Megaphone, AlertTriangle, Wallet, ChevronRight } from "lucide-react";
import { Voltar } from "@/components/voltar";
import { Frescor } from "@/components/frescor";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { exigirClienteDaCarteira } from "@/lib/carteira";
import { saldoEmReais, tempoDesde } from "@/lib/meta/saldo";
import { avaliarLoja, comoDias } from "@/lib/meta/estado-da-loja";
import { COR_DO_NUMERO, ETIQUETA_DA_LOJA } from "@/lib/meta/tons";
import {
  ETIQUETA_DO_CRIATIVO,
  comoVariacao,
} from "@/lib/meta/criativo-cansado";
import { escritaLiberada } from "@/lib/meta/escrever-na-graph";
import {
  somar,
  custoPorLead,
  reais,
  numero,
  lerIntervalo,
  textoDaData,
  rotuloDoTipoDeLead,
  tipoQueTalvezSejaOCerto,
  cpm,
  cpc,
  ctr,
  frequencia,
} from "@/lib/meta/insights";
import { AbasDaSecao } from "@/components/abas-da-secao";
import { SeletorDePeriodo } from "@/components/seletor-de-periodo";
import { AcoesDaLoja, TrocarPraPix } from "./acoes";
import { Criativo } from "./criativo";
import { ChaveDeStatus } from "./chave";
import { Verba } from "./verba";
import { Legenda } from "./legenda";
import { TipoErrado } from "./tipo-errado";
import {
  LoteProvider,
  CaixaDeSelecao,
  CaixaDeTodos,
  BarraDeAcoes,
} from "./lote";
import { veiculacaoDe, type Gravidade } from "@/lib/meta/veiculacao";
import {
  linhasDaLoja,
  cadastroDaLoja,
  ritmoDaLoja,
  cansacoDosAnuncios,
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
  const nivel: Nivel = (ABAS.find((a) => a.valor === busca.nivel)?.valor ??
    "campanha") as Nivel;

  let contas: Awaited<ReturnType<typeof carregarContas>>;
  let numeros: Awaited<ReturnType<typeof linhasDaLoja>>;
  let cadastro: Awaited<ReturnType<typeof cadastroDaLoja>>;
  let ritmo: Awaited<ReturnType<typeof ritmoDaLoja>>;
  let cansaco: Awaited<ReturnType<typeof cansacoDosAnuncios>>;
  try {
    contas = await carregarContas(clientId);
    // A conta escolhida no seletor. Vinda da URL, então é conferida contra as
    // contas DESTA loja: senão bastava trocar o número no endereço pra ver o
    // gasto de outra.
    const escolhida = contas.find((c) => c.metaAccountId === busca.conta);
    const doFiltro = escolhida ? [escolhida.id] : contas.map((c) => c.id);
    [numeros, cadastro, ritmo, cansaco] = await Promise.all([
      linhasDaLoja(doFiltro, periodo),
      cadastroDaLoja(doFiltro),
      // O ritmo é da loja inteira, não do recorte: o saldo é da conta e não
      // da campanha, então quem o consome é tudo que está rodando ali.
      ritmoDaLoja(contas.map((c) => c.id)),
      // O cansaço é sempre 7 dias contra 7, independente do período da tela:
      // "essa arte está cansando?" é a mesma pergunta em qualquer recorte.
      cansacoDosAnuncios(doFiltro),
    ]);
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return (
      <Falha
        nome={cliente.companyName}
        detalhe={podeVerDetalhe(user.role) ? detalhe : null}
      />
    );
  }

  const campanhaAberta = busca.campanha ?? null;
  const conjuntoAberto = busca.conjunto ?? null;

  const itens = montarNivel(
    nivel,
    cadastro,
    numeros,
    { campanha: campanhaAberta, conjunto: conjuntoAberto },
    cansaco,
  );

  // O total é dos NÚMEROS do recorte aberto, não da soma das linhas: linha
  // zerada não muda total, mas somar as linhas depois de filtrar daria o
  // mesmo resultado por caminho mais longo.
  const doRecorte = conjuntoAberto
    ? numeros.filter((l) => l.adsetId === conjuntoAberto)
    : campanhaAberta
      ? numeros.filter(
          (l) => (l.campaignId ?? "sem-campanha") === campanhaAberta,
        )
      : numeros;
  const total = somar(doRecorte);
  const cplTotal = custoPorLead(total);

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
    ? new Date(
        Math.min(
          ...lidas.map((c) => c.balanceSnapshots[0].capturedAt.getTime()),
        ),
      )
    : null;

  const jaBuscou = contas.some((c) => c.lastSyncedAt && !c.lastSyncError);

  // Quando o sistema perguntou à Meta pela última vez sobre esta loja.
  //
  // Não confundir com `leituraMaisVelha` logo acima: aquela é a hora do
  // SALDO, que só existe em conta pré-paga. Esta é a hora da conversa com a
  // Meta, e vale pra qualquer conta — inclusive as de cartão, que não têm
  // saldo pra ler mas têm gasto que envelhece igual.
  //
  // Mais velha entre as contas da loja, pela mesma razão da lista: o rótulo
  // promete sobre o conjunto, não sobre a melhor parte dele.
  const sincronias = contas
    .map((c) => c.lastSyncedAt)
    .filter((d): d is Date => d !== null);
  const lidaMaisVelha = sincronias.length
    ? new Date(Math.min(...sincronias.map((d) => d.getTime())))
    : null;

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
  // Mexer em campanha é trabalho do gestor nas lojas DELE — a trava aqui não
  // é de cargo, é de carteira, e ela já foi conferida acima (a loja só chega
  // nesta linha se for da pessoa). O que ainda pode faltar é o acesso de
  // escrita na Meta, que é coisa do sistema, não de quem está na tela.
  const podeMexer = escritaLiberada();
  const tiposUsados = [...new Set(contas.map((c) => c.leadActionType))];

  // ── A conta que está contando a coisa errada ──────────────────────────
  //
  // A varredura guarda o que a Meta devolveu de ação, somado por tipo. Com
  // isso dá pra separar dois zeros que antes eram o mesmo: "a loja não
  // vendeu" e "o tipo configurado não é o que a loja faz".
  //
  // Uma loja que vende pelo site estava configurada como conversa no
  // WhatsApp e passou meses com o resultado zerado — e zero parece
  // "não vendeu", não "está contando outra coisa".
  const sugestoes = contas
    .map((c) => {
      const vistas = (c.acoesVistas ?? null) as Record<string, number> | null;
      if (!vistas) return null;
      // Só sugere quando o tipo configurado não apareceu NENHUMA vez: se
      // apareceu, a conta está contando algo de verdade e a escolha é de
      // quem configurou, não do sistema.
      if ((vistas[c.leadActionType] ?? 0) > 0) return null;
      const melhor = tipoQueTalvezSejaOCerto(vistas, c.leadActionType);
      return melhor ? { conta: c, melhor } : null;
    })
    .filter((x) => x !== null);
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
              <Megaphone size={20} className="text-accent" />{" "}
              {cliente.companyName}
            </h1>
            <p className="text-sm text-foreground-muted mt-0.5">
              {cliente.manager?.name
                ? `Gestor: ${cliente.manager.name.split(" ")[0]}`
                : "Sem gestor"}
            </p>
            {/* Aqui a idade importa ainda mais que na lista: esta é a tela
                que fica aberta enquanto o gestor está no telefone com a loja,
                e é dela que sai a frase "o saldo seu está em tanto". */}
            <div className="mt-1.5">
              <Frescor
                quando={lidaMaisVelha ? lidaMaisVelha.toISOString() : null}
              />
            </div>
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
                href: href({
                  conta: undefined,
                  campanha: undefined,
                  conjunto: undefined,
                }),
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
        grandes
        abas={ABAS.map((a) => ({
          href: href({ nivel: a.valor }),
          label: a.rotulo,
          // Quem sabe o nível aberto é esta página, que leu o parâmetro —
          // o componente sozinho compararia só o caminho, que é igual nas
          // três, e acenderia sempre a primeira.
          ativa: nivel === a.valor,
        }))}
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
                  <span className="font-mono text-xs">{c.metaAccountId}</span>:{" "}
                  {c.lastSyncError}
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
          {contas.length === 0 ? (
            <p className="text-sm text-foreground-muted mt-1.5">sem conta</p>
          ) : prePagas.length === 0 ? (
            // "cartão" com o conserto embaixo: é aqui que alguém percebe que
            // a conta está marcada errado, então é aqui que tem que dar pra
            // corrigir. Quem não configura conta vê só a palavra.
            podeConfigurar ? (
              <TrocarPraPix
                clientId={cliente.id}
                contaIds={contas.map((c) => c.id)}
              />
            ) : (
              <p className="text-sm text-foreground-muted mt-1.5">cartão</p>
            )
          ) : saldo === null ? (
            <p className="text-sm text-foreground-muted mt-1.5">indisponível</p>
          ) : (
            <>
              <p
                className={`text-xl font-semibold mt-1 ${COR_DO_NUMERO[veredito.tom]}`}
              >
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
        <Resumo
          titulo="Investido"
          valor={jaBuscou ? reais(total.spendCents) : "—"}
          fraco={!jaBuscou}
        />
        <Resumo
          titulo="Resultados"
          valor={jaBuscou ? numero(total.leads) : "—"}
          sob={tipoDeLead}
          fraco={!jaBuscou}
        />
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
            {periodo.vidaInteira
              ? "na vida inteira"
              : `no período de ${periodo.rotulo}`}{" "}
            e não registrou nenhum resultado. Hoje esta loja conta como lead:{" "}
            <strong>{tiposUsados.map(rotuloDoTipoDeLead).join(", ")}</strong>.
            Se as campanhas dela são de outro tipo, o número fica em zero mesmo
            havendo resultado — dá pra trocar aqui em cima.
          </p>
        </div>
      )}

      {/* O aviso de tipo errado explica o zero que o aviso de cima levanta.
          Quando as duas coisas acontecem juntas — gastou, não registrou, e a
          Meta devolveu outra ação aos montes — é quase sempre isto. */}
      {sugestoes.map(({ conta, melhor }) => (
        <TipoErrado
          key={conta.id}
          clientId={cliente.id}
          contaId={conta.id}
          nomeDaConta={conta.name ?? conta.metaAccountId}
          configurado={rotuloDoTipoDeLead(conta.leadActionType)}
          sugerido={melhor.valor}
          rotuloSugerido={melhor.rotulo}
          quantas={melhor.quantas}
          periodo={periodo.rotulo}
        />
      ))}

      {(campanhaAberta || conjuntoAberto) && (
        <nav className="flex flex-wrap items-center gap-1.5 text-sm">
          <Link
            href={href({
              campanha: undefined,
              conjunto: undefined,
              nivel: "campanha",
            })}
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
                  conjuntoAberto
                    ? "text-foreground-muted hover:text-accent"
                    : "font-medium"
                }
              >
                {nomeNoCadastro(cadastro, "campanha", campanhaAberta) ??
                  "Campanha"}
              </Link>
            </>
          )}
          {conjuntoAberto && (
            <>
              <ChevronRight size={13} className="text-foreground-muted" />
              <span className="font-medium">
                {nomeNoCadastro(cadastro, "conjunto", conjuntoAberto) ??
                  "Conjunto"}
              </span>
            </>
          )}
        </nav>
      )}

      {contas.length === 0 ? (
        <Vazio>
          Esta loja ainda não tem conta de anúncio vinculada.{" "}
          <Link
            href="/meta-ads/vincular"
            className="text-accent hover:underline"
          >
            Vincular agora
          </Link>
          .
        </Vazio>
      ) : itens.length === 0 ? (
        <Vazio>
          Nada em {periodo.rotulo.toLowerCase()}. Aperte “Atualizar agora” pra
          buscar na Meta — ou a conta não tem{" "}
          {nivel === "campanha"
            ? "campanha"
            : nivel === "conjunto"
              ? "conjunto"
              : "anúncio"}{" "}
          nenhum{nivel === "campanha" ? "a" : ""} aqui.
        </Vazio>
      ) : (
        // O provedor envolve a tabela inteira: as linhas continuam vindo
        // prontas do servidor e só a seleção vive no navegador.
        <LoteProvider todos={itens.map((i) => ({ id: i.id, nome: i.nome }))}>
          <Tabela
            itens={itens}
            nivel={nivel}
            tipoDeLead={tipoDeLead}
            periodo={periodo.rotulo}
            href={href}
            clientId={cliente.id}
            podeMexer={podeMexer}
            acoes={
              podeMexer ? (
                <BarraDeAcoes
                  clientId={cliente.id}
                  nivel={nivel}
                  // Desligar e arquivar o gestor faz; excluir de vez é da
                  // direção, porque não tem desfazer. O servidor confere de
                  // novo — esconder o botão é cortesia, não trava.
                  podeExcluir={user.role === "ADMIN" || user.role === "GERENTE"}
                />
              ) : null
            }
          />
        </LoteProvider>
      )}

      <p className="text-xs text-foreground-muted">
        {periodo.vidaInteira ? (
          <>
            Vida inteira é o acumulado que a Meta devolve para o que ainda
            existe na conta — campanha apagada lá some daqui também.
          </>
        ) : (
          <>
            Números de {periodo.rotulo.toLowerCase()}, dia a dia, como a Meta
            fecha. O sistema busca os últimos 30 dias a cada passada e guarda o
            que já buscou, então o histórico cresce sozinho.
          </>
        )}{" "}
        Alcance é a soma do alcance de cada linha — a mesma pessoa em dois
        conjuntos conta duas vezes, então ele é aproximado. O investido é o
        gasto na Meta, não a mensalidade da loja.
      </p>
    </div>
  );
}

/**
 * A cor de cada estado.
 *
 * Reprovado em vermelho e desligado em âmbar não é enfeite: o primeiro é um
 * problema que custa dinheiro parado, o segundo é alguém tendo feito o que
 * queria. Pintar os dois igual foi o defeito que esta coluna veio consertar.
 */
/** O número, ou um traço quando não existe conta pra fazer. */
function umOuTraco(v: number | null, escrever: (v: number) => string) {
  if (v === null) return <span className="text-foreground-muted">—</span>;
  return escrever(v);
}

/** A bolinha. Cheia pro que entrega, vazada pro que está esperando. */
const BOLINHA_DA_VEICULACAO: Record<Gravidade, string> = {
  rodando: "bg-emerald-500",
  esperando: "border-2 border-sky-500",
  parado: "bg-amber-500",
  problema: "bg-red-500",
};

const COR_DA_VEICULACAO: Record<Gravidade, string> = {
  rodando: "text-emerald-600 dark:text-emerald-400",
  esperando: "text-sky-600 dark:text-sky-400",
  parado: "text-amber-600 dark:text-amber-400",
  problema: "text-red-600 dark:text-red-400 font-medium",
};

function Tabela({
  itens,
  nivel,
  tipoDeLead,
  periodo,
  href,
  clientId,
  podeMexer,
  acoes,
}: {
  itens: LinhaDaTela[];
  nivel: Nivel;
  tipoDeLead: string;
  periodo: string;
  href: (m: Partial<Busca>) => string;
  clientId: string;
  /** Falso enquanto o acesso de escrita na Meta não estiver configurado. */
  podeMexer: boolean;
  /** A barra de ações em lote. Vem pronta de fora porque é de navegador. */
  acoes: React.ReactNode;
}) {
  const rotulo =
    nivel === "campanha"
      ? "Campanha"
      : nivel === "conjunto"
        ? "Conjunto"
        : "Anúncio";
  const temFilho = nivel !== "anuncio";
  // Soma do que está LISTADO, que é o que o rodapé promete. Os cartões de
  // cima somam a conta inteira: quando se desce pra dentro de uma campanha,
  // os dois números divergem de propósito.
  const totais = somar(itens);

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
        <p className="text-sm font-medium">
          {itens.length} {rotulo.toLowerCase()}
          {itens.length === 1 ? "" : "s"}
        </p>
        <p className="text-xs text-foreground-muted">{periodo}</p>
      </div>
      {acoes}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
              <th className="px-2 py-2.5 font-medium w-10">
                <CaixaDeTodos />
              </th>
              <th className="px-3 py-2.5 font-medium w-12">
                <span className="sr-only">Ativo</span>
              </th>
              {/* ── Por que o nome tem largura mínima ──────────────────
                  Sem ela a tabela dava 148px pro nome e 176px pra coluna de
                  resultados, e cada linha virava um prédio de 390px: o nome
                  quebrava em três, a legenda em quatro, e o botão de editar
                  caía sozinho numa linha. É o contrário do Gerenciador, onde
                  o nome manda na largura e os números ocupam o que sobra.

                  Com min-w e os números em nowrap, a tabela rola de lado
                  quando não cabe — que é o que o Gerenciador faz — em vez de
                  espremer a coluna que a pessoa está lendo. */}
              <th className="px-3 py-2.5 font-medium min-w-[20rem]">
                {rotulo}
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                Veiculação
              </th>
              <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap hidden lg:table-cell">
                Orçamento
              </th>
              <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap">
                Investido
              </th>
              <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap">
                Resultados
              </th>
              <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap">
                Custo/result.
              </th>
              <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap hidden md:table-cell">
                Impressões
              </th>
              <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap hidden xl:table-cell">
                Alcance
              </th>
              {/* As colunas do Gerenciador que faltavam. Escondem antes das
                  outras no telefone: num celular o que importa é gasto,
                  resultado e custo — CPM a essa largura só empurra o resto
                  pra fora. */}
              <th
                className="px-4 py-2.5 font-medium text-right whitespace-nowrap hidden 2xl:table-cell"
                title="Custo por mil impressões"
              >
                CPM
              </th>
              <th
                className="px-4 py-2.5 font-medium text-right whitespace-nowrap hidden 2xl:table-cell"
                title="Custo por clique no link"
              >
                CPC
              </th>
              <th
                className="px-4 py-2.5 font-medium text-right whitespace-nowrap hidden 2xl:table-cell"
                title="Cliques no link ÷ impressões"
              >
                CTR
              </th>
              <th
                className="px-4 py-2.5 font-medium text-right whitespace-nowrap hidden 2xl:table-cell"
                title="Quantas vezes, em média, a mesma pessoa viu"
              >
                Freq.
              </th>
              {temFilho && <th className="px-3 py-2.5 w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-border">
            {itens.map((i) => {
              const destino =
                nivel === "campanha"
                  ? href({
                      campanha: i.id,
                      conjunto: undefined,
                      nivel: "conjunto",
                    })
                  : nivel === "conjunto"
                    ? href({ conjunto: i.id, nivel: "anuncio" })
                    : null;
              const ligado = estaLigado(i);
              const veiculacao = veiculacaoDe(i.statusEfetivo, i.status);
              const etiquetaDoCansaco = i.cansaco
                ? ETIQUETA_DO_CRIATIVO[i.cansaco.estado]
                : null;
              return (
                <tr
                  key={i.id}
                  className="hover:bg-surface-muted transition-colors"
                >
                  <td className="px-2 py-4 align-top">
                    <CaixaDeSelecao id={i.id} nome={i.nome} />
                  </td>
                  <td className="px-3 py-4 align-top">
                    <ChaveDeStatus
                      ligado={ligado}
                      nome={i.nome}
                      motivoDaTrava={podeMexer ? null : POR_QUE_NAO_LIGA}
                      clientId={clientId}
                      nivel={nivel}
                      objetoId={i.id}
                      levaJunto={i.dentro}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-start gap-3">
                      {nivel === "anuncio" && (
                        <Criativo
                          url={i.miniatura ?? null}
                          preview={i.preview ?? null}
                          nome={i.nome}
                        />
                      )}
                      <div className="min-w-0">
                        <span className="flex items-center gap-2 flex-wrap">
                          {destino ? (
                            <Link
                              href={destino}
                              className="font-medium hover:text-accent"
                            >
                              {i.nome}
                            </Link>
                          ) : (
                            <span className="font-medium">{i.nome}</span>
                          )}
                          {/* A arte gasta é o único problema desta tela que
                              não se vê em nenhum número isolado: o custo de
                              hoje parece normal, o de um mês atrás é que era
                              metade. A etiqueta diz o que mudou e quanto. */}
                          {etiquetaDoCansaco && (
                            <span
                              title={
                                i.cansaco?.custoAgoraCents != null &&
                                i.cansaco?.custoAntesCents != null
                                  ? `Custo por lead ${comoVariacao(i.cansaco.variacaoDoCusto) ?? ""}: de ${reais(i.cansaco.custoAntesCents)} pra ${reais(i.cansaco.custoAgoraCents)} nos últimos 7 dias`
                                  : undefined
                              }
                              className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${etiquetaDoCansaco.classe}`}
                            >
                              {etiquetaDoCansaco.texto}
                              {i.cansaco?.variacaoDoCusto != null &&
                                ` · custo ${comoVariacao(i.cansaco.variacaoDoCusto)}`}
                            </span>
                          )}
                        </span>
                        {/* Só a contagem de filhos mora aqui agora. O
                            estado virou coluna própria: embaixo do nome ele
                            dividia o mesmo cinza com "3 anúncios", e aí
                            "Reprovado" tinha o peso visual de um detalhe. */}
                        {temFilho && (
                          <span className="block text-xs text-foreground-muted mt-0.5">
                            {i.dentro}{" "}
                            {nivel === "campanha" ? "conjunto" : "anúncio"}
                            {i.dentro === 1 ? "" : "s"}
                          </span>
                        )}
                        {/* A legenda do anúncio, e agora editável aqui.
                            Até pouco tempo ela só existia dentro do
                            Gerenciador: pra saber o que um anúncio dizia era
                            preciso sair do sistema e procurar lá. Duas linhas
                            bastam pra reconhecer qual é qual numa lista de
                            vinte, e o lápis abre o texto inteiro. */}
                        {nivel === "anuncio" && (
                          <Legenda
                            clientId={clientId}
                            adId={i.id}
                            legenda={i.legenda ?? null}
                            titulo={i.titulo ?? null}
                            descricao={i.descricao ?? null}
                            podeMexer={podeMexer}
                          />
                        )}
                      </div>
                    </div>
                  </td>
                  {/* ── A coluna Veiculação ─────────────────────────────
                      Coluna própria, com bolinha, como no Gerenciador: numa
                      coluna a pessoa percorre de cima a baixo e vê de uma vez
                      o que não está entregando. */}
                  <td className="px-4 py-4 align-top whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1.5 ${COR_DA_VEICULACAO[veiculacao.gravidade]}`}
                      title={veiculacao.explicacao}
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${BOLINHA_DA_VEICULACAO[veiculacao.gravidade]}`}
                      />
                      {veiculacao.rotulo}
                    </span>
                    {/* O "o que fazer" fica escrito só quando é problema de
                        verdade. Nos outros casos vive no title do mouse:
                        desligado todo mundo entende sem ajuda, e uma frase
                        por linha numa lista de vinte vira ruído. */}
                    {veiculacao.gravidade === "problema" && (
                      <span className="block text-xs text-red-600 dark:text-red-400 mt-1 max-w-[16rem] whitespace-normal">
                        {veiculacao.explicacao}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right align-top hidden lg:table-cell">
                    {/* A verba é editável aqui mesmo. A decisão de mexer
                        nela nasce olhando gasto, leads e custo por lead na
                        mesma linha — tirá-la pra outra tela faria a pessoa
                        mudar o número sem os outros na frente. */}
                    <Verba
                      clientId={clientId}
                      nivel={nivel}
                      objetoId={i.id}
                      centavos={i.orcamentoCents}
                      diario={i.orcamentoDiario}
                      podeMexer={podeMexer}
                    />
                  </td>
                  <td className="px-4 py-4 text-right align-top tabular-nums whitespace-nowrap">
                    {i.spendCents > 0 ? (
                      reais(i.spendCents)
                    ) : (
                      <span className="text-foreground-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right align-top tabular-nums whitespace-nowrap">
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
                  <td className="px-4 py-4 text-right align-top tabular-nums whitespace-nowrap">
                    {/* Sem resultado não existe custo por resultado: "—" e não
                        R$ 0,00, que pareceria o melhor da lista. */}
                    {i.cpl === null ? (
                      <span className="text-foreground-muted">—</span>
                    ) : (
                      reais(i.cpl)
                    )}
                  </td>
                  <td className="px-4 py-4 text-right align-top tabular-nums whitespace-nowrap text-foreground-muted hidden md:table-cell">
                    {numero(i.impressions)}
                  </td>
                  <td className="px-4 py-4 text-right align-top tabular-nums whitespace-nowrap text-foreground-muted hidden xl:table-cell">
                    {numero(i.reach)}
                  </td>
                  <td className="px-4 py-4 text-right align-top tabular-nums whitespace-nowrap text-foreground-muted hidden 2xl:table-cell">
                    {umOuTraco(cpm(i), (v) => reais(Math.round(v)))}
                  </td>
                  <td className="px-4 py-4 text-right align-top tabular-nums whitespace-nowrap text-foreground-muted hidden 2xl:table-cell">
                    {umOuTraco(cpc(i), (v) => reais(Math.round(v)))}
                  </td>
                  <td className="px-4 py-4 text-right align-top tabular-nums whitespace-nowrap text-foreground-muted hidden 2xl:table-cell">
                    {umOuTraco(
                      i.ctrLink,
                      (v) => `${v.toFixed(2).replace(".", ",")}%`,
                    )}
                  </td>
                  <td className="px-4 py-4 text-right align-top tabular-nums whitespace-nowrap text-foreground-muted hidden 2xl:table-cell">
                    {umOuTraco(frequencia(i), (v) =>
                      v.toFixed(1).replace(".", ","),
                    )}
                  </td>
                  {temFilho && (
                    <td className="px-3 py-3 align-top text-right">
                      {destino && (
                        <Link
                          href={destino}
                          className="text-foreground-muted hover:text-accent"
                        >
                          <ChevronRight size={16} />
                        </Link>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {/* ── O rodapé de totais ──────────────────────────────────────
              Como no Gerenciador. Sem ele, pra saber quanto as oito
              campanhas gastaram juntas a pessoa soma de cabeça, erra, e
              desce pros cartões de cima — que mostram o total da CONTA, não
              o da lista aberta. Quando se desceu pra dentro de uma campanha,
              os dois números são diferentes, e aí o de cima engana.

              Custo por resultado e CPM aqui são recalculados do total, não
              uma média das linhas: média de custo por lead entre uma
              campanha que gastou R$ 3.000 e outra que gastou R$ 40 daria o
              mesmo peso às duas, e o número sairia errado. */}
          {itens.length > 1 && (
            <tfoot className="border-t-2 border-border-forte bg-surface-muted/40 font-medium">
              <tr>
                <td className="px-2 py-3" />
                <td className="px-3 py-3" />
                {/* A legenda embaixo é a do Gerenciador: ele diz "Results
                    from 6 campaigns / Excludes deleted items", porque somar
                    incluindo o excluído daria um total que não bate com
                    nenhuma linha da lista. */}
                <td className="px-3 py-3">
                  <span className="block text-xs uppercase tracking-wide text-foreground-muted">
                    Resultados de {itens.length} {rotulo.toLowerCase()}
                    {itens.length === 1 ? "" : "s"}
                  </span>
                  <span className="block text-[11px] normal-case text-foreground-muted/70">
                    Não inclui o que foi excluído
                  </span>
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 hidden lg:table-cell" />
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                  {reais(totais.spendCents)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                  {numero(totais.leads)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                  {umOuTraco(custoPorLead(totais), reais)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap hidden md:table-cell">
                  {numero(totais.impressions)}
                </td>
                {/* Alcance NÃO se soma, e por isso fica em branco: a mesma
                    pessoa alcançada por duas campanhas contaria duas vezes.
                    Um número inflado aqui seria pior que nenhum. */}
                <td
                  className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-foreground-muted hidden xl:table-cell"
                  title="Alcance não se soma: a mesma pessoa em duas linhas contaria duas vezes."
                >
                  —
                </td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap hidden 2xl:table-cell">
                  {umOuTraco(cpm(totais), (v) => reais(Math.round(v)))}
                </td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap hidden 2xl:table-cell">
                  {umOuTraco(cpc(totais), (v) => reais(Math.round(v)))}
                </td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap hidden 2xl:table-cell">
                  {umOuTraco(
                    ctr(totais),
                    (v) => `${v.toFixed(2).replace(".", ",")}%`,
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-foreground-muted hidden 2xl:table-cell">
                  —
                </td>
                {temFilho && <td className="px-3 py-3" />}
              </tr>
            </tfoot>
          )}
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
      acoesVistas: true,
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
        <AlertTriangle size={18} className="text-red-500" /> Não deu pra
        carregar {nome}
      </h1>
      <p className="text-sm text-foreground-muted">
        O resto do sistema continua funcionando — é só esta tela.
      </p>
      {detalhe && (
        <div className="border-t border-border pt-3">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-1">
            O que o servidor respondeu
          </p>
          <p className="text-xs font-mono text-red-500 break-words">
            {detalhe}
          </p>
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
      <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">
        {titulo}
      </p>
      <p
        className={`text-xl font-semibold mt-1 tabular-nums ${fraco ? "text-foreground-muted" : ""}`}
      >
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
