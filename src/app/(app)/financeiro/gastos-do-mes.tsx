import Link from "next/link";
import { ChevronLeft, ChevronRight, MessageCircle, TrendingDown, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/labels";
import type { GastosDoMes } from "@/lib/financeiro-ia/painel";
import { FinanceTabs } from "./finance-tabs";
import { ExcluirLancamento } from "./excluir-lancamento";

// A página "pra onde foi o dinheiro", usada pela empresa e pelo pessoal.
//
// ── Por que barras, e não pizza ──────────────────────────────────────────
//
// A pergunta é "quanto foi em mercado, quanto em alimentação, quanto em imposto"
// — comparar as gavetas entre si. Barras lado a lado, da maior pra menor e numa
// cor só, deixam ver na hora que mercado é o dobro de alimentação; fatias de pizza
// não. A porcentagem vem escrita na ponta de cada barra, então nada depende de
// adivinhar tamanho de fatia.
//
// No histórico, o mês aberto vem na cor de destaque e os outros em cinza: o
// assunto é este mês, os outros são régua.

const reais = (cents: number) => formatCurrency(cents / 100);

function mesParam(mes: string, delta: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function variacao(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

function Delta({ atual, anterior, rotulo }: { atual: number; anterior: number; rotulo: string }) {
  const v = variacao(atual, anterior);
  if (v === null) return <span className="text-xs text-foreground-muted">sem mês anterior pra comparar</span>;
  // Em gasto, subir é ruim: a seta para cima vem com o tom de atenção.
  const subiu = v > 0.5;
  const desceu = v < -0.5;
  const Icone = subiu ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        subiu ? "text-red-500" : desceu ? "text-emerald-600 dark:text-emerald-400" : "text-foreground-muted"
      }`}
    >
      {(subiu || desceu) && <Icone size={13} aria-hidden />}
      {subiu ? "+" : ""}
      {v.toFixed(0)}% {rotulo}
    </span>
  );
}

export function GastosDoMesTela({
  dados,
  titulo,
  subtitulo,
  caminho,
  vazio,
  aviso,
  tipo = "empresa",
}: {
  dados: GastosDoMes;
  titulo: string;
  subtitulo: string;
  /** A rota da página, pra navegar de mês. */
  caminho: string;
  vazio: string;
  aviso?: string;
  /** De onde vêm os lançamentos: decide qual exclusão vale. */
  tipo?: "empresa" | "pessoal";
}) {
  const hoje = new Date();
  const mesDeHoje = `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, "0")}`;
  const maiorCategoria = dados.porCategoria[0];
  const maxCategoria = Math.max(...dados.porCategoria.map((c) => c.cents), 1);
  const maxMes = Math.max(...dados.historico.map((m) => m.cents), 1);
  const mediaDia = dados.totalCents / Math.max(dados.diasCorridos, 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{titulo}</h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            {subtitulo} · {dados.rotuloDoMes}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`${caminho}?month=${mesParam(dados.mes, -1)}`}
            className="p-2.5 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors"
            title="Mês anterior"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={16} />
          </Link>
          <span className="px-3 py-2 rounded-lg border border-border bg-surface text-sm font-medium min-w-[9rem] text-center">
            {dados.rotuloDoMes}
          </span>
          {dados.mes !== mesDeHoje && (
            <Link
              href={caminho}
              className="px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors text-sm font-medium"
            >
              Hoje
            </Link>
          )}
          <Link
            href={`${caminho}?month=${mesParam(dados.mes, 1)}`}
            className="p-2.5 rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors"
            title="Próximo mês"
            aria-label="Próximo mês"
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      <FinanceTabs month={dados.mes} />

      {aviso && (
        <p className="text-sm rounded-xl border border-border bg-surface-muted px-4 py-3 text-foreground-muted">{aviso}</p>
      )}

      {/* Os números de cabeça */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Gasto no mês</p>
          <p className="text-2xl font-bold">{reais(dados.totalCents)}</p>
          <Delta atual={dados.totalCents} anterior={dados.anteriorCents} rotulo="vs mês passado" />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Onde mais foi</p>
          <p className="text-lg font-bold truncate">{maiorCategoria ? maiorCategoria.categoria : "—"}</p>
          <p className="text-xs text-foreground-muted">
            {maiorCategoria ? `${reais(maiorCategoria.cents)} · ${maiorCategoria.pct.toFixed(0)}% do mês` : "nada lançado"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Média por dia</p>
          <p className="text-2xl font-bold">{reais(mediaDia)}</p>
          <p className="text-xs text-foreground-muted">em {dados.diasCorridos} dias</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Lançamentos</p>
          <p className="text-2xl font-bold">{dados.lancamentos.length}</p>
          <p className="text-xs text-foreground-muted">
            {dados.lancamentos.filter((l) => l.peloRobo).length} pelo WhatsApp
          </p>
        </div>
      </div>

      {dados.porCategoria.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-foreground-muted">
          {vazio}
        </div>
      ) : (
        <>
          {/* Por categoria: barras ordenadas, uma cor */}
          <section className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4" aria-labelledby="por-categoria">
            <div>
              <h2 id="por-categoria" className="font-semibold">
                Por categoria
              </h2>
              <p className="text-sm text-foreground-muted">Da maior para a menor, com a fatia de cada uma no mês.</p>
            </div>
            <ul className="flex flex-col gap-3.5">
              {dados.porCategoria.map((c) => {
                const v = variacao(c.cents, c.anteriorCents);
                return (
                  <li key={c.categoria}>
                    <div
                      tabIndex={0}
                      className="group relative grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[10rem_minmax(0,1fr)_9rem] items-center gap-x-3 gap-y-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent py-0.5"
                      aria-label={`${c.categoria}: ${reais(c.cents)}, ${c.pct.toFixed(0)}% do mês, ${c.lancamentos} lançamentos`}
                    >
                      <span className="text-sm truncate">{c.categoria}</span>
                      <span className="text-sm font-medium tabular-nums text-right sm:order-3">
                        {reais(c.cents)} <span className="text-foreground-muted font-normal">· {c.pct.toFixed(0)}%</span>
                      </span>
                      <div className="col-span-2 sm:col-span-1 sm:order-2 h-4 rounded-r bg-surface-muted/60">
                        <div
                          className="h-4 rounded-r bg-accent transition-opacity group-hover:opacity-85"
                          style={{ width: `${Math.max((c.cents / maxCategoria) * 100, 1.5)}%` }}
                        />
                      </div>
                      {/* A dica do passar o mouse (ou do foco, no teclado e no toque) */}
                      <div
                        role="tooltip"
                        className="pointer-events-none absolute left-0 sm:left-40 -top-2 -translate-y-full z-10 hidden group-hover:block group-focus:block
                          rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg min-w-[12rem]"
                      >
                        <p className="font-semibold">{c.categoria}</p>
                        <p>
                          {reais(c.cents)} · {c.pct.toFixed(1).replace(".", ",")}% do mês
                        </p>
                        <p className="text-foreground-muted">
                          {c.lancamentos} {c.lancamentos === 1 ? "lançamento" : "lançamentos"}
                        </p>
                        <p className="text-foreground-muted">
                          Mês passado: {reais(c.anteriorCents)}
                          {v !== null ? ` (${v > 0 ? "+" : ""}${v.toFixed(0)}%)` : ""}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Últimos 6 meses: o mês aberto em destaque */}
          <section className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4" aria-labelledby="historico">
            <div>
              <h2 id="historico" className="font-semibold">
                Últimos 6 meses
              </h2>
              <p className="text-sm text-foreground-muted">O total de cada mês. O mês que você está vendo vem destacado.</p>
            </div>
            <div className="grid grid-cols-6 gap-2 sm:gap-4 items-end h-44" role="list">
              {dados.historico.map((m) => {
                const atual = m.mes === dados.mes;
                return (
                  <div
                    key={m.mes}
                    role="listitem"
                    tabIndex={0}
                    aria-label={`${m.rotulo}: ${reais(m.cents)}`}
                    className="group relative flex flex-col items-center justify-end h-full gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
                  >
                    {atual && <span className="text-[11px] font-semibold tabular-nums whitespace-nowrap">{reais(m.cents)}</span>}
                    <div
                      className={`w-full max-w-6 rounded-t ${atual ? "bg-accent" : "bg-foreground-muted/35"}`}
                      style={{ height: `${m.cents > 0 ? Math.max((m.cents / maxMes) * 100, 3) : 0}%` }}
                    />
                    <span className={`text-xs ${atual ? "font-semibold" : "text-foreground-muted"}`}>{m.rotulo}</span>
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full mb-1 z-10 hidden group-hover:block group-focus:block
                        rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg whitespace-nowrap"
                    >
                      <p className="font-semibold capitalize">{m.rotulo}</p>
                      <p>{reais(m.cents)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* A tabela: o mesmo dado, linha a linha */}
          <section className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3" aria-labelledby="lancamentos">
            <h2 id="lancamentos" className="font-semibold">
              Lançamentos do mês
            </h2>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[32rem]">
                <thead>
                  <tr className="text-left text-xs text-foreground-muted border-b border-border">
                    <th className="py-2 font-medium">Dia</th>
                    <th className="py-2 font-medium">O quê</th>
                    <th className="py-2 font-medium">Categoria</th>
                    <th className="py-2 font-medium text-right">Valor</th>
                    <th className="py-2 w-8" aria-label="Excluir" />
                  </tr>
                </thead>
                <tbody>
                  {dados.lancamentos.map((l) => (
                    <tr key={l.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 tabular-nums text-foreground-muted whitespace-nowrap">
                        {l.dia.slice(8, 10)}/{l.dia.slice(5, 7)}
                      </td>
                      <td className="py-2">
                        <span className="inline-flex items-center gap-1.5">
                          {l.descricao}
                          {l.peloRobo && (
                            <MessageCircle size={12} className="text-foreground-muted" aria-label="lançado pelo WhatsApp" />
                          )}
                        </span>
                      </td>
                      <td className="py-2 text-foreground-muted">{l.categoria}</td>
                      <td className="py-2 text-right tabular-nums font-medium">{reais(l.cents)}</td>
                      <td className="py-2 text-right">
                        <ExcluirLancamento id={l.id} tipo={tipo} descricao={l.descricao} valor={reais(l.cents)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
