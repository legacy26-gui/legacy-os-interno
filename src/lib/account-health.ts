import "server-only";
import { prisma } from "@/lib/prisma";

// Regras de score (0-100). Cada penalidade é subtraída da base 100.
export const SCORE_RULES = {
  dailyLate: 5, // revisão diária atrasada
  weeklyLate: 10, // revisão semanal atrasada
  noCreative: 15, // > 15 dias sem criativo novo
  noChange: 20, // > 7 dias sem alteração
} as const;

// Limites de tempo (em dias) que definem "atrasado".
export const THRESHOLDS = {
  daily: 1, // revisão diária vale por 1 dia
  weekly: 7, // revisão semanal vale por 7 dias
  creative: 15, // criativo novo esperado a cada 15 dias
  change: 7, // alguma otimização esperada a cada 7 dias
} as const;

const CREATIVE_CHANGE_TYPES = ["CRIATIVO_NOVO", "CRIATIVO_ALTERADO"] as const;

export type HealthBucket = "saudavel" | "alerta" | "critico";

export interface AccountMetrics {
  lastDaily: Date | null;
  lastWeekly: Date | null;
  lastChange: Date | null;
  lastCreative: Date | null;
  daysSinceChange: number | null;
  daysSinceCreative: number | null;
  dailyOverdue: boolean;
  weeklyOverdue: boolean;
  changeOverdue: boolean;
  creativeOverdue: boolean;
  score: number;
  bucket: HealthBucket;
}

function daysBetween(from: Date | null, now: Date): number | null {
  if (!from) return null;
  return Math.floor((now.getTime() - from.getTime()) / 86_400_000);
}

export function bucketForScore(score: number): HealthBucket {
  if (score >= 90) return "saudavel";
  if (score >= 70) return "alerta";
  return "critico";
}

export function computeMetrics(
  input: { lastDaily: Date | null; lastWeekly: Date | null; lastChange: Date | null; lastCreative: Date | null },
  now: Date = new Date()
): AccountMetrics {
  const daysSinceDaily = daysBetween(input.lastDaily, now);
  const daysSinceWeekly = daysBetween(input.lastWeekly, now);
  const daysSinceChange = daysBetween(input.lastChange, now);
  const daysSinceCreative = daysBetween(input.lastCreative, now);

  const dailyOverdue = daysSinceDaily === null || daysSinceDaily >= THRESHOLDS.daily;
  const weeklyOverdue = daysSinceWeekly === null || daysSinceWeekly >= THRESHOLDS.weekly;
  const creativeOverdue = daysSinceCreative === null || daysSinceCreative > THRESHOLDS.creative;
  const changeOverdue = daysSinceChange === null || daysSinceChange > THRESHOLDS.change;

  let score = 100;
  if (dailyOverdue) score -= SCORE_RULES.dailyLate;
  if (weeklyOverdue) score -= SCORE_RULES.weeklyLate;
  if (creativeOverdue) score -= SCORE_RULES.noCreative;
  if (changeOverdue) score -= SCORE_RULES.noChange;
  score = Math.max(0, Math.min(100, score));

  return {
    lastDaily: input.lastDaily,
    lastWeekly: input.lastWeekly,
    lastChange: input.lastChange,
    lastCreative: input.lastCreative,
    daysSinceChange,
    daysSinceCreative,
    dailyOverdue,
    weeklyOverdue,
    changeOverdue,
    creativeOverdue,
    score,
    bucket: bucketForScore(score),
  };
}

export const SCORE_COLORS: Record<HealthBucket, string> = {
  saudavel: "bg-emerald-500/15 text-emerald-500",
  alerta: "bg-amber-500/15 text-amber-500",
  critico: "bg-red-500/15 text-red-500",
};

export const BUCKET_LABELS: Record<HealthBucket, string> = {
  saudavel: "Saudável",
  alerta: "Em alerta",
  critico: "Crítico",
};

export interface AccountHealth {
  id: string;
  companyName: string;
  managerId: string | null;
  managerName: string | null;
  metrics: AccountMetrics;
}

// Carrega todas as contas (clientes não cancelados) com as datas agregadas
// e calcula os indicadores de saúde de cada uma.
export async function getAccountsHealth(now: Date = new Date()): Promise<AccountHealth[]> {
  const [clients, lastDaily, lastWeekly, lastChange, lastCreative] = await Promise.all([
    prisma.client.findMany({
      where: { status: { not: "CANCELADO" } },
      select: { id: true, companyName: true, managerId: true, manager: { select: { name: true } } },
      orderBy: { companyName: "asc" },
    }),
    prisma.dailyReview.groupBy({ by: ["clientId"], _max: { createdAt: true } }),
    prisma.weeklyReview.groupBy({ by: ["clientId"], _max: { createdAt: true } }),
    prisma.campaignChange.groupBy({ by: ["clientId"], _max: { createdAt: true } }),
    prisma.campaignChange.groupBy({
      by: ["clientId"],
      where: { type: { in: [...CREATIVE_CHANGE_TYPES] } },
      _max: { createdAt: true },
    }),
  ]);

  const dailyMap = new Map(lastDaily.map((r) => [r.clientId, r._max.createdAt]));
  const weeklyMap = new Map(lastWeekly.map((r) => [r.clientId, r._max.createdAt]));
  const changeMap = new Map(lastChange.map((r) => [r.clientId, r._max.createdAt]));
  const creativeMap = new Map(lastCreative.map((r) => [r.clientId, r._max.createdAt]));

  return clients.map((c) => ({
    id: c.id,
    companyName: c.companyName,
    managerId: c.managerId,
    managerName: c.manager?.name ?? null,
    metrics: computeMetrics(
      {
        lastDaily: dailyMap.get(c.id) ?? null,
        lastWeekly: weeklyMap.get(c.id) ?? null,
        lastChange: changeMap.get(c.id) ?? null,
        lastCreative: creativeMap.get(c.id) ?? null,
      },
      now
    ),
  }));
}
