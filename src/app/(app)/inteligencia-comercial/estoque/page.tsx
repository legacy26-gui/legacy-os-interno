import { ChevronDown, Package } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CARTEIRA, escopoDaCarteira } from "@/lib/carteira";
import { formatCurrency } from "@/lib/labels";
import { ControlesDaLoja } from "./painel-da-loja";

// O estoque das lojas, lido do site (AutoCerto) duas vezes por dia.
//
// Serve à inteligência comercial: há quantos dias cada carro está parado, o que entrou, o que
// o site já não mostra. O PREÇO daqui é o do site, só pra comparar — a venda usa o do anúncio.

export const dynamic = "force-dynamic";
// "Ler agora" também confere a FIPE de alguns carros (uma consulta por vez, por causa da cota).
export const maxDuration = 120;

const DIA = 86_400_000;
const diasDesde = (d: Date, agora: number) => Math.max(0, Math.floor((agora - d.getTime()) / DIA));

function haQuanto(d: Date | null, agora: number): string {
  if (!d) return "nunca";
  const min = Math.round((agora - d.getTime()) / 60_000);
  if (min < 60) return `há ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  return h < 36 ? `há ${h}h` : `há ${Math.round(h / 24)} dias`;
}

/** A FIPE do carro e a diferença pro preço do site. "—" quando o sistema não achou com segurança. */
function CelulaFipe({ c }: { c: { precoCents: number | null; fipeTipo: string | null; fipeCents: number | null; fipeMaxCents: number | null } }) {
  if (!c.fipeTipo) return <span className="text-foreground-muted text-xs">conferindo…</span>;
  if (c.fipeTipo === "nenhum" || !c.fipeCents) return <span className="text-foreground-muted">—</span>;
  const faixa = c.fipeTipo === "faixa" && c.fipeMaxCents;
  const valor = faixa
    ? `${formatCurrency(c.fipeCents / 100)}–${formatCurrency((c.fipeMaxCents as number) / 100)}`
    : formatCurrency(c.fipeCents / 100);
  let dif: number | null = null;
  if (c.precoCents !== null) {
    const ref = faixa ? (c.precoCents > (c.fipeMaxCents as number) ? (c.fipeMaxCents as number) : c.precoCents < c.fipeCents ? c.fipeCents : null) : c.fipeCents;
    dif = ref ? Math.round(((c.precoCents - ref) / ref) * 100) : 0;
  }
  return (
    <span>
      {valor}
      {dif !== null && dif !== 0 && (
        <span className={`ml-1.5 text-xs ${dif >= 10 ? "text-amber-600 dark:text-amber-400 font-medium" : dif < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground-muted"}`}>
          {dif > 0 ? "+" : ""}
          {dif}%
        </span>
      )}
    </span>
  );
}

export default async function EstoquePage() {
  const user = await requireModuleAccess("gestao-contas");
  const agora = Date.now();

  const lojas = await prisma.client.findMany({
    where: { ...CARTEIRA, ...escopoDaCarteira(user) },
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      estoqueDaLoja: true,
      estoqueCarros: {
        where: { sumiuEm: null },
        orderBy: { primeiraVezEm: "asc" },
        select: {
          id: true, titulo: true, anoModelo: true, km: true, precoCents: true, primeiraVezEm: true, url: true,
          fipeTipo: true, fipeCents: true, fipeMaxCents: true, fipeModelo: true, fipeReferencia: true,
        },
      },
      _count: { select: { estoqueCarros: { where: { sumiuEm: { not: null } } } } },
    },
  });

  const ligadas = lojas.filter((l) => l.estoqueDaLoja);
  const naoLigadas = lojas.filter((l) => !l.estoqueDaLoja);
  const totalDeCarros = ligadas.reduce((s, l) => s + l.estoqueCarros.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Package size={20} /> Estoque das lojas
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5 max-w-2xl">
          Lido do site de cada loja duas vezes por dia (9h e 15h). Mostra há quantos dias cada carro está no estoque. O
          preço aqui é o do site, só pra comparar: a venda usa o preço do anúncio.
        </p>
        <p className="text-sm mt-2">
          <strong>{ligadas.length}</strong> {ligadas.length === 1 ? "loja ligada" : "lojas ligadas"} ·{" "}
          <strong>{totalDeCarros}</strong> carros no ar
        </p>
      </div>

      {ligadas.map((l) => {
        const e = l.estoqueDaLoja!;
        const paradoMais = l.estoqueCarros.filter((c) => diasDesde(c.primeiraVezEm, agora) >= 60).length;
        return (
          // <details>: a loja abre e fecha clicando no título. Com uma loja só já vem aberta; com várias, fechadas (a página não vira
          // uma rolagem sem fim de carros) e o resumo de cada uma fica à vista.
          <details key={l.id} open={ligadas.length === 1} className="group rounded-2xl border border-border bg-surface p-5">
            <summary className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <div className="min-w-0">
                <h2 id={`h-${l.id}`} className="font-semibold flex items-center gap-1.5">
                  <ChevronDown size={16} className="shrink-0 text-foreground-muted transition-transform -rotate-90 group-open:rotate-0" aria-hidden />
                  {l.companyName}
                  <span className="text-xs font-normal text-foreground-muted group-open:hidden">· clique pra abrir</span>
                  <span className="text-xs font-normal text-foreground-muted hidden group-open:inline">· clique pra fechar</span>
                </h2>
                <p className="text-xs text-foreground-muted mt-0.5 break-all">
                  {e.siteUrl} · lido {haQuanto(e.ultimaLeituraEm, agora)}
                  {l._count.estoqueCarros > 0 && ` · ${l._count.estoqueCarros} já saíram da lista`}
                </p>
                {e.ultimoErro && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Última leitura: {e.ultimoErro}</p>}
              </div>
              <div className="flex gap-4 text-sm">
                <p>
                  <span className="text-2xl font-bold tabular-nums">{l.estoqueCarros.length}</span>
                  <span className="text-foreground-muted"> no ar</span>
                </p>
                {paradoMais > 0 && (
                  <p>
                    <span className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{paradoMais}</span>
                    <span className="text-foreground-muted"> há 60+ dias</span>
                  </p>
                )}
              </div>
            </summary>

            <div className="overflow-x-auto -mx-5 px-5 mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-foreground-muted border-b border-border">
                    <th className="py-2 font-medium">Carro</th>
                    <th className="py-2 font-medium text-right hidden sm:table-cell">Km</th>
                    <th className="py-2 font-medium text-right pl-2">Preço</th>
                    <th className="py-2 font-medium text-right pl-2 hidden md:table-cell">FIPE</th>
                    <th className="py-2 font-medium text-right pl-2">No estoque</th>
                  </tr>
                </thead>
                <tbody>
                  {l.estoqueCarros.map((c) => {
                    const dias = diasDesde(c.primeiraVezEm, agora);
                    return (
                      <tr key={c.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3">
                          <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">
                            {c.titulo}
                          </a>
                        </td>
                        <td className="py-2 text-right tabular-nums text-foreground-muted hidden sm:table-cell">{c.km !== null ? c.km.toLocaleString("pt-BR") : "—"}</td>
                        <td className="py-2 pl-2 text-right tabular-nums whitespace-nowrap">{c.precoCents !== null ? formatCurrency(c.precoCents / 100) : "—"}</td>
                        <td className="py-2 pl-2 text-right tabular-nums whitespace-nowrap hidden md:table-cell" title={c.fipeModelo ? `${c.fipeModelo}${c.fipeReferencia ? ` · ${c.fipeReferencia}` : ""}` : undefined}>
                          <CelulaFipe c={c} />
                        </td>
                        <td className={`py-2 pl-2 text-right tabular-nums whitespace-nowrap ${dias >= 60 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-foreground-muted"}`}>
                          {dias === 0 ? "hoje" : `${dias} ${dias === 1 ? "dia" : "dias"}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-foreground-muted mt-2">
              A contagem de dias começa quando o sistema viu o carro pela primeira vez: carros que já estavam no site no dia em que a leitura foi ligada aparecem como &quot;hoje&quot;. FIPE (tela larga): pela versão do carro; com duas versões parecidas, a faixa entre elas; &quot;—&quot; quando não achou com segurança. Passe o mouse pra ver a versão.
            </p>

            <div className="mt-4">
              <ControlesDaLoja clientId={l.id} siteUrl={e.siteUrl} podeLigar={user.role === "ADMIN"} />
            </div>
          </details>
        );
      })}

      {naoLigadas.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4" aria-labelledby="h-nao-ligadas">
          <div>
            <h2 id="h-nao-ligadas" className="font-semibold">
              Lojas sem site ligado ({naoLigadas.length})
            </h2>
            <p className="text-sm text-foreground-muted">Cole o endereço do site da loja. O sistema confere se sabe ler o site (AutoCerto ou site de catálogo, como o da 7 Point) antes de ligar.</p>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {naoLigadas.map((l) => (
              <li key={l.id} className="py-3 flex flex-col gap-2">
                <p className="text-sm font-medium">{l.companyName}</p>
                <ControlesDaLoja clientId={l.id} siteUrl={null} podeLigar={user.role === "ADMIN"} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
