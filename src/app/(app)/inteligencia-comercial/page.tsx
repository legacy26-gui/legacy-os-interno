import Link from "next/link";
import { ArrowRight, Lightbulb, Package, Sparkles, Trophy, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CARTEIRA, escopoDaCarteira } from "@/lib/carteira";
import { sugestoesDaCarteira } from "@/lib/inteligencia/sugestoes-da-carteira";

// A porta de entrada da Inteligência Comercial: o retrato do mês em três números, cada um
// levando pra tela que explica. Só CONTAGENS aqui — valor em reais mora atrás do módulo
// financeiro, nas telas de vendas.
//
// O que ainda NÃO existe está dito no fim da página, em vez de um painel que finge saber.

export const dynamic = "force-dynamic";

const DIA = 86_400_000;

export default async function InteligenciaComercialPage() {
  const user = await requireModuleAccess("gestao-contas");
  const agora = new Date();
  const inicioDoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const fimDoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
  const escopo = escopoDaCarteira(user);

  const [vendasPorLoja, lojasComEstoque, sugestoes] = await Promise.all([
    prisma.clientSale.groupBy({
      by: ["clientId"],
      where: { soldAt: { gte: inicioDoMes, lt: fimDoMes }, client: { controlaVendas: true, ...escopo } },
      _count: { _all: true },
    }),
    prisma.client.findMany({
      where: { ...CARTEIRA, ...escopo, estoqueDaLoja: { isNot: null } },
      select: {
        id: true,
        estoqueCarros: { where: { sumiuEm: null }, select: { primeiraVezEm: true } },
      },
    }),
    sugestoesDaCarteira(user),
  ]);
  const todas = sugestoes.lojas.flatMap((l) => l.sugestoes).sort((a, b) => a.prioridade - b.prioridade);

  const totalDeVendas = vendasPorLoja.reduce((s, v) => s + v._count._all, 0);
  const lider = [...vendasPorLoja].sort((a, b) => b._count._all - a._count._all)[0];
  const nomeDoLider = lider
    ? (await prisma.client.findUnique({ where: { id: lider.clientId }, select: { companyName: true } }))?.companyName ?? null
    : null;

  const carrosNoAr = lojasComEstoque.reduce((s, l) => s + l.estoqueCarros.length, 0);
  const parados = lojasComEstoque.reduce(
    (s, l) => s + l.estoqueCarros.filter((c) => (agora.getTime() - c.primeiraVezEm.getTime()) / DIA >= 60).length,
    0,
  );
  const mes = inicioDoMes.toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });

  const cartoes = [
    {
      href: "/controle-vendas",
      icone: TrendingUp,
      titulo: "Vendas por lead",
      numero: String(totalDeVendas),
      legenda: `${totalDeVendas === 1 ? "venda" : "vendas"} em ${mes}, em ${vendasPorLoja.length} ${vendasPorLoja.length === 1 ? "loja" : "lojas"}`,
      ver: "Ver controle de vendas",
    },
    {
      href: "/ranking-lojas",
      icone: Trophy,
      titulo: "Quem mais vendeu",
      numero: nomeDoLider ?? "—",
      legenda: lider ? `${lider._count._all} ${lider._count._all === 1 ? "venda" : "vendas"} em ${mes}` : "nenhuma venda lançada neste mês",
      ver: "Ver ranking de lojas",
      texto: true,
    },
    {
      href: "/inteligencia-comercial/estoque",
      icone: Package,
      titulo: "Estoque lido dos sites",
      numero: lojasComEstoque.length ? String(carrosNoAr) : "—",
      legenda: lojasComEstoque.length
        ? `carros no ar em ${lojasComEstoque.length} ${lojasComEstoque.length === 1 ? "loja" : "lojas"}${parados > 0 ? ` · ${parados} há 60+ dias` : ""}`
        : "nenhuma loja com site ligado ainda",
      ver: "Ver estoque",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Lightbulb size={20} /> Inteligência Comercial
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5 max-w-2xl">
          Como as lojas estão vendendo, e o que elas têm no estoque. É daqui que vão sair as sugestões da IA: carro parado,
          preço, hora de anunciar.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cartoes.map(({ href, icone: Icone, titulo, numero, legenda, ver, texto }) => (
          <Link
            key={href}
            href={href}
            className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-2 hover:bg-surface-muted transition-colors min-w-0"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted flex items-center gap-2">
              <Icone size={14} /> {titulo}
            </p>
            <p className={`font-bold ${texto ? "text-xl break-words" : "text-3xl tabular-nums"}`}>{numero}</p>
            <p className="text-sm text-foreground-muted">{legenda}</p>
            <p className="text-sm font-medium text-accent mt-auto pt-2 inline-flex items-center gap-1">
              {ver} <ArrowRight size={14} />
            </p>
          </Link>
        ))}
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3" aria-labelledby="sugestoes">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="sugestoes" className="font-semibold flex items-center gap-2">
            <Sparkles size={16} /> Sugestões
          </h2>
          <Link href="/inteligencia-comercial/sugestoes" className="text-sm font-medium text-accent inline-flex items-center gap-1">
            Ver todas ({todas.length}) <ArrowRight size={14} />
          </Link>
        </div>
        {sugestoes.lojas.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            As sugestões nascem do estoque do site cruzado com os anúncios. Liga o site de uma loja em{" "}
            <Link href="/inteligencia-comercial/estoque" className="text-accent underline underline-offset-2">
              Estoque
            </Link>{" "}
            pra elas aparecerem.
          </p>
        ) : todas.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nada pra mexer agora nas lojas com estoque ligado. 👍</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {todas.slice(0, 5).map((s, i) => (
              <li key={`${s.lojaId}-${s.tipo}-${s.carro?.id ?? i}`} className="py-2.5">
                <p className="text-sm font-medium break-words">
                  <span className="text-foreground-muted">{s.loja} · </span>
                  {s.titulo}
                </p>
                <p className="text-sm text-foreground-muted">{s.acao}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-foreground-muted">Comparação com a tabela FIPE: próximo passo.</p>
      </section>
    </div>
  );
}
