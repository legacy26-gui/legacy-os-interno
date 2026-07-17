import { prisma } from "@/lib/prisma";

// Tags sugeridas por contexto — quando o gestor está numa dessas telas, a
// gente busca playbooks marcados com alguma dessas tags como recomendação.
export const DAILY_REVIEW_TAGS = [
  "diario",
  "cpl",
  "verba",
  "orcamento",
  "rejeitada",
  "frequencia",
  "comentario",
  "leads",
  "atendimento",
  "agendamento",
];

export const WEEKLY_REVIEW_TAGS = ["semanal", "criativo", "anuncio", "publico", "oferta", "relatorio"];

// Tarefas padrão geradas em Operações → tags equivalentes pra sugestão.
export const TASK_TAGS: Record<string, string[]> = {
  "reunião semanal": ["reuniao", "semanal"],
  "enviar verba": ["verba"],
  "conferir verba": ["verba"],
  "reservar criativos": ["criativo"],
  "enviar relatório mensal": ["relatorio", "semanal"],
};

export async function getSuggestedPlaybooks(keywords: string[], limit = 3) {
  if (keywords.length === 0) return [];
  return prisma.playbook.findMany({
    where: { tags: { hasSome: keywords } },
    select: { id: true, title: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}
