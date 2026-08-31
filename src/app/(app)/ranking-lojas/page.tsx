import Link from "next/link";
import { Trophy, Car, TrendingUp, Target, Store, Medal } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { formatCurrency, formatDate } from "@/lib/labels";

// Ranking das lojas pelas vendas lançadas na Gestão de Contas. Duas leituras de
// "quem mais vendeu": por valor vendido e por quantidade de carros — quem vende
// caro nem sempre é quem vende muito.

const PERIODOS = [
  { chave: "mes", rotulo: "Este mês" },
  { chave: "anterior", rotulo: "Mês passado" },
  { chave: "trimestre", rotulo: "Últimos 3 meses" },
  { chave: "ano", rotulo: "Este ano" },
  { chave: "tudo", rotulo: "Tudo" },
] as const;

type Periodo = (typeof PERIODOS)[number]["chave"];

// As vendas ficam gravadas como data pura (meia-noite UTC), então a janela do
// período também é calculada em UTC — senão o fuso do servidor come um dia.
function janelaDoPeriodo(periodo: Periodo) {
  const hoje = new Date();
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();
  const inicioDoMes = Date.UTC(ano, mes, 1);
  const inicioDoProximoMes = Date.UTC(ano, mes + 1, 1);

  switch (periodo) {
    case "anterior":
      return { de: new Date(Date.UTC(ano, mes - 1, 1)), ate: new Date(inicioDoMes), rotulo: "no mês passado" };
    case "trimestre":
      return { de: new Date(Date.UTC(ano, mes - 2, 1)), ate: new Date(inicioDoProximoMes), rotulo: "nos últimos 3 meses" };
    case "ano":
      return { de: new Date(Date.UTC(ano, 0, 1)), ate: new Date(Date.UTC(ano + 1, 0, 1)), rotulo: `em ${ano}` };
    case "tudo":
      return { de: null, ate: null, rotulo: "desde o início" };
    default:
      return { de: new Date(inicioDoMes), ate: new Date(inicioDoProximoMes), rotulo: "neste mês" };
  }
}

interface LinhaDoRanking {
  clientId: string;
  loja: string;
  cidade: string | null;
  gestor: string | null;
  quantidade: number;
  valor: number;
  investido: number;
}

const LIMITE_DA_LISTA = 200;

export default async function RankingLojasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireModuleAccess("gestao-contas");
  const { periodo: periodoBruto } = await searchParams;
  const periodo = (PERIODOS.find((p) => p.chave === periodoBruto)?.chave ?? "mes") as Periodo;
  const { de, ate, rotulo } = janelaDoPeriodo(periodo);

  const [vendas, lojas] = await Promise.all([
    prisma.clientSale.findMany({
      where: de && ate ? { soldAt: { gte: de, lt: ate } } : {},
      orderBy: { soldAt: "desc" },
      select: {
        id: true,
        description: true,
        value: true,
        adSpend: true,
        soldAt: true,
        clientId: true,
        client: { select: { companyName: true } },
      },
    }),
    // Lojas ativas entram no ranking mesmo sem venda no período — ver quem
    // ficou zerado é tão importante quanto ver quem ganhou.
    prisma.client.findMany({
      where: { status: "ATIVO" },
      select: {
        id: true,
        companyName: true,
        city: true,
        state: true,
        manager: { select: { name: true } },
      },
    }),
  ]);

  const porLoja = new Map<string, LinhaDoRanking>();
  for (const l of lojas) {
    porLoja.set(l.id, {
      clientId: l.id,
      loja: l.companyName,
      cidade: l.city ? `${l.city}${l.state ? "/" + l.state : ""}` : null,
      gestor: l.manager?.name ?? null,
      quantidade: 0,
      valor: 0,
      investido: 0,
    });
  }
  for (const v of vendas) {
    // Loja que vendeu mas saiu da carteira (pausada, cancelada) continua
    // aparecendo — a venda aconteceu.
    const atual =
      porLoja.get(v.clientId) ??
      ({
        clientId: v.clientId,
        loja: v.client?.companyName ?? "Loja removida",
        cidade: null,
        gestor: null,
        quantidade: 0,
        valor: 0,
        investido: 0,
      } satisfies LinhaDoRanking);
    atual.quantidade += 1;
    atual.valor += Number(v.value);
    atual.investido += Number(v.adSpend);
    porLoja.set(v.clientId, atual);
  }

  const linhas = [...porLoja.values()];
  const comVenda = linhas.filter((l) => l.quantidade > 0);

  const porValor = [...comVenda].sort((a, b) => b.valor - a.valor);
  const porQuantidade = [...comVenda].sort(
    (a, b) => b.quantidade - a.quantidade || b.valor - a.valor
  );
  // A tabela geral segue o valor vendido; quem não vendeu fecha a lista.
  const tabela = [...linhas].sort((a, b) => b.valor - a.valor || b.quantidade - a.quantidade);

  const totalVendido = comVenda.reduce((s, l) => s + l.valor, 0);
  const totalInvestido = comVenda.reduce((s, l) => s + l.investido, 0);
  const totalVendas = comVenda.reduce((s, l) => s + l.quantidade, 0);
  const ticketMedio = totalVendas > 0 ? totalVendido / totalVendas : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Trophy size={20} className="text-accent" /> Ranking de Lojas
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Quem mais vendeu {rotulo} — por valor e por quantidade
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p.chave}
            href={`/ranking-lojas?periodo=${p.chave}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              periodo === p.chave
                ? "bg-accent text-white border-accent"
                : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"
            }`}
          >
            {p.rotulo}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Indicador icon={TrendingUp} label="Valor vendido" valor={formatCurrency(totalVendido)} tom="emerald" />
        <Indicador icon={Car} label="Carros vendidos" valor={String(totalVendas)} />
        <Indicador icon={Store} label="Lojas que venderam" valor={`${comVenda.length} de ${linhas.length}`} />
        <Indicador
          icon={Target}
          label="Ticket médio"
          valor={ticketMedio === null ? "—" : formatCurrency(ticketMedio)}
        />
      </div>

      {comVenda.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface py-16 text-center">
          <p className="font-medium">Nenhuma venda registrada {rotulo}</p>
          <p className="text-sm text-foreground-muted mt-1">
            As vendas são lançadas na página de cada cliente, dentro da Gestão de Contas.
          </p>
        </div>
      ) : (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            <Podio
              titulo="Top 3 — valor vendido"
              icone={TrendingUp}
              linhas={porValor.slice(0, 3)}
              destaque={(l) => formatCurrency(l.valor)}
              apoio={(l) => `${l.quantidade} ${l.quantidade === 1 ? "carro" : "carros"}`}
            />
            <Podio
              titulo="Top 3 — quantidade vendida"
              icone={Car}
              linhas={porQuantidade.slice(0, 3)}
              destaque={(l) => `${l.quantidade} ${l.quantidade === 1 ? "carro" : "carros"}`}
              apoio={(l) => formatCurrency(l.valor)}
            />
          </div>

          <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <p className="text-sm font-medium">Todas as lojas ({tabela.length})</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
                    <th className="px-5 py-3 font-medium">#</th>
                    <th className="px-5 py-3 font-medium">Loja</th>
                    <th className="px-5 py-3 font-medium hidden lg:table-cell">Gestor</th>
                    <th className="px-5 py-3 font-medium text-right">Vendas</th>
                    <th className="px-5 py-3 font-medium text-right">Valor vendido</th>
                    <th className="px-5 py-3 font-medium text-right hidden md:table-cell">Ticket médio</th>
                    <th className="px-5 py-3 font-medium text-right hidden lg:table-cell">Investido</th>
                    <th className="px-5 py-3 font-medium text-right hidden lg:table-cell">Custo por venda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tabela.map((l, i) => {
                    const ticket = l.quantidade > 0 ? l.valor / l.quantidade : null;
                    const custo = l.quantidade > 0 ? l.investido / l.quantidade : null;
                    return (
                      <tr key={l.clientId} className="hover:bg-surface-muted transition-colors">
                        <td className="px-5 py-3 text-foreground-muted">
                          {l.quantidade > 0 ? <Posicao posicao={i + 1} /> : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <Link href={`/gestao-contas/${l.clientId}`} className="font-medium hover:text-accent">
                            {l.loja}
                          </Link>
                          {l.cidade && <p className="text-xs text-foreground-muted">{l.cidade}</p>}
                        </td>
                        <td className="px-5 py-3 text-foreground-muted hidden lg:table-cell">{l.gestor ?? "—"}</td>
                        <td className="px-5 py-3 text-right font-medium">{l.quantidade}</td>
                        <td className={`px-5 py-3 text-right font-medium ${l.valor > 0 ? "text-emerald-500" : "text-foreground-muted"}`}>
                          {l.valor > 0 ? formatCurrency(l.valor) : "—"}
                        </td>
                        <td className="px-5 py-3 text-right text-foreground-muted hidden md:table-cell">
                          {ticket === null ? "—" : formatCurrency(ticket)}
                        </td>
                        <td className="px-5 py-3 text-right text-foreground-muted hidden lg:table-cell">
                          {l.investido > 0 ? formatCurrency(l.investido) : "—"}
                        </td>
                        <td className="px-5 py-3 text-right text-foreground-muted hidden lg:table-cell">
                          {custo === null || l.investido === 0 ? "—" : formatCurrency(custo)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium">
                    <td className="px-5 py-3" />
                    <td className="px-5 py-3">Total</td>
                    <td className="px-5 py-3 hidden lg:table-cell" />
                    <td className="px-5 py-3 text-right">{totalVendas}</td>
                    <td className="px-5 py-3 text-right text-emerald-500">{formatCurrency(totalVendido)}</td>
                    <td className="px-5 py-3 text-right hidden md:table-cell">
                      {ticketMedio === null ? "—" : formatCurrency(ticketMedio)}
                    </td>
                    <td className="px-5 py-3 text-right hidden lg:table-cell">
                      {totalInvestido > 0 ? formatCurrency(totalInvestido) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right hidden lg:table-cell">
                      {totalInvestido > 0 && totalVendas > 0 ? formatCurrency(totalInvestido / totalVendas) : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Todas as vendas ({vendas.length})</p>
              {vendas.length > LIMITE_DA_LISTA && (
                <p className="text-xs text-foreground-muted">mostrando as {LIMITE_DA_LISTA} mais recentes</p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
                    <th className="px-5 py-3 font-medium whitespace-nowrap">Data</th>
                    <th className="px-5 py-3 font-medium">Loja</th>
                    <th className="px-5 py-3 font-medium hidden md:table-cell">Descrição</th>
                    <th className="px-5 py-3 font-medium text-right hidden sm:table-cell">Investido</th>
                    <th className="px-5 py-3 font-medium text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vendas.slice(0, LIMITE_DA_LISTA).map((v) => (
                    <tr key={v.id} className="hover:bg-surface-muted transition-colors">
                      <td className="px-5 py-3 text-foreground-muted whitespace-nowrap">{formatDate(v.soldAt)}</td>
                      <td className="px-5 py-3">
                        <Link href={`/gestao-contas/${v.clientId}`} className="hover:text-accent">
                          {v.client?.companyName ?? "—"}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-foreground-muted hidden md:table-cell">
                        {v.description ?? "Venda"}
                      </td>
                      <td className="px-5 py-3 text-right text-foreground-muted hidden sm:table-cell">
                        {formatCurrency(v.adSpend.toString())}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-emerald-500">
                        {formatCurrency(v.value.toString())}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-foreground-muted">
        As vendas vêm do que os gestores lançam na página de cada cliente, em Gestão de Contas. Loja sem
        venda no período aparece zerada no fim da lista.
      </p>
    </div>
  );
}

const MEDALHAS = ["text-amber-400", "text-zinc-400", "text-amber-700"];

function Posicao({ posicao }: { posicao: number }) {
  if (posicao > 3) return <span>{posicao}</span>;
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      <Medal size={14} className={MEDALHAS[posicao - 1]} />
      {posicao}
    </span>
  );
}

function Podio({
  titulo,
  icone: Icone,
  linhas,
  destaque,
  apoio,
}: {
  titulo: string;
  icone: typeof Trophy;
  linhas: LinhaDoRanking[];
  destaque: (l: LinhaDoRanking) => string;
  apoio: (l: LinhaDoRanking) => string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <Icone size={15} className="text-accent" />
        <p className="text-sm font-medium">{titulo}</p>
      </div>
      <div className="divide-y divide-border">
        {linhas.map((l, i) => (
          <div
            key={l.clientId}
            className={`flex items-center gap-3 px-5 py-4 ${i === 0 ? "bg-accent/5" : ""}`}
          >
            <span
              className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                i === 0
                  ? "bg-amber-400 text-black"
                  : i === 1
                    ? "bg-zinc-400 text-black"
                    : "bg-amber-700 text-white"
              }`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={`/gestao-contas/${l.clientId}`}
                className={`block truncate font-medium hover:text-accent ${i === 0 ? "text-base" : "text-sm"}`}
              >
                {l.loja}
              </Link>
              <p className="text-xs text-foreground-muted truncate">
                {apoio(l)}
                {l.gestor ? ` · ${l.gestor}` : ""}
              </p>
            </div>
            <span className={`shrink-0 font-semibold text-emerald-500 ${i === 0 ? "text-lg" : "text-sm"}`}>
              {destaque(l)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Indicador({
  icon: Icon,
  label,
  valor,
  tom,
}: {
  icon: typeof Trophy;
  label: string;
  valor: string;
  tom?: "emerald";
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 mb-2 text-foreground-muted">
        <Icon size={15} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-xl font-semibold ${tom === "emerald" ? "text-emerald-500" : ""}`}>{valor}</p>
    </div>
  );
}
