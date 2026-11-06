import Link from "next/link";
import { AlertTriangle, Car, Search, Store, TrendingDown } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { canAccessModule } from "@/lib/permissions";
import { CARTEIRA } from "@/lib/carteira";
import { formatCurrency, formatDate, CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS } from "@/lib/labels";
import {
  estadoDaVenda,
  tomPorDias,
  ESTILO_DA_LINHA,
  ESTILO_DO_SELO,
  ROTULO_DO_TOM,
  DIAS_AMARELO,
  DIAS_VERMELHO,
  DIAS_PRETO,
  type TomDaVenda,
} from "@/lib/controle-vendas";

// Controle de vendas: uma linha por loja, ordenada pela que está há mais tempo
// sem vender. A tela existe pra responder uma pergunta só, de longe: quem
// parou de vender?
//
// A venda é a do carro, lançada na Gestão de Contas — o que a loja vende, não
// o que a agência fatura dela.

const TONS: TomDaVenda[] = ["verde", "amarelo", "vermelho", "preto"];

export default async function ControleVendasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tom?: string }>;
}) {
  const user = await requireModuleAccess("gestao-contas");
  const canSeeValues = canAccessModule(user.role, "financeiro");
  const { q, tom } = await searchParams;

  const hoje = new Date();
  const trintaDias = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - 30));

  const [lojas, ultimas, doMes] = await Promise.all([
    prisma.client.findMany({
      where: {
        ...CARTEIRA,
        ...(q
          ? { OR: [{ companyName: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] }
          : {}),
      },
      select: { id: true, companyName: true, city: true, state: true, status: true, startDate: true, createdAt: true },
      orderBy: { companyName: "asc" },
    }),
    // A venda mais recente de cada loja — é ela que manda na cor.
    prisma.clientSale.groupBy({ by: ["clientId"], _max: { soldAt: true } }),
    // Quanto cada uma vendeu nos últimos 30 dias, pra dar tamanho ao problema.
    prisma.clientSale.groupBy({
      by: ["clientId"],
      where: { soldAt: { gte: trintaDias } },
      _count: { _all: true },
      _sum: { value: true },
    }),
  ]);

  const ultimaPorLoja = new Map(ultimas.map((u) => [u.clientId, u._max.soldAt]));
  const mesPorLoja = new Map(doMes.map((m) => [m.clientId, { qtd: m._count._all, total: Number(m._sum.value ?? 0) }]));

  const linhas = lojas.map((l) => {
    // Sem venda nenhuma, a conta parte de quando a loja virou cliente: quem
    // entrou ontem não pode nascer no vermelho por ainda não ter vendido.
    const desde = l.startDate ?? l.createdAt;
    const estado = estadoDaVenda(ultimaPorLoja.get(l.id) ?? null, desde, hoje);
    const mes = mesPorLoja.get(l.id) ?? { qtd: 0, total: 0 };
    return { ...l, estado, ultimaVenda: ultimaPorLoja.get(l.id) ?? null, mes };
  });

  // A pior primeiro: é o que precisa de ação hoje.
  linhas.sort((a, b) => b.estado.dias - a.estado.dias || a.companyName.localeCompare(b.companyName));

  const contagem = TONS.reduce(
    (acc, t) => ({ ...acc, [t]: linhas.filter((l) => l.estado.tom === t).length }),
    {} as Record<TomDaVenda, number>
  );
  const visiveis = tom && TONS.includes(tom as TomDaVenda) ? linhas.filter((l) => l.estado.tom === tom) : linhas;
  const paradas = contagem.vermelho + contagem.preto;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Car size={19} className="text-accent" /> Controle de vendas
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Há quanto tempo cada loja não vende. A que está parada há mais tempo aparece primeiro.
        </p>
      </div>

      {contagem.preto > 0 && (
        <div className="rounded-2xl border border-amber-400/40 bg-zinc-950 px-5 py-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-100">
            <span className="font-bold text-amber-400">
              {contagem.preto} loja(s) sem vender há {DIAS_PRETO} dias ou mais
            </span>
            <span className="text-zinc-400">
              {" "}
              · {linhas
                .filter((l) => l.estado.tom === "preto")
                .slice(0, 5)
                .map((l) => l.companyName)
                .join(", ")}
              {contagem.preto > 5 && ` e mais ${contagem.preto - 5}`}
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
                  ? `${DIAS_VERMELHO} a ${DIAS_PRETO - 1} dias`
                  : `${DIAS_PRETO} dias ou mais`;
          const ativo = tom === t;
          return (
            <Link
              key={t}
              href={ativo ? "/controle-vendas" : `/controle-vendas?tom=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-2xl border p-4 transition-colors ${
                t === "preto" ? "bg-zinc-950 border-zinc-800" : "bg-surface border-border hover:bg-surface-muted"
              } ${ativo ? "ring-2 ring-accent" : ""}`}
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                {t === "preto" && <AlertTriangle size={12} className="text-amber-400" />}
                <span className={`px-2 py-0.5 rounded-full ${ESTILO_DO_SELO[t]}`}>{ROTULO_DO_TOM[t]}</span>
              </p>
              <p className={`text-2xl font-semibold mt-2 ${t === "preto" ? "text-amber-400" : ""}`}>
                {contagem[t]}
              </p>
              <p className={`text-[11px] mt-0.5 ${t === "preto" ? "text-zinc-400" : "text-foreground-muted"}`}>
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
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visiveis.map((l) => {
                  const preto = l.estado.tom === "preto";
                  return (
                    <tr key={l.id} className={`transition-colors ${ESTILO_DA_LINHA[l.estado.tom]}`}>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/gestao-contas/${l.id}`}
                          className={`font-medium hover:underline ${preto ? "text-amber-400" : "hover:text-accent"}`}
                        >
                          {l.companyName}
                        </Link>
                      </td>
                      <td
                        className={`px-5 py-3.5 hidden lg:table-cell ${preto ? "text-zinc-400" : "text-foreground-muted"}`}
                      >
                        {l.city ? `${l.city}${l.state ? "/" + l.state : ""}` : "—"}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${ESTILO_DO_SELO[l.estado.tom]}`}
                        >
                          {preto && <AlertTriangle size={12} className="shrink-0" />}
                          {l.estado.texto}
                        </span>
                      </td>
                      <td
                        className={`px-5 py-3.5 whitespace-nowrap hidden sm:table-cell ${preto ? "text-zinc-400" : "text-foreground-muted"}`}
                      >
                        {l.ultimaVenda ? formatDate(l.ultimaVenda) : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium">
                        {l.mes.qtd > 0 ? (
                          l.mes.qtd
                        ) : (
                          <span className={preto ? "text-zinc-500" : "text-foreground-muted"}>0</span>
                        )}
                      </td>
                      {canSeeValues && (
                        <td className="px-5 py-3.5 text-right font-medium whitespace-nowrap">
                          {l.mes.total > 0 ? formatCurrency(l.mes.total) : <span className="text-foreground-muted">—</span>}
                        </td>
                      )}
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${CLIENT_STATUS_COLORS[l.status]}`}>
                          {CLIENT_STATUS_LABELS[l.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {paradas > 0 && (
        <p className="text-xs text-foreground-muted flex items-center gap-1.5">
          <TrendingDown size={13} />
          {paradas} loja(s) passando de {DIAS_VERMELHO} dias sem vender. Clique no nome pra abrir a conta e lançar a
          venda, se ela aconteceu e não foi registrada.
        </p>
      )}
    </div>
  );
}
