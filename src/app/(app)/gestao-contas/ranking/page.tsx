import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { getAccountsHealth, SCORE_COLORS, bucketForScore } from "@/lib/account-health";

export default async function RankingGestoresPage() {
  await requireModuleAccess("gestao-contas");

  const [accounts, operators] = await Promise.all([
    getAccountsHealth(),
    prisma.user.findMany({
      where: { active: true, role: { not: "ADMIN" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows = operators.map((op) => {
    const carteira = accounts.filter((a) => a.managerId === op.id);
    const clientes = carteira.length;
    // "Concluídas": revisões diárias em dia. "Pendentes": revisões diárias atrasadas.
    const concluidas = carteira.filter((a) => !a.metrics.dailyOverdue).length;
    const pendentes = carteira.filter((a) => a.metrics.dailyOverdue).length;
    const scoreMedio = clientes > 0 ? Math.round(carteira.reduce((s, a) => s + a.metrics.score, 0) / clientes) : 0;
    return { ...op, clientes, concluidas, pendentes, scoreMedio };
  });

  // Ordena por score médio (desc), operadores sem clientes por último.
  rows.sort((a, b) => (b.clientes > 0 ? b.scoreMedio : -1) - (a.clientes > 0 ? a.scoreMedio : -1));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/gestao-contas" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground mb-2">
          <ArrowLeft size={15} /> Voltar para Gestão de Contas
        </Link>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Trophy size={20} className="text-accent" /> Ranking de gestores
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">Performance de acompanhamento por gestor</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">#</th>
                <th className="px-5 py-3 font-medium">Gestor</th>
                <th className="px-5 py-3 font-medium text-right">Clientes</th>
                <th className="px-5 py-3 font-medium text-right">Revisões concluídas</th>
                <th className="px-5 py-3 font-medium text-right">Revisões pendentes</th>
                <th className="px-5 py-3 font-medium text-right">Score médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => {
                const bucket = bucketForScore(r.scoreMedio);
                return (
                  <tr key={r.id} className="hover:bg-surface-muted transition-colors">
                    <td className="px-5 py-3 text-foreground-muted">{i + 1}</td>
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="px-5 py-3 text-right">{r.clientes}</td>
                    <td className="px-5 py-3 text-right text-emerald-500">{r.concluidas}</td>
                    <td className={`px-5 py-3 text-right ${r.pendentes > 0 ? "text-red-500" : "text-foreground-muted"}`}>
                      {r.pendentes}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {r.clientes > 0 ? (
                        <span className={`inline-flex items-center justify-center min-w-[3rem] text-xs font-semibold px-2.5 py-1 rounded-full ${SCORE_COLORS[bucket]}`}>
                          {r.scoreMedio}
                        </span>
                      ) : (
                        <span className="text-foreground-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-foreground-muted">
                    Nenhum gestor cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-foreground-muted">
        &quot;Revisões concluídas&quot; = clientes com revisão diária em dia; &quot;pendentes&quot; = clientes com revisão diária atrasada.
      </p>
    </div>
  );
}
