import Link from "next/link";
import { Gauge, ShieldCheck, AlertTriangle, Flame, Trophy, CalendarX, CalendarClock, Zap, ImageOff } from "lucide-react";
import { requireModuleAccess } from "@/lib/dal";
import { getAccountsHealth, SCORE_COLORS, BUCKET_LABELS, type AccountHealth } from "@/lib/account-health";
import { formatDate } from "@/lib/labels";

function ScoreBadge({ score, bucket }: { score: number; bucket: AccountHealth["metrics"]["bucket"] }) {
  return (
    <span className={`inline-flex items-center justify-center min-w-[3rem] text-xs font-semibold px-2.5 py-1 rounded-full ${SCORE_COLORS[bucket]}`}>
      {score}
    </span>
  );
}

export default async function GestaoContasPage() {
  await requireModuleAccess("gestao-contas");
  const accounts = await getAccountsHealth();

  const saudaveis = accounts.filter((a) => a.metrics.bucket === "saudavel");
  const alerta = accounts.filter((a) => a.metrics.bucket === "alerta");
  const criticos = accounts.filter((a) => a.metrics.bucket === "critico");

  const semDiaria = accounts.filter((a) => a.metrics.dailyOverdue);
  const semSemanal = accounts.filter((a) => a.metrics.weeklyOverdue);
  const semAlteracao = accounts.filter((a) => a.metrics.changeOverdue);
  const semCriativo = accounts.filter((a) => a.metrics.creativeOverdue);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Gauge size={20} className="text-accent" /> Gestão de Contas
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">Saúde das contas de tráfego e acompanhamento dos gestores</p>
        </div>
        <Link
          href="/gestao-contas/ranking"
          className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-muted self-start"
        >
          <Trophy size={16} /> Ranking de gestores
        </Link>
      </div>

      {/* Cards de saúde */}
      <div className="grid sm:grid-cols-3 gap-4">
        <HealthCard icon={ShieldCheck} label="Clientes saudáveis" value={saudaveis.length} tone="emerald" />
        <HealthCard icon={AlertTriangle} label="Clientes em alerta" value={alerta.length} tone="amber" />
        <HealthCard icon={Flame} label="Clientes críticos" value={criticos.length} tone="red" />
      </div>

      {/* Listas automáticas */}
      <div className="grid md:grid-cols-2 gap-4">
        <CriticalList icon={CalendarX} title="Sem revisão diária" accounts={semDiaria} />
        <CriticalList icon={CalendarClock} title="Sem revisão semanal" accounts={semSemanal} />
        <CriticalList icon={Zap} title="Sem alteração há mais de 7 dias" accounts={semAlteracao} metric="change" />
        <CriticalList icon={ImageOff} title="Sem criativo novo há mais de 15 dias" accounts={semCriativo} metric="creative" />
      </div>

      {/* Tabela geral */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-sm font-medium">Todas as contas ({accounts.length})</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Conta</th>
                <th className="px-5 py-3 font-medium hidden sm:table-cell">Gestor</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Últ. diária</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Últ. semanal</th>
                <th className="px-5 py-3 font-medium text-right hidden lg:table-cell">Dias s/ alteração</th>
                <th className="px-5 py-3 font-medium text-right hidden lg:table-cell">Dias s/ criativo</th>
                <th className="px-5 py-3 font-medium text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounts.map((a) => (
                <tr key={a.id} className="hover:bg-surface-muted transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/gestao-contas/${a.id}`} className="font-medium hover:text-accent">
                      {a.companyName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-foreground-muted hidden sm:table-cell">{a.managerName ?? "—"}</td>
                  <td className={`px-5 py-3 hidden md:table-cell ${a.metrics.dailyOverdue ? "text-red-500" : "text-foreground-muted"}`}>
                    {formatDate(a.metrics.lastDaily)}
                  </td>
                  <td className={`px-5 py-3 hidden md:table-cell ${a.metrics.weeklyOverdue ? "text-red-500" : "text-foreground-muted"}`}>
                    {formatDate(a.metrics.lastWeekly)}
                  </td>
                  <td className={`px-5 py-3 text-right hidden lg:table-cell ${a.metrics.changeOverdue ? "text-red-500" : "text-foreground-muted"}`}>
                    {a.metrics.daysSinceChange ?? "—"}
                  </td>
                  <td className={`px-5 py-3 text-right hidden lg:table-cell ${a.metrics.creativeOverdue ? "text-red-500" : "text-foreground-muted"}`}>
                    {a.metrics.daysSinceCreative ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <ScoreBadge score={a.metrics.score} bucket={a.metrics.bucket} />
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-foreground-muted">
                    Nenhuma conta cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  emerald: "text-emerald-500",
  amber: "text-amber-500",
  red: "text-red-500",
};

function HealthCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: number;
  tone: keyof typeof TONE;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className={`flex items-center gap-2 mb-2 ${TONE[tone]}`}>
        <Icon size={16} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-2xl font-semibold ${TONE[tone]}`}>{value}</p>
    </div>
  );
}

function CriticalList({
  icon: Icon,
  title,
  accounts,
  metric,
}: {
  icon: typeof CalendarX;
  title: string;
  accounts: AccountHealth[];
  metric?: "change" | "creative";
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="flex items-center gap-2 text-sm font-medium mb-3">
        <span className="text-red-500">🔴</span>
        <Icon size={15} className="text-foreground-muted" />
        {title} <span className="text-foreground-muted">({accounts.length})</span>
      </p>
      {accounts.length === 0 ? (
        <p className="text-xs text-foreground-muted">Nenhuma conta nesta condição. 🎉</p>
      ) : (
        <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
          {accounts.map((a) => (
            <Link
              key={a.id}
              href={`/gestao-contas/${a.id}`}
              className="flex items-center justify-between text-sm py-1 hover:text-accent"
            >
              <span>{a.companyName}</span>
              <span className="text-xs text-foreground-muted">
                {metric === "change" && a.metrics.daysSinceChange !== null ? `${a.metrics.daysSinceChange}d` : null}
                {metric === "creative" && a.metrics.daysSinceCreative !== null ? `${a.metrics.daysSinceCreative}d` : null}
                {metric === "change" && a.metrics.daysSinceChange === null ? "nunca" : null}
                {metric === "creative" && a.metrics.daysSinceCreative === null ? "nunca" : null}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
