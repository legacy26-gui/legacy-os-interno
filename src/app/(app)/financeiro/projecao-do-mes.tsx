import { Clock, Flag, MinusCircle, PlusCircle, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/labels";
import type { Projecao } from "@/lib/financeiro-ia/projecao";

// "Como o mês fecha": saldo de hoje + o que falta entrar − o que falta sair.
//
// É uma conta de escada, na ordem em que se lê: cada linha mexe no número da anterior
// e a última é o resultado. A linha de "dia a dia" é a única estimativa, e vem
// marcada como tal; logo abaixo, o resultado SEM ela, pra ver os dois.

const reais = (c: number) => formatCurrency(c / 100);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function ProjecaoDoMes({ p }: { p: Projecao }) {
  if (p.saldoHojeCents === null) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-surface p-5 flex flex-col gap-1" aria-labelledby="projecao">
        <h2 id="projecao" className="font-semibold flex items-center gap-2">
          <Flag size={16} /> Projeção do fim do mês
        </h2>
        <p className="text-sm text-foreground-muted">
          Falta informar o saldo em caixa. Informe no campo &quot;Saldo em banco&quot; aqui embaixo — ou mande no grupo
          financeiro do WhatsApp: <em>meu saldo é 12.500</em>.
        </p>
      </section>
    );
  }

  const fecha = p.fechaEmCents ?? 0;
  const negativo = fecha < 0;
  const linhas = [
    { icone: Wallet, rotulo: "Saldo em caixa hoje", nota: "o que você informou, mais as entradas e menos as saídas desde então", valor: p.saldoHojeCents, sinal: "" },
    { icone: PlusCircle, rotulo: "A receber no mês", nota: `${plural(p.aReceberQtd, "cobrança", "cobranças")} · o mesmo número da Análise financeira`, valor: p.aReceberCents, sinal: "+" },
    { icone: MinusCircle, rotulo: "Fixos e contas a pagar", nota: `${plural(p.aPagarQtd, "saída", "saídas")} ainda não confirmadas`, valor: p.aPagarCents, sinal: "−" },
    ...(p.diasQueFaltam > 0
      ? [{ icone: Clock, rotulo: "Gastos do dia a dia", nota: `estimativa pelo ritmo do mês, para os ${p.diasQueFaltam} ${p.diasQueFaltam === 1 ? "dia" : "dias"} que faltam`, valor: p.ritmoCents, sinal: "−" }]
      : []),
  ];

  return (
    <section
      className={`rounded-2xl border p-5 flex flex-col gap-4 ${negativo ? "border-red-500/30 bg-red-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}
      aria-labelledby="projecao"
    >
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 id="projecao" className="font-semibold flex items-center gap-2">
            <Flag size={16} /> Projeção do fim de {p.mesRotulo}
          </h2>
          <p className="text-sm text-foreground-muted mt-0.5">Com quanto de caixa o mês fecha, se tudo que está previsto acontecer.</p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">O mês fecha com</p>
          <p className={`text-3xl font-bold ${negativo ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>{reais(fecha)}</p>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-border/70">
        {linhas.map(({ icone: Icone, rotulo, nota, valor, sinal }) => (
          <li key={rotulo} className="py-2.5 flex items-start gap-3">
            <Icone size={16} className="mt-0.5 shrink-0 text-foreground-muted" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{rotulo}</p>
              <p className="text-xs text-foreground-muted">{nota}</p>
            </div>
            <p className="text-sm font-semibold tabular-nums whitespace-nowrap">
              {sinal && <span className="text-foreground-muted mr-1">{sinal}</span>}
              {reais(valor)}
            </p>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1 text-xs text-foreground-muted">
        {p.diasQueFaltam > 0 && p.semRitmoCents !== null && (
          <p>
            Sem contar novos gastos do dia a dia: <strong className="text-foreground">{reais(p.semRitmoCents)}</strong>
          </p>
        )}
        {p.atrasadoAntigoCents > 0 && (
          <p>Fora da conta: {reais(p.atrasadoAntigoCents)} em cobranças atrasadas de meses anteriores — ninguém sabe se entram.</p>
        )}
      </div>
    </section>
  );
}
