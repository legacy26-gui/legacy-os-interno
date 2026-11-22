import { redirect } from "next/navigation";
import Link from "next/link";
import { Trophy, Info, BarChart3 } from "lucide-react";
import { requireModuleAccess } from "@/lib/dal";
import { veTodaACarteira } from "@/lib/carteira";
import {
  PERIODOS,
  indicadoresDaEquipe,
  montarPeriodo,
  montarPlacares,
  type Metrica,
  type PlacarDaFuncao,
} from "@/lib/indicadores/equipe";

// Indicadores da equipe: quem fez o quê no período, um placar por função.
// Só o Guilherme e a Andrielli (dono e gerência) abrem; a gestora de tráfego não vê o
// placar das colegas. Ver src/lib/indicadores/equipe.ts para as regras e de onde vem cada número.

export const metadata = { title: "Indicadores da equipe" };
export const dynamic = "force-dynamic";

const fmtData = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

function tomDoRitmo(v: number): string {
  if (v >= 80) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (v >= 50) return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return "bg-red-500/15 text-red-600 dark:text-red-400";
}

function Celula({ m, v, lider }: { m: Metrica; v: number; lider: number }) {
  if (m.porcento) {
    return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tomDoRitmo(v)}`}>{v}%</span>;
  }
  const lidera = !m.contexto && v > 0 && v === lider;
  return (
    <span className={`tabular-nums ${v === 0 ? "text-foreground-muted/60" : lidera ? "font-bold text-emerald-600 dark:text-emerald-400" : ""}`}>
      {v}
      {lidera && <Trophy size={12} className="inline ml-1 -mt-0.5" aria-label="lidera esta coluna" />}
    </span>
  );
}

function Placar({ placar }: { placar: PlacarDaFuncao }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{placar.rotulo}</h2>
        {placar.destaque && (
          <p className="text-sm flex items-center gap-1.5">
            <Trophy size={15} className="text-amber-500" />
            Quem mais fez: <strong>{placar.destaque.nome.split(" ")[0]}</strong>
            <span className="text-foreground-muted">({placar.destaque.total} registros)</span>
          </p>
        )}
      </div>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm border-collapse min-w-max">
          <thead>
            <tr className="text-left text-xs text-foreground-muted border-b border-border">
              <th className="py-2 pr-4 font-medium sticky left-0 bg-surface">Pessoa</th>
              {placar.colunas.map((c) => (
                <th key={c.chave} className="py-2 px-3 font-medium text-right whitespace-nowrap" title={c.explica}>
                  <span className="border-b border-dotted border-foreground-muted/50 cursor-help">{c.rotulo}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {placar.pessoas.map((p) => (
              <tr key={p.id} className="border-b border-border/60 last:border-0">
                <td className="py-2.5 pr-4 sticky left-0 bg-surface">
                  {placar.funcao === "trafego" ? (
                    <Link href={`/meu-dia?de=${p.id}`} className="font-medium hover:underline" title="Abrir o Meu Dia dela">
                      {p.nome}
                    </Link>
                  ) : (
                    <span className="font-medium">{p.nome}</span>
                  )}
                  {p.cargo && <span className="block text-xs text-foreground-muted">{p.cargo}</span>}
                </td>
                {placar.colunas.map((c) => (
                  <td key={c.chave} className="py-2.5 px-3 text-right">
                    <Celula m={c} v={p.valores[c.chave]} lider={placar.lider[c.chave] ?? 0} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function IndicadoresPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const user = await requireModuleAccess("gestao-contas");
  // Regra do Guilherme: só ele e a Andrielli veem o placar da equipe.
  if (!veTodaACarteira(user)) redirect("/dashboard?erro=acesso-negado");

  const { p } = await searchParams;
  const periodo = montarPeriodo(p);
  const placares = montarPlacares(await indicadoresDaEquipe(periodo));
  const ultimoDia = new Date(periodo.ate.getTime() - 86_400_000);

  return (
    <div className="flex flex-col gap-4 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <BarChart3 size={20} className="text-accent" /> Indicadores da equipe
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Quem fez o quê, de {fmtData(periodo.de)} a {fmtData(ultimoDia)} ({periodo.diasUteis} {periodo.diasUteis === 1 ? "dia útil" : "dias úteis"}). Cada
          função tem o seu placar: gestora se compara com gestora.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Período">
        {PERIODOS.map((x) => (
          <Link
            key={x.chave}
            href={x.chave === "semana" ? "/indicadores" : `/indicadores?p=${x.chave}`}
            aria-current={x.chave === periodo.chave ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              x.chave === periodo.chave
                ? "border-accent bg-accent/10 font-semibold text-foreground"
                : "border-border bg-surface text-foreground-muted hover:text-foreground"
            }`}
          >
            {x.rotulo}
          </Link>
        ))}
      </nav>

      {placares.length === 0 ? (
        <p className="text-sm text-foreground-muted rounded-xl border border-border bg-surface p-8 text-center">
          Ninguém registrou nada no sistema neste período.
        </p>
      ) : (
        placares.map((pl) => <Placar key={pl.funcao} placar={pl} />)
      )}

      <p className="text-xs text-foreground-muted flex items-start gap-1.5">
        <Info size={13} className="shrink-0 mt-0.5" />
        <span>
          Só entra o que é feito <strong>pelo sistema</strong> com o nome de quem fez: caixinha do Meu Dia, revisão escrita, relatório marcado, anúncio
          subido ou pausado, venda lançada, arte, etapa, gravação, tarefa. Ligação e conversa no WhatsApp fora do robô não aparecem — zero aqui não quer
          dizer que a pessoa não trabalhou. Passe o mouse no nome da coluna pra ver o que ela conta. O troféu marca quem lidera cada coluna.
        </span>
      </p>
    </div>
  );
}
