// Pontuação de oportunidade: quanto MAIOR a pontuação, mais essa conta precisa
// de atenção agora. É o contrário do score de saúde — aqui a leitura é "onde
// tem oportunidade de agir hoje".
//
// Cada sinal vale pontos; a soma vira a pontuação (limitada a 100).

export type OpportunityLevel = "alta" | "media" | "baixa";

export interface Opportunity {
  key: string;
  label: string;
  detail: string;
  level: OpportunityLevel;
  points: number;
}

export interface OpportunityInput {
  diasSemVenda: number | null; // null = nunca registrou venda
  vendasNoMes: number;
  investidoNoMes: number;
  faturadoNoMes: number;
  custoPorVendaMes: number | null;
  custoPorVendaMesAnterior: number | null;
  dailyOverdue: boolean;
  semanasPreenchidas: number;
  semanasDoMes: number;
}

const LEVEL_ORDER: Record<OpportunityLevel, number> = { alta: 0, media: 1, baixa: 2 };

export function getOpportunities(input: OpportunityInput): {
  score: number;
  level: OpportunityLevel;
  opportunities: Opportunity[];
} {
  const list: Opportunity[] = [];

  // Loja sem vender: o sinal mais forte pra agir.
  if (input.diasSemVenda === null) {
    list.push({
      key: "sem-venda-nunca",
      label: "Nenhuma venda registrada",
      detail: "Esta conta ainda não tem venda lançada — sem isso não dá pra medir retorno.",
      level: "media",
      points: 20,
    });
  } else if (input.diasSemVenda >= 14) {
    list.push({
      key: "sem-venda-14",
      label: `${input.diasSemVenda} dias sem vender`,
      detail: "Passou de duas semanas sem venda. Vale revisar oferta, criativo e público.",
      level: "alta",
      points: 35,
    });
  } else if (input.diasSemVenda >= 7) {
    list.push({
      key: "sem-venda-7",
      label: `${input.diasSemVenda} dias sem vender`,
      detail: "Mais de uma semana sem venda. Olhar CPL e qualidade dos leads.",
      level: "media",
      points: 20,
    });
  }

  // Gastou e não vendeu nada no mês: dinheiro saindo sem retorno.
  if (input.investidoNoMes > 0 && input.vendasNoMes === 0) {
    list.push({
      key: "investiu-sem-vender",
      label: "Investiu e não vendeu no mês",
      detail: `Já foram investidos R$ ${input.investidoNoMes.toLocaleString("pt-BR")} neste mês sem venda registrada.`,
      level: "alta",
      points: 30,
    });
  }

  // Custo por venda subindo contra o próprio histórico do cliente.
  if (
    input.custoPorVendaMes !== null &&
    input.custoPorVendaMesAnterior !== null &&
    input.custoPorVendaMesAnterior > 0 &&
    input.custoPorVendaMes > input.custoPorVendaMesAnterior * 1.3
  ) {
    const alta = ((input.custoPorVendaMes / input.custoPorVendaMesAnterior - 1) * 100).toFixed(0);
    list.push({
      key: "cpv-subindo",
      label: `Custo por venda subiu ${alta}%`,
      detail: "Está saindo mais caro vender que no mês passado.",
      level: "media",
      points: 20,
    });
  }

  if (input.dailyOverdue) {
    list.push({
      key: "checklist-atrasado",
      label: "Checklist diário atrasado",
      detail: "A conta não foi revisada hoje.",
      level: "media",
      points: 15,
    });
  }

  const semanasFaltando = input.semanasDoMes - input.semanasPreenchidas;
  if (semanasFaltando > 0 && input.semanasPreenchidas < input.semanasDoMes) {
    list.push({
      key: "semanal-incompleta",
      label: `${semanasFaltando} semana(s) sem revisão`,
      detail: `Preenchidas ${input.semanasPreenchidas} de ${input.semanasDoMes} semanas deste mês.`,
      level: "baixa",
      points: 10,
    });
  }

  const score = Math.min(100, list.reduce((s, o) => s + o.points, 0));
  const level: OpportunityLevel = score >= 50 ? "alta" : score >= 25 ? "media" : "baixa";

  list.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.points - a.points);

  return { score, level, opportunities: list };
}

export const OPPORTUNITY_COLORS: Record<OpportunityLevel, string> = {
  alta: "bg-red-500/15 text-red-500",
  media: "bg-amber-500/15 text-amber-500",
  baixa: "bg-zinc-500/15 text-zinc-400",
};

export const OPPORTUNITY_LABELS: Record<OpportunityLevel, string> = {
  alta: "Oportunidade alta",
  media: "Oportunidade média",
  baixa: "Tudo em ordem",
};
