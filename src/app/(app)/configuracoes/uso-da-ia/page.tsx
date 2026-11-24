import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/dal";
import { veTodasAsEmpresas } from "@/lib/empresa";
import { AI_CONFIG } from "@/lib/ai/config";
import { precos, resumoDoUso, type LinhaDoResumo } from "@/lib/ai/uso";

// Quanto cada função do sistema gasta de IA. Só a direção vê. O custo é ESTIMADO pelo preço de tabela; a fatura real é a do
// painel da OpenAI — o que esta tela dá, e o painel não, é QUAL função está pesando.

export const dynamic = "force-dynamic";

const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 })}`;
const mil = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(n));

function inicioDoDiaEmSP(agora: Date): Date {
  const d = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const deslocamento = agora.getTime() - d.getTime();
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + deslocamento);
}

function Tabela({ titulo, linhas, total, chamadas }: { titulo: string; linhas: LinhaDoResumo[]; total: number; chamadas: number }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-semibold">{titulo}</h2>
        <p className="text-sm">
          <strong className="text-lg tabular-nums">{usd(total)}</strong>
          <span className="text-foreground-muted"> · {chamadas} chamadas</span>
        </p>
      </div>
      {linhas.length === 0 ? (
        <p className="text-sm text-foreground-muted">Nenhuma chamada registrada.</p>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-foreground-muted border-b border-border">
                <th className="py-2 font-medium">Função</th>
                <th className="py-2 font-medium text-right">Chamadas</th>
                <th className="py-2 font-medium text-right hidden sm:table-cell">Tokens entrada</th>
                <th className="py-2 font-medium text-right hidden sm:table-cell">Tokens saída (pensando)</th>
                <th className="py-2 font-medium text-right">Custo estimado</th>
                <th className="py-2 font-medium text-right hidden md:table-cell">Por chamada</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.funcao} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3">{l.nome}</td>
                  <td className="py-2 text-right tabular-nums">{l.chamadas}</td>
                  <td className="py-2 text-right tabular-nums text-foreground-muted hidden sm:table-cell">{mil(l.entrada)}</td>
                  <td className="py-2 text-right tabular-nums text-foreground-muted hidden sm:table-cell">
                    {mil(l.saida)} ({mil(l.raciocinio)})
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">{usd(l.custoUsd)}</td>
                  <td className="py-2 text-right tabular-nums text-foreground-muted hidden md:table-cell">{usd(l.chamadas ? l.custoUsd / l.chamadas : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function UsoDaIaPage() {
  const user = await getCurrentUser();
  if (user.role !== "ADMIN") redirect("/dashboard?erro=acesso-negado");
  if (!veTodasAsEmpresas(user.empresas)) redirect("/dashboard?erro=so-grupo");

  const agora = new Date();
  const [hoje, semana, mes] = await Promise.all([
    resumoDoUso(inicioDoDiaEmSP(agora)),
    resumoDoUso(new Date(agora.getTime() - 7 * 86_400_000)),
    resumoDoUso(new Date(agora.getTime() - 30 * 86_400_000)),
  ]);
  const p = precos();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/configuracoes" className="text-sm text-foreground-muted inline-flex items-center gap-1.5 hover:text-foreground w-fit">
        <ArrowLeft size={14} /> Configurações
      </Link>
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Sparkles size={20} /> Uso da IA
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5 max-w-2xl">
          Quanto cada função do sistema gastou. O valor é uma <strong>estimativa</strong> pelo preço de tabela
          (entrada US$ {p.entrada}/1M tokens, saída US$ {p.saida}/1M, áudio US$ {p.audioPorMinuto}/min); a fatura real fica no painel
          da OpenAI. Modelo em uso: <strong>{AI_CONFIG.model}</strong>, raciocínio <strong>{AI_CONFIG.effort}</strong>. “Pensando” é a
          parte da saída que o modelo gasta raciocinando — é cobrada como saída.
        </p>
      </div>
      <Tabela titulo="Hoje" linhas={hoje.linhas} total={hoje.totalUsd} chamadas={hoje.chamadas} />
      <Tabela titulo="Últimos 7 dias" linhas={semana.linhas} total={semana.totalUsd} chamadas={semana.chamadas} />
      <Tabela titulo="Últimos 30 dias" linhas={mes.linhas} total={mes.totalUsd} chamadas={mes.chamadas} />
    </div>
  );
}
