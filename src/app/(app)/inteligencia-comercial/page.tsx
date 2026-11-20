import Link from "next/link";
import { ArrowRight, Lightbulb, Package, Trophy, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CARTEIRA, escopoDaCarteira } from "@/lib/carteira";

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

  const [vendasPorLoja, lojasComEstoque] = await Promise.all([
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
  ]);

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

      <section className="rounded-2xl border border-dashed border-border bg-surface p-5 flex flex-col gap-2" aria-labelledby="em-breve">
        <h2 id="em-breve" className="font-semibold">
          Ainda não existe
        </h2>
        <p className="text-sm text-foreground-muted max-w-2xl">
          As sugestões da IA. O estoque já entra no sistema; falta cruzar com anúncio, lead e venda pra dizer, por exemplo,
          &quot;esse carro está parado há 75 dias, baixar o preço ou trocar o criativo&quot;, &quot;esse acabou de entrar,
          anunciar&quot; e &quot;preço acima da tabela FIPE&quot;. Quando chegar, aparece aqui.
        </p>
      </section>
    </div>
  );
}
