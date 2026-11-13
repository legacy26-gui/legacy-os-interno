import Link from "next/link";
import { Megaphone, AlertTriangle, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CARTEIRA, escopoDaCarteira, veTodaACarteira } from "@/lib/carteira";
import { saldoEmReais, tempoDesde } from "@/lib/meta/saldo";
import {
  somar,
  custoPorLead,
  reais,
  numero,
  lerIntervalo,
  textoDaData,
  janelaDeDias,
  type Numeros,
  type Intervalo,
  ZERO,
} from "@/lib/meta/insights";
import { SeletorDePeriodo } from "@/components/seletor-de-periodo";
import { desdeOEnvio } from "@/lib/meta/pedido-de-verba";
import { escritaLiberada } from "@/lib/meta/escrever-na-graph";
import {
  avaliarLoja,
  comoDias,
  DIAS_DO_RITMO,
  DIAS_ACABANDO,
  DIAS_ATENCAO,
} from "@/lib/meta/estado-da-loja";
import {
  FAIXA_DA_LOJA,
  FUNDO_DA_LOJA,
  ETIQUETA_DA_LOJA,
  COR_DO_NUMERO,
  type TomDaLoja,
} from "@/lib/meta/tons";
import { BotaoAtualizarTudo } from "./atualizar-tudo";
import { AtualizarLoja } from "./atualizar-loja";
import { PuxadorDaLoja } from "./puxador";
import { Link2, FileBarChart, Wallet, TrendingUp, Users, Target, KeyRound } from "lucide-react";

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
// A ordem é a URGÊNCIA: a loja que para primeiro aparece primeiro. Vermelho
// no topo, depois âmbar, e dentro de cada cor a que tem menos dias de saldo.
// Loja sem conta vinculada vai pro fim — é linha sem número nenhum, e
// espalhada no meio ela corta a leitura das colunas em pedaços.
//
// Esta tela não é onde se PROCURA uma loja pelo nome; pra isso existe a ficha
// do cliente. É a tela de onde se trabalha a fila do dia, e fila se ordena por
// urgência.

// A varredura tem orçamento de 45s (ver ORCAMENTO_MS em lib/actions/meta-ads).
// 60 aqui dá a folga pra ela terminar e responder, e é um valor que vale em
// qualquer plano da Vercel — 300 só vale em alguns.
export const maxDuration = 60;

// Cada loja é um cartão de verdade: fundo próprio, borda em volta e espaço
// entre um e outro (border-spacing-y na tabela).
//
// A borda fica nas CÉLULAS e não na linha porque <tr> não aceita borda
// arredondada: a primeira célula fecha o canto da esquerda, a última o da
// direita, e as do meio só levam as bordas de cima e de baixo.
/** Do mais urgente pro menos. É isto que põe uma loja acima da outra. */
const ORDEM_DO_TOM: Record<TomDaLoja, number> = {
  "sem-saldo": 0,
  acabando: 1,
  atencao: 2,
  // Link já enviado desce pra baixo de quem ninguém tratou — inclusive de
  // quem só precisa de um olhar. É o ponto inteiro de marcar: tirar da fila
  // do dia o que já tem dono.
  aguardando: 3,
  // Cinza vem antes de verde de propósito: "não consegui ler o saldo" é uma
  // pendência de alguém, e verde é o lugar de quem não precisa de nada.
  neutro: 4,
  bom: 5,
};

const celDe = (tom: TomDaLoja) => `border-y ${FUNDO_DA_LOJA[tom]}`;

/**
 * O realce de passar o mouse — só nas lojas que estão bem.
 *
 * Em cima do cartão vermelho ele apagaria justamente a cor que importa, e por
 * um motivo bobo: o cinza do hover é opaco e cobre o vermelho translúcido.
 * Loja em apuros não precisa de realce de mouse; ela já está gritando.
 */
const linhaDe = (tom: TomDaLoja) =>
  tom === "sem-saldo" || tom === "acabando"
    ? ""
    : "transition-colors [&>td]:hover:bg-surface-muted";

export default async function MetaAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string }>;
}) {
  const user = await requireModuleAccess("clientes");
  const busca = await searchParams;

  const periodo = lerIntervalo(busca);

  // Buscar os dados dentro de um try: se o banco recusar alguma coisa, a
  // direção vê a MENSAGEM, não a tela preta do Next.
  //
  // Em produção o Next apaga a mensagem do erro e deixa só um código, que só
  // se lê no painel da Vercel. Na prática isso vira "quebrou e ninguém sabe
  // por quê". Pegando aqui, a frase do Postgres aparece na tela de quem pode
  // fazer algo com ela.
  let dados: Awaited<ReturnType<typeof carregar>>;
  try {
    dados = await carregar(user, periodo);
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return (
      <TelaDeFalha
        detalhe={veTodaACarteira(user) ? detalhe : null}
      />
    );
  }

  const { clientes, numerosDaConta, ritmoDaConta } = dados;

  const linhas = clientes
    .map((c) => {
      const contas = c.metaAdAccounts;
      const n = somar(contas.map((a) => numerosDaConta.get(a.id) ?? ZERO));

      const prePagas = contas.filter((a) => a.isPrepay);
      const comSaldo = prePagas.filter((a) => a.balanceSnapshots[0]);
      // Só soma o saldo quando TODAS as pré-pagas foram lidas. Loja com duas
      // contas e uma leitura boa daria um saldo pela metade, e um saldo pela
      // metade é pior que nenhum: parece número e não é.
      const saldo =
        prePagas.length > 0 && comSaldo.length === prePagas.length
          ? comSaldo.reduce((s, a) => s + a.balanceSnapshots[0].availableCents, 0)
          : null;

      // O ritmo da loja é a soma das contas dela, e os dias são a UNIÃO dos
      // dias: duas contas rodando no mesmo dia são um dia, não dois.
      let gastoRecenteCents = 0;
      const diasComDado = new Set<number>();
      for (const a of contas) {
        const r = ritmoDaConta.get(a.id);
        if (!r) continue;
        gastoRecenteCents += r.gastoCents;
        for (const d of r.dias) diasComDado.add(d);
      }

      const erro = contas.find((a) => a.lastSyncError)?.lastSyncError ?? null;

      const veredito = avaliarLoja({
        temConta: contas.length > 0,
        saldoCents: saldo,
        temPrePaga: prePagas.length > 0,
        comErro: !!erro,
        gastoRecenteCents,
        diasComDado: diasComDado.size,
        gastoMensalPrevistoCents: c.gastoMensalPrevistoCents,
        gastoDoPeriodoCents: n.spendCents,
        leads: n.leads,
        pedido: c.pedidosDeVerba[0] ?? null,
      });

      // A idade do NÚMERO, não da tentativa: a leitura mais velha entre as
      // contas da loja é o que vale, porque é ela que está atrasando a linha.
      const capturas = comSaldo.map((a) => a.balanceSnapshots[0].capturedAt.getTime());

      return {
        cliente: c,
        contas,
        numeros: n,
        cpl: custoPorLead(n),
        prePagas: prePagas.length,
        saldo,
        quando: capturas.length ? new Date(Math.min(...capturas)) : null,
        erro,
        veredito,
        pedido: c.pedidosDeVerba[0] ?? null,
      };
    })
    // ── A ordem: quem para primeiro aparece primeiro ────────────────────
    //
    // Eu tinha deixado em A-Z de propósito, com o argumento de que lista que
    // se reordena embaralha a tela e ninguém acha a loja que veio procurar.
    // O argumento está certo e a conclusão estava errada: esta tela não é
    // onde se PROCURA uma loja — pra isso existe a ficha do cliente. Esta é
    // a tela de onde se trabalha a fila do dia, e fila se ordena por
    // urgência, não por alfabeto.
    //
    // Então: primeiro o vermelho, depois o âmbar, e dentro de cada cor a loja
    // com MENOS dias de saldo em cima — a que está mais perto de parar.
    .sort((a, b) => {
      // Loja sem conta vai pro fim, seja qual for o resto.
      const temConta = Number(b.contas.length > 0) - Number(a.contas.length > 0);
      if (temConta !== 0) return temConta;

      // Promessa quebrada vem antes de tudo. O link foi mandado, o prazo
      // passou e o dinheiro não veio: ali não falta só saldo, falta uma
      // cobrança que já foi feita e ignorada.
      const quebrada =
        Number(b.veredito.pedido === "vencido") - Number(a.veredito.pedido === "vencido");
      if (quebrada !== 0) return quebrada;

      const urgencia = ORDEM_DO_TOM[a.veredito.tom] - ORDEM_DO_TOM[b.veredito.tom];
      if (urgencia !== 0) return urgencia;

      // Menos dias em cima — pelo número CHEIO, não pelo arredondado. Duas
      // lojas zeradas mostram as duas "menos de 1 dia", e no inteiro empatam:
      // foi assim que uma com R$ 36 apareceu acima de uma com R$ 0,00. Quem
      // não tem conta de dias (sem ritmo, ou no cartão) fica depois de quem
      // tem: "não sei quantos dias" não disputa o topo com "dois dias".
      const da = a.veredito.diasExatos ?? Number.POSITIVE_INFINITY;
      const db = b.veredito.diasExatos ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;

      // Ainda empatado: menos dinheiro em cima. Pega o caso das duas contas
      // sem ritmo nenhum, em que a conta de dias não existe pra nenhuma.
      const sa = a.saldo ?? Number.POSITIVE_INFINITY;
      const sb = b.saldo ?? Number.POSITIVE_INFINITY;
      if (sa !== sb) return sa - sb;

      return a.cliente.companyName.localeCompare(b.cliente.companyName, "pt-BR");
    });

  const comConta = linhas.filter((l) => l.contas.length > 0);
  const semConta = linhas.filter((l) => l.contas.length === 0);

  // Quem está acabando, pela régua de DIAS e não de valor.
  //
  // Só entra loja com leitura boa: conta cujo saldo não deu pra ler não é
  // conta com saldo baixo, e juntar as duas faria o aviso gritar por causa de
  // um erro de leitura. E só entra quem tem ritmo conhecido — sem ritmo não
  // existe "quantos dias ainda roda".
  const acabando = comConta
    .filter((l) => l.veredito.tom === "sem-saldo" || l.veredito.tom === "acabando")
    // A mais urgente primeiro, pelo mesmo critério da lista.
    .sort(
      (a, b) =>
        (a.veredito.diasExatos ?? -1) - (b.veredito.diasExatos ?? -1) ||
        (a.saldo ?? -1) - (b.saldo ?? -1)
    );

  // Gastou e não teve lead nenhum: ou a campanha está mesmo sem resultado, ou
  // o tipo de lead configurado não é o que essa conta usa. Os dois casos
  // pedem alguém olhando, e os dois se resolvem na tela da loja.
  const gastandoSemLead = linhas.filter((l) => l.numeros.spendCents > 0 && l.numeros.leads === 0);

  const totalDaCasa = somar(linhas.map((l) => l.numeros));
  const cplDaCasa = custoPorLead(totalDaCasa);
  const vePorGestor = veTodaACarteira(user);
  const podeVincular = user.role === "ADMIN" || user.role === "GERENTE";

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
        <div className="flex flex-wrap items-center gap-2">
          {/* Só pra direção, e só quando a escrita NÃO está configurada: é um
              atalho pra resolver uma pendência, não um item de menu. Quando
              estiver tudo certo ele some sozinho. */}
          {podeVincular && !escritaLiberada() && (
            <Link
              href="/meta-ads/conferir"
              className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-amber-500/60 rounded-lg text-sm font-medium text-amber-700 dark:text-amber-400 hover:bg-surface-muted"
            >
              <KeyRound size={15} /> Conferir chave da Meta
            </Link>
          )}
          {podeVincular && (
            <Link
              href="/meta-ads/vincular"
              className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-muted"
            >
              <Link2 size={15} /> Vincular contas
            </Link>
          )}
          <Link
            href="/meta-ads/relatorio"
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-muted"
          >
            <FileBarChart size={15} /> Relatório
          </Link>
          <BotaoAtualizarTudo />
        </div>
      </div>

      <SeletorDePeriodo
        caminho="/meta-ads"
        manter={{}}
        atalhoAtivo={periodo.chave}
        deAtual={periodo.de && !periodo.chave ? textoDaData(periodo.de) : ""}
        ateAtual={periodo.ate && !periodo.chave ? textoDaData(periodo.ate) : ""}
      />

      {acabando.length > 0 && (
        <div className="rounded-xl border-2 border-red-500 bg-red-500/10 px-4 py-3.5">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              {acabando.length} {acabando.length === 1 ? "loja precisa" : "lojas precisam"} de Pix:{" "}
              <span className="font-normal">
                {/* Reais E dias. O valor sozinho não diz nada ("R$ 180 é
                    pouco?" depende da loja), e os dias sozinhos esconderiam
                    quanto mandar. */}
                {acabando
                  .map((l) => {
                    const dias = comoDias(l.veredito.diasDeSaldo);
                    const valor = l.saldo === null ? null : saldoEmReais(l.saldo);
                    if (valor && dias) return `${l.cliente.companyName} — ${valor}, ${dias}`;
                    if (valor) return `${l.cliente.companyName} — ${valor}`;
                    return l.cliente.companyName;
                  })
                  .join(" · ")}
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
              {periodo.vidaInteira ? " na vida inteira das contas" : ` em ${periodo.rotulo.toLowerCase()}`}:{" "}
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
          icone={TrendingUp}
          cor="text-sky-500"
          titulo="Investido"
          valor={jaBuscou ? reais(totalDaCasa.spendCents) : "—"}
          fraco={!jaBuscou}
        />
        <Resumo
          icone={Users}
          cor="text-emerald-500"
          titulo="Leads"
          valor={jaBuscou ? numero(totalDaCasa.leads) : "—"}
          fraco={!jaBuscou}
        />
        <Resumo
          icone={Target}
          cor="text-violet-500"
          titulo="Custo por lead"
          valor={jaBuscou && cplDaCasa !== null ? reais(cplDaCasa) : "—"}
          fraco={!jaBuscou || cplDaCasa === null}
        />
        <Resumo
          icone={Wallet}
          cor="text-amber-500"
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
        /* Cada loja é um cartão, com espaço de verdade entre um e outro.
           Tentei antes com faixa alternada e divisória mais forte, e no tema
           CLARO isso some: a faixa é #f1f1f3 a 30% sobre branco, ou seja,
           branco. Espaço vazio não tem esse problema — ele se enxerga igual
           no claro e no escuro, que é o único jeito de resolver isto de uma
           vez em vez de ficar calibrando cinza. */
        <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm border-separate border-spacing-y-3">
              <thead>
                {/* Cada coluna diz o que é em duas linhas: o nome que se usa no
                    Gerenciador da Meta em cima, e embaixo, miúdo, de onde o
                    número vem. "Custo/lead" sozinho não diz se é do período ou
                    da vida inteira — e essa é justamente a dúvida que trava
                    alguém na frente da tela. */}
                <tr className="text-left align-bottom">
                  <th className="w-2 pb-2" />
                  <Cabecalho titulo="Loja" explicacao="conta de anúncio vinculada" />
                  {vePorGestor && (
                    <Cabecalho titulo="Gestor" escondida="hidden xl:table-cell" />
                  )}
                  <Cabecalho
                    titulo="Saldo"
                    explicacao="disponível pra gastar"
                    direita
                  />
                  <Cabecalho
                    titulo="Valor gasto"
                    explicacao={periodo.vidaInteira ? "vida inteira" : periodo.rotulo.toLowerCase()}
                    direita
                  />
                  <Cabecalho titulo="Resultados" explicacao="leads no período" direita />
                  <Cabecalho titulo="Custo por lead" explicacao="gasto ÷ leads" direita />
                  <Cabecalho
                    titulo="Lido"
                    explicacao="idade do saldo"
                    direita
                    escondida="hidden lg:table-cell"
                  />
                  {/* `relative` aqui não é enfeite.
                      O texto só-pra-leitor-de-tela é posicionado em absoluto,
                      e sem um ancestral posicionado ele se ancora na PÁGINA
                      inteira — então ia parar no x=655 da tabela rolada e
                      esticava o documento até lá. Resultado: toda a tela do
                      celular rolava de lado por causa de uma palavra
                      invisível. Com `relative`, ele se ancora nesta célula e
                      a rolagem da tabela o recorta junto. */}
                  <th className="relative px-2 pb-2 w-10">
                    <span className="sr-only">Atualizar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const c = l.cliente;
                  const n = l.numeros;
                  const tom = l.veredito.tom;
                  const etiqueta = ETIQUETA_DA_LOJA[tom];
                  const cel = celDe(tom);
                  const dias = comoDias(l.veredito.diasDeSaldo);

                  return (
                    <tr key={c.id} className={linhaDe(tom)}>
                      {/* A faixa colorida na beirada: diz o estado da loja
                          antes de qualquer número ser lido, e é ela que separa
                          uma linha da outra mesmo de longe.

                          Ela também PUXA as ações da loja — passando o mouse
                          no computador, tocando no celular. A faixa já é pra
                          onde o olho vai quando se varre a lista procurando o
                          vermelho; é o lugar certo pra "mandei o Pix". Loja
                          sem conta não tem o que fazer ali, então fica só a
                          faixa. */}
                      <td className={`p-0 align-top ${cel} border-l rounded-l-xl w-2`}>
                        {l.contas.length > 0 ? (
                          <PuxadorDaLoja
                            clientId={c.id}
                            tom={tom}
                            temPedidoAberto={l.veredito.pedido !== null}
                            podeAtualizar
                          />
                        ) : (
                          <div className={`w-2 h-full min-h-[4.5rem] ${FAIXA_DA_LOJA[tom]}`} />
                        )}
                      </td>
                      <td className={`px-4 py-4 align-top ${cel}`}>
                        <span className="flex items-center gap-2 flex-wrap">
                          {l.contas.length > 0 ? (
                            <Link
                              href={`/meta-ads/${c.id}`}
                              className="font-semibold text-base hover:text-accent"
                            >
                              {c.companyName}
                            </Link>
                          ) : (
                            <span className="font-semibold text-base">{c.companyName}</span>
                          )}
                          {etiqueta && (
                            <span
                              className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${etiqueta.classe}`}
                            >
                              {/* "Link enviado há 2 h" e não só "Link
                                  enviado": quem olha precisa saber se a
                                  cobrança é de agora ou de ontem de manhã. */}
                              {etiqueta.texto}
                              {tom === "aguardando" && l.pedido
                                ? ` ${desdeOEnvio(l.pedido.enviadoEm)}`
                                : ""}
                            </span>
                          )}
                          {/* Prometeu e não veio. Fica em cima de tudo na
                              ordem e ganha uma etiqueta própria: ali não
                              falta só dinheiro, falta uma cobrança que já foi
                              feita e ignorada. */}
                          {l.veredito.pedido === "vencido" && (
                            <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border bg-red-600 text-white border-red-600">
                              Pix não entrou · cobrado {desdeOEnvio(l.pedido!.enviadoEm)}
                            </span>
                          )}
                        </span>
                        <span className="block text-xs font-mono text-foreground-muted mt-1">
                          {l.contas.map((a) => a.metaAccountId).join(" · ") || (
                            <Link
                              href={`/clientes/${c.id}`}
                              className="inline-flex items-center gap-1 font-sans hover:text-accent"
                            >
                              <Plus size={12} /> vincular conta
                            </Link>
                          )}
                        </span>
                        {l.erro && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-start gap-1.5">
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                            <span>{l.erro}</span>
                          </p>
                        )}
                      </td>
                      {vePorGestor && (
                        <td className={`px-4 py-4 text-foreground-muted hidden xl:table-cell align-top ${cel}`}>
                          {c.manager?.name?.split(" ")[0] ?? "—"}
                        </td>
                      )}
                      <td className={`px-4 py-4 text-right align-top ${cel}`}>
                        {l.contas.length === 0 ? (
                          // Loja sem conta nenhuma não é "cartão": é loja que
                          // ainda não foi vinculada, e dizer "cartão" ali era
                          // afirmar uma forma de pagamento que ninguém
                          // escolheu.
                          <span className="text-foreground-muted">—</span>
                        ) : l.prePagas === 0 ? (
                          <span className="text-xs text-foreground-muted">cartão</span>
                        ) : l.saldo === null ? (
                          // "indisponível", nunca R$ 0,00: saldo que o sistema
                          // não conseguiu ler não é conta zerada.
                          <span className="text-xs text-foreground-muted">indisponível</span>
                        ) : (
                          <>
                            <span
                              className={`block text-lg font-bold tabular-nums leading-tight ${COR_DO_NUMERO[tom]}`}
                            >
                              {saldoEmReais(l.saldo)}
                            </span>
                            {/* Quantos dias ainda roda: é esta linha que
                                transforma o saldo em decisão. "R$ 180" não diz
                                se é pra mandar Pix hoje; "2 dias" diz. */}
                            {dias && (
                              <span
                                className={`block text-[11px] mt-0.5 ${
                                  tom === "sem-saldo" || tom === "acabando"
                                    ? "font-semibold text-red-600 dark:text-red-400"
                                    : "text-foreground-muted"
                                }`}
                              >
                                dá pra {dias}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className={`px-4 py-4 text-right align-top tabular-nums ${cel}`}>
                        {n.spendCents > 0 ? (
                          <span className="text-base font-semibold">{reais(n.spendCents)}</span>
                        ) : (
                          <span className="text-foreground-muted">—</span>
                        )}
                      </td>
                      <td className={`px-4 py-4 text-right align-top tabular-nums ${cel}`}>
                        {n.leads > 0 ? (
                          <span className="text-xl font-bold leading-none">{numero(n.leads)}</span>
                        ) : (
                          <span className="text-foreground-muted">—</span>
                        )}
                      </td>
                      <td className={`px-4 py-4 text-right align-top tabular-nums ${cel}`}>
                        {/* Sem lead não existe custo por lead: "—" e não
                            R$ 0,00. Gastar sem lead é problema, e zero ali
                            pareceria o melhor resultado da lista. */}
                        {l.cpl === null ? (
                          <span className="text-foreground-muted">—</span>
                        ) : (
                          <span className="text-base font-semibold">{reais(l.cpl)}</span>
                        )}
                      </td>
                      <td className={`px-4 py-4 text-right text-xs text-foreground-muted hidden lg:table-cell align-top ${cel}`}>
                        {l.quando ? tempoDesde(l.quando) : l.contas.length ? "nunca" : ""}
                      </td>
                      <td className={`px-2 py-4 align-top text-right ${cel} border-r rounded-r-xl`}>
                        {/* Loja sem conta não tem o que buscar. */}
                        {l.contas.length > 0 && (
                          <AtualizarLoja clientId={c.id} nome={c.companyName} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      )}

      {/* O que cada cor quer dizer.
          Cor sem legenda é adivinhação: quem é daltônico não distingue o
          vermelho do âmbar, e quem é novo na casa não sabe que vermelho forte
          quer dizer "parou". */}
      <div className="rounded-xl border border-border bg-surface px-4 py-3 flex flex-wrap gap-x-5 gap-y-2">
        <Legenda tom="sem-saldo" texto="Sem saldo — a campanha parou ou para hoje" />
        <Legenda tom="acabando" texto={`Acabando — menos de ${DIAS_ACABANDO} dias, o Pix está atrasado`} />
        <Legenda
          tom="atencao"
          texto={`Olhar — menos de ${DIAS_ATENCAO} dias, erro de leitura ou gasto sem lead`}
        />
        <Legenda tom="aguardando" texto="Link de verba já enviado — esperando o Pix" />
        <Legenda tom="bom" texto="Em ordem" />
        <Legenda tom="neutro" texto="Sem conta, ou saldo que não deu pra ler" />
      </div>

      <p className="text-xs text-foreground-muted max-w-prose">
        Clique na loja pra ver campanha por campanha. Valor gasto, leads e custo por lead são de{" "}
        {periodo.vidaInteira ? "toda a vida das contas" : periodo.rotulo.toLowerCase()}.{" "}
        <strong>“dá pra X dias”</strong> é o saldo dividido pelo gasto médio dos últimos{" "}
        {DIAS_DO_RITMO} dias — quando a loja não rodou nesse período, usa o investimento mensal
        combinado, que se define na ficha dela. Para vincular uma conta, abra a loja e use o bloco
        “Meta Ads” na ficha.
      </p>
    </div>
  );
}

/**
 * As duas consultas da tela, num lugar só pra poderem ser protegidas por um
 * try/catch sem embrulhar o desenho da página junto.
 */
async function carregar(user: Parameters<typeof escopoDaCarteira>[0], periodo: Intervalo) {
  const clientes = await prisma.client.findMany({
    where: { ...CARTEIRA, ...escopoDaCarteira(user) },
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      gastoMensalPrevistoCents: true,
      manager: { select: { name: true } },
      // O último pedido de verba, só. O histórico existe no banco e é pra
      // outra pergunta ("essa loja atrasa sempre?"); aqui o que importa é se
      // alguém já cobrou ESTA vez.
      pedidosDeVerba: {
        orderBy: { enviadoEm: "desc" },
        take: 1,
        select: { enviadoEm: true, entrouEm: true },
      },
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
    reach: true,
    clicks: true,
    linkClicks: true,
    leads: true,
  } as const;

  // "Vida inteira" vem da outra tabela: ela guarda um total por anúncio em vez
  // de um por dia, justamente pra não ter que somar anos de linha toda vez.
  const porConta = !idsDasContas.length
    ? []
    : periodo.vidaInteira
      ? await prisma.metaLifetime.groupBy({
          by: ["adAccountId"],
          where: { adAccountId: { in: idsDasContas } },
          _sum: SOMAS,
        })
      : await prisma.metaInsightDaily.groupBy({
          by: ["adAccountId"],
          where: {
            adAccountId: { in: idsDasContas },
            date: {
              ...(periodo.de ? { gte: periodo.de } : {}),
              ...(periodo.ate ? { lte: periodo.ate } : {}),
            },
          },
          _sum: SOMAS,
        });

  const numerosDaConta = new Map<string, Numeros>(
    porConta.map((g: (typeof porConta)[number]) => [
      g.adAccountId,
      {
        spendCents: g._sum.spendCents ?? 0,
        impressions: g._sum.impressions ?? 0,
        reach: g._sum.reach ?? 0,
        clicks: g._sum.clicks ?? 0,
        linkClicks: g._sum.linkClicks ?? 0,
        leads: g._sum.leads ?? 0,
      },
    ])
  );

  // ─── O ritmo de gasto de cada conta ───────────────────────────────────────
  //
  // Independente do período que a tela está mostrando: a pergunta "o saldo
  // está acabando?" é sempre sobre os últimos dias, mesmo quando a tela está
  // mostrando o mês passado.
  //
  // Agrupa por DIA e não só por conta porque a média precisa saber por quantos
  // dias dividir. Conta vinculada anteontem tem dois dias de dado: dividir por
  // catorze faria o gasto parecer sete vezes menor, e o saldo parecer durar
  // sete vezes mais do que dura.
  const janela = janelaDeDias(DIAS_DO_RITMO);
  const porDia = !idsDasContas.length
    ? []
    : await prisma.metaInsightDaily.groupBy({
        by: ["adAccountId", "date"],
        where: {
          adAccountId: { in: idsDasContas },
          date: { gte: janela.de, lte: janela.ate },
        },
        _sum: { spendCents: true },
      });

  const ritmoDaConta = new Map<string, { gastoCents: number; dias: Set<number> }>();
  for (const g of porDia) {
    const atual = ritmoDaConta.get(g.adAccountId) ?? { gastoCents: 0, dias: new Set<number>() };
    atual.gastoCents += g._sum.spendCents ?? 0;
    atual.dias.add(g.date.getTime());
    ritmoDaConta.set(g.adAccountId, atual);
  }

  return { clientes, numerosDaConta, ritmoDaConta };
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

/**
 * Um cabeçalho de coluna em duas linhas: o nome e, miúdo, de onde o número vem.
 *
 * O nome segue o vocabulário do Gerenciador da Meta ("Valor gasto",
 * "Resultados") de propósito: quem usa as duas telas no mesmo dia não devia
 * ter que traduzir.
 */
function Cabecalho({
  titulo,
  explicacao,
  direita,
  escondida,
}: {
  titulo: string;
  explicacao?: string;
  direita?: boolean;
  escondida?: string;
}) {
  return (
    <th
      className={`px-4 pb-2 font-medium ${direita ? "text-right" : "text-left"} ${escondida ?? ""}`}
    >
      <span className="block text-[11px] uppercase tracking-wide text-foreground">{titulo}</span>
      {explicacao && (
        <span className="block text-[10px] font-normal normal-case tracking-normal text-foreground-muted mt-0.5">
          {explicacao}
        </span>
      )}
    </th>
  );
}

/** Uma entrada da legenda de cores: a bolinha e o que ela quer dizer. */
function Legenda({ tom, texto }: { tom: TomDaLoja; texto: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-foreground-muted">
      <span className={`w-3 h-3 rounded-sm shrink-0 ${FAIXA_DA_LOJA[tom]}`} />
      {texto}
    </span>
  );
}

/**
 * Um número do resumo, com ícone.
 *
 * O ícone colorido não é enfeite: ele dá um ponto de referência pro olho
 * voltar sempre ao mesmo cartão. Num painel de quatro números iguais, achar
 * "leads" exige LER os quatro; com ícone, não.
 */
function Resumo({
  icone: Icone,
  cor,
  titulo,
  valor,
  fraco,
}: {
  icone: typeof Wallet;
  cor: string;
  titulo: string;
  valor: string;
  fraco?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border-forte bg-surface px-4 py-3.5">
      <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium flex items-center gap-1.5">
        <Icone size={13} className={fraco ? "text-foreground-muted" : cor} />
        {titulo}
      </p>
      <p
        className={`text-2xl font-semibold mt-1.5 tabular-nums ${fraco ? "text-foreground-muted" : ""}`}
      >
        {valor}
      </p>
    </div>
  );
}
