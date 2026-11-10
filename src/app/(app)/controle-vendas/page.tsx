import Link from "next/link";
import { AlertTriangle, Car, Eye, EyeOff, Search, Store, TrendingDown } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { canAccessModule } from "@/lib/permissions";
import { CARTEIRA } from "@/lib/carteira";
import { escopoDaCarteira, veTodaACarteira } from "@/lib/carteira";
import { formatCurrency, formatDate, CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS } from "@/lib/labels";
import {
  estadoDaVenda,
  tomPorDias,
  ESTILO_DA_LINHA,
  ESTILO_DO_SELO,
  ESTILO_DO_LINK,
  ESTILO_SECUNDARIO,
  ROTULO_DO_TOM,
  DIAS_AMARELO,
  DIAS_VERMELHO,
  DIAS_CRITICO,
  type TomDaVenda,
} from "@/lib/controle-vendas";
import { voltarAoControleDeVendas } from "@/lib/actions/controle-vendas";
import { TirarDoControle } from "./tirar-do-controle";

// Controle de vendas: uma linha por loja, ordenada pela que está há mais tempo
// sem vender. A tela existe pra responder uma pergunta só, de longe: quem
// parou de vender?
//
// A venda é a do carro, lançada na Gestão de Contas — o que a loja vende, não
// o que a agência fatura dela.

const TONS: TomDaVenda[] = ["verde", "amarelo", "vermelho", "critico"];

export default async function ControleVendasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tom?: string }>;
}) {
  const user = await requireModuleAccess("gestao-contas");
  const canSeeValues = canAccessModule(user.role, "financeiro");
  // Quem enxerga a casa inteira: vê todas as lojas e pode tirar do controle.
  const vêTudo = veTodaACarteira(user);
  const { q, tom } = await searchParams;

  const hoje = new Date();
  const trintaDias = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - 30));

  const [lojas, foraDoControle, ultimas, doMes] = await Promise.all([
    prisma.client.findMany({
      where: {
        ...CARTEIRA,
        // Quem foi tirado do controle não entra: a tela existe pra mostrar
        // quem precisa de ação, e consórcio no vermelho pra sempre é ruído.
        controlaVendas: true,
        // Gestor de tráfego vê só a carteira dele; Andrielli, gerência e o
        // dono veem a casa inteira. Mesma regra do Marcar Venda, mesma função
        // — as duas telas não podem discordar sobre o que é "seu cliente".
        ...escopoDaCarteira(user),
        ...(q
          ? { OR: [{ companyName: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] }
          : {}),
      },
      select: { id: true, companyName: true, city: true, state: true, status: true, startDate: true, createdAt: true },
      orderBy: { companyName: "asc" },
    }),
    // Os que saíram, pra existir caminho de volta — nada some sem retorno.
    prisma.client.findMany({
      where: { ...CARTEIRA, controlaVendas: false, ...escopoDaCarteira(user) },
      select: { id: true, companyName: true },
      orderBy: { companyName: "asc" },
    }),
    // A venda mais recente de cada loja — é ela que manda na cor. E, de
    // carona, o total de sempre: esta consulta já varre todas as vendas, então
    // pedir a soma junto não custa uma ida a mais ao banco.
    prisma.clientSale.groupBy({
      by: ["clientId"],
      _max: { soldAt: true },
      _count: { _all: true },
      _sum: { value: true },
    }),
    // Quanto cada uma vendeu nos últimos 30 dias, pra dar tamanho ao problema.
    prisma.clientSale.groupBy({
      by: ["clientId"],
      where: { soldAt: { gte: trintaDias } },
      _count: { _all: true },
      _sum: { value: true },
    }),
  ]);

  const ultimaPorLoja = new Map(ultimas.map((u) => [u.clientId, u._max.soldAt]));
  const totalPorLoja = new Map(
    ultimas.map((u) => [u.clientId, { qtd: u._count._all, total: Number(u._sum.value ?? 0) }])
  );
  const mesPorLoja = new Map(doMes.map((m) => [m.clientId, { qtd: m._count._all, total: Number(m._sum.value ?? 0) }]));

  const linhas = lojas.map((l) => {
    // Sem venda nenhuma, a conta parte de quando a loja virou cliente: quem
    // entrou ontem não pode nascer no vermelho por ainda não ter vendido.
    const desde = l.startDate ?? l.createdAt;
    const estado = estadoDaVenda(ultimaPorLoja.get(l.id) ?? null, desde, hoje);
    const mes = mesPorLoja.get(l.id) ?? { qtd: 0, total: 0 };
    // Tudo que a loja já vendeu desde que entrou. Loja sem venda nenhuma não
    // aparece na consulta, e por isso o zero vem daqui.
    const tudo = totalPorLoja.get(l.id) ?? { qtd: 0, total: 0 };
    return { ...l, estado, ultimaVenda: ultimaPorLoja.get(l.id) ?? null, mes, tudo };
  });

  // A pior primeiro: é o que precisa de ação hoje.
  linhas.sort((a, b) => b.estado.dias - a.estado.dias || a.companyName.localeCompare(b.companyName));

  const contagem = TONS.reduce(
    (acc, t) => ({ ...acc, [t]: linhas.filter((l) => l.estado.tom === t).length }),
    {} as Record<TomDaVenda, number>
  );
  const visiveis = tom && TONS.includes(tom as TomDaVenda) ? linhas.filter((l) => l.estado.tom === tom) : linhas;
  const paradas = contagem.vermelho + contagem.critico;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Car size={19} className="text-accent" /> Controle de vendas
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Há quanto tempo cada loja não vende. A que está parada há mais tempo aparece primeiro.
          {/* Sem esta frase, um gestor com 3 lojas acharia que a agência
              inteira tem 3 clientes. */}
          {!vêTudo && " Aqui estão as lojas sob a sua gestão."}
        </p>
      </div>

      {contagem.critico > 0 && (
        <div className="rounded-2xl border border-amber-400/40 bg-zinc-950 px-5 py-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-100">
            <span className="font-bold text-amber-400">
              {contagem.critico} loja(s) sem vender há {DIAS_CRITICO} dias ou mais
            </span>
            <span className="text-zinc-400">
              {" "}
              · {linhas
                .filter((l) => l.estado.tom === "critico")
                .slice(0, 5)
                .map((l) => l.companyName)
                .join(", ")}
              {contagem.critico > 5 && ` e mais ${contagem.critico - 5}`}
            </span>
          </p>
        </div>
      )}

      {/* Os quatro estados viram filtro: clicar mostra só aquele grupo. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {TONS.map((t) => {
          const faixa =
            t === "verde"
              ? `menos de ${DIAS_AMARELO} dias`
              : t === "amarelo"
                ? `${DIAS_AMARELO} a ${DIAS_VERMELHO - 1} dias`
                : t === "vermelho"
                  ? `${DIAS_VERMELHO} a ${DIAS_CRITICO - 1} dias`
                  : `${DIAS_CRITICO} dias ou mais`;
          const ativo = tom === t;
          return (
            <Link
              key={t}
              href={ativo ? "/controle-vendas" : `/controle-vendas?tom=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-2xl border p-4 transition-colors ${
                t === "critico" ? "bg-zinc-950 border-zinc-800" : "bg-surface border-border hover:bg-surface-muted"
              } ${ativo ? "ring-2 ring-accent" : ""}`}
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                {t === "critico" && <AlertTriangle size={12} className="text-amber-400" />}
                <span className={`px-2 py-0.5 rounded-full ${ESTILO_DO_SELO[t]}`}>{ROTULO_DO_TOM[t]}</span>
              </p>
              <p className={`text-2xl font-semibold mt-2 ${t === "critico" ? "text-amber-400" : ""}`}>
                {contagem[t]}
              </p>
              <p className={`text-[11px] mt-0.5 ${t === "critico" ? "text-zinc-400" : "text-foreground-muted"}`}>
                {faixa}
              </p>
            </Link>
          );
        })}
      </div>

      <form className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar loja ou cidade..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        {tom && <input type="hidden" name="tom" value={tom} />}
      </form>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        {visiveis.length === 0 ? (
          <div className="text-center py-16 text-foreground-muted">
            <Store size={28} className="mx-auto mb-2 opacity-40" />
            <p className="font-medium">Nenhuma loja nesta situação</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Loja</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Cidade/UF</th>
                  <th className="px-5 py-3 font-medium whitespace-nowrap">Sem vender</th>
                  <th className="px-5 py-3 font-medium whitespace-nowrap hidden sm:table-cell">Última venda</th>
                  <th className="px-5 py-3 font-medium text-right whitespace-nowrap">Vendas 30d</th>
                  {canSeeValues && <th className="px-5 py-3 font-medium text-right whitespace-nowrap">Valor 30d</th>}
                  {/* O total de sempre, pra dar o tamanho da loja ao lado do
                      momento dela: uma parada há 40 dias que já vendeu 200
                      carros não é o mesmo problema que uma que nunca vendeu. */}
                  <th className="px-5 py-3 font-medium text-right whitespace-nowrap">Vendas total</th>
                  {canSeeValues && (
                    <th className="px-5 py-3 font-medium text-right whitespace-nowrap">Valor total</th>
                  )}
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visiveis.map((l) => {
                  const critico = l.estado.tom === "critico";
                  return (
                    <tr key={l.id} className={`transition-colors ${ESTILO_DA_LINHA[l.estado.tom]}`}>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/gestao-contas/${l.id}`}
                          className={`font-medium hover:underline ${ESTILO_DO_LINK[l.estado.tom]}`}
                        >
                          {l.companyName}
                        </Link>
                      </td>
                      <td className={`px-5 py-3.5 hidden lg:table-cell ${ESTILO_SECUNDARIO[l.estado.tom]}`}>
                        {l.city ? `${l.city}${l.state ? "/" + l.state : ""}` : "—"}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${ESTILO_DO_SELO[l.estado.tom]}`}
                        >
                          {critico && <AlertTriangle size={12} className="shrink-0" />}
                          {l.estado.texto}
                        </span>
                      </td>
                      <td
                        className={`px-5 py-3.5 whitespace-nowrap hidden sm:table-cell ${ESTILO_SECUNDARIO[l.estado.tom]}`}
                      >
                        {l.ultimaVenda ? formatDate(l.ultimaVenda) : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium">
                        {l.mes.qtd > 0 ? l.mes.qtd : <span className={ESTILO_SECUNDARIO[l.estado.tom]}>0</span>}
                      </td>
                      {canSeeValues && (
                        <td className="px-5 py-3.5 text-right font-medium whitespace-nowrap">
                          {l.mes.total > 0 ? formatCurrency(l.mes.total) : <span className="text-foreground-muted">—</span>}
                        </td>
                      )}
                      <td className={`px-5 py-3.5 text-right ${ESTILO_SECUNDARIO[l.estado.tom]}`}>
                        {l.tudo.qtd > 0 ? l.tudo.qtd : "0"}
                      </td>
                      {canSeeValues && (
                        <td
                          className={`px-5 py-3.5 text-right whitespace-nowrap ${ESTILO_SECUNDARIO[l.estado.tom]}`}
                        >
                          {l.tudo.total > 0 ? formatCurrency(l.tudo.total) : "—"}
                        </td>
                      )}
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${CLIENT_STATUS_COLORS[l.status]}`}>
                          {CLIENT_STATUS_LABELS[l.status]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {/* Só quem vê a casa inteira tira loja do controle. A
                            ação no servidor confere de novo — isto evita
                            mostrar botão que não ia funcionar. */}
                        {vêTudo && <TirarDoControle clientId={l.id} loja={l.companyName} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Só pra quem pode mexer. Mostrar a lista a quem não pode devolver
          ninguém deixaria na tela um botão que não faz nada — pior que não ter
          botão, porque a pessoa clica e acha que o sistema quebrou. */}
      {vêTudo && foraDoControle.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium flex items-center gap-2">
            <EyeOff size={13} /> Fora do controle ({foraDoControle.length})
          </p>
          <p className="text-xs text-foreground-muted mt-1">
            Contas que não são loja de carro. Continuam normais no resto do sistema — só não entram nesta tela.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {foraDoControle.map((c) => (
              <form key={c.id} action={voltarAoControleDeVendas.bind(null, c.id)}>
                <button
                  type="submit"
                  title="Voltar pro controle de vendas"
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-surface-muted hover:bg-border/60 transition-colors"
                >
                  <Eye size={12} className="text-foreground-muted" />
                  {c.companyName}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      {paradas > 0 && (
        <p className="text-xs text-foreground-muted flex items-center gap-1.5">
          <TrendingDown size={13} />
          {paradas} loja(s) passando de {DIAS_VERMELHO} dias sem vender. Se a venda aconteceu e não foi
          registrada, lance em Marcar Venda — ou clique no nome pra abrir a conta.
        </p>
      )}
    </div>
  );
}
