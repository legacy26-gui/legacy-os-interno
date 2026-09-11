import "server-only";
import { prisma } from "@/lib/prisma";
import type { LeadChannel } from "@/generated/prisma/enums";

// Números do comercial. Tudo é contado por DATA DE MARCO, não pela coluna onde
// o cartão está hoje: a reunião que aconteceu em agosto continua sendo de
// agosto mesmo que a venda só feche em setembro.

export const CANAIS = ["META", "PRESENCIAL", "REDE", "MESA_LOJISTA", "ORGANICO"] as const;

export interface Metricas {
  impressoes: number;
  investimento: number;
  leads: number;
  cpl: number | null;
  qualificados: number;
  custoPorQualificado: number | null;
  taxaQualificacao: number | null;
  reunioesAgendadas: number;
  custoPorReuniaoAgendada: number | null;
  reunioesRealizadas: number;
  noShow: number;
  showRate: number | null;
  custoPorReuniaoRealizada: number | null;
  propostas: number;
  vendas: number;
  taxaReuniaoVenda: number | null;
  cac: number | null;
  novoMrr: number;
  receitaContratada: number;
  paybackMeses: number | null;
}

interface LeadDoPeriodo {
  channel: LeadChannel;
  createdAt: Date;
  qualifiedAt: Date | null;
  meetingSetAt: Date | null;
  meetingHeldAt: Date | null;
  noShowAt: Date | null;
  proposalAt: Date | null;
  wonAt: Date | null;
  monthlyValue: number;
  setupValue: number;
  contractMonths: number;
}

// Divisão que não explode nem mente: sem denominador, não existe número.
function divide(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

/**
 * `leads` traz todo mundo que teve algum marco no mês; `qtdLeads` é só quem
 * entrou no mês. São contas diferentes de propósito: um lead de julho que fez
 * reunião em agosto conta na reunião de agosto, não no lead de agosto.
 */
function calcular(
  leads: LeadDoPeriodo[],
  qtdLeads: number,
  impressoes: number,
  investimento: number
): Metricas {
  const conta = (campo: keyof LeadDoPeriodo) => leads.filter((l) => l[campo] !== null).length;

  // Custo só existe quando há verba lançada. Sem investimento, "R$ 0,00" seria
  // mentira — o certo é dizer que não dá pra saber.
  const custo = (quantidade: number) => (investimento > 0 ? divide(investimento, quantidade) : null);

  const qualificados = conta("qualifiedAt");
  const agendadas = conta("meetingSetAt");
  const realizadas = conta("meetingHeldAt");
  const noShow = conta("noShowAt");
  const propostas = conta("proposalAt");

  const ganhos = leads.filter((l) => l.wonAt !== null);
  const vendas = ganhos.length;
  const novoMrr = ganhos.reduce((s, l) => s + l.monthlyValue, 0);
  const receitaContratada = ganhos.reduce(
    (s, l) => s + l.monthlyValue * l.contractMonths + l.setupValue,
    0
  );

  const cac = custo(vendas);
  const mrrMedio = divide(novoMrr, vendas);

  return {
    impressoes,
    investimento,
    leads: qtdLeads,
    cpl: custo(qtdLeads),
    qualificados,
    custoPorQualificado: custo(qualificados),
    taxaQualificacao: divide(qualificados, qtdLeads),
    reunioesAgendadas: agendadas,
    custoPorReuniaoAgendada: custo(agendadas),
    reunioesRealizadas: realizadas,
    noShow,
    showRate: divide(realizadas, agendadas),
    custoPorReuniaoRealizada: custo(realizadas),
    propostas,
    vendas,
    taxaReuniaoVenda: divide(vendas, realizadas),
    cac,
    novoMrr,
    receitaContratada,
    // Quantos meses de mensalidade pagam o que se gastou pra conquistar o
    // cliente. Sem verba lançada não há o que pagar de volta.
    paybackMeses: cac !== null && mrrMedio !== null && mrrMedio > 0 ? cac / mrrMedio : null,
  };
}

export interface DashboardComercial {
  month: string;
  geral: Metricas;
  porCanal: { canal: LeadChannel; metricas: Metricas }[];
  canaisSemVerba: LeadChannel[];
}

export async function getComercialDashboard(month: string): Promise<DashboardComercial> {
  const inicio = new Date(`${month}-01T00:00:00.000Z`);
  const fim = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 1));
  const janela = { gte: inicio, lt: fim };

  const [linhas, canais] = await Promise.all([
    prisma.lead.findMany({
      where: {
        OR: [
          { createdAt: janela },
          { qualifiedAt: janela },
          { meetingSetAt: janela },
          { meetingHeldAt: janela },
          { noShowAt: janela },
          { proposalAt: janela },
          { wonAt: janela },
        ],
      },
      select: {
        channel: true,
        createdAt: true,
        qualifiedAt: true,
        meetingSetAt: true,
        meetingHeldAt: true,
        noShowAt: true,
        proposalAt: true,
        wonAt: true,
        monthlyValue: true,
        setupValue: true,
        contractMonths: true,
      },
    }),
    prisma.channelMonth.findMany({ where: { month } }),
  ]);

  // Cada marco só conta no mês em que aconteceu — por isso a data que cai fora
  // da janela vira nulo antes de qualquer conta.
  const noMes = (d: Date | null) => (d && d >= inicio && d < fim ? d : null);
  const leads: LeadDoPeriodo[] = linhas.map((l) => ({
    channel: l.channel,
    createdAt: l.createdAt,
    qualifiedAt: noMes(l.qualifiedAt),
    meetingSetAt: noMes(l.meetingSetAt),
    meetingHeldAt: noMes(l.meetingHeldAt),
    noShowAt: noMes(l.noShowAt),
    proposalAt: noMes(l.proposalAt),
    wonAt: noMes(l.wonAt),
    monthlyValue: Number(l.monthlyValue),
    setupValue: Number(l.setupValue),
    contractMonths: l.contractMonths,
  }));

  // "Leads do mês" são os que entraram no mês; os outros vieram só por causa de
  // um marco e não podem inflar a contagem de leads novos.
  const novos = leads.filter((l) => l.createdAt >= inicio && l.createdAt < fim);

  const verba = new Map(canais.map((c) => [c.channel, { imp: c.impressions, inv: Number(c.investment) }]));
  const totalImp = canais.reduce((s, c) => s + c.impressions, 0);
  const totalInv = canais.reduce((s, c) => s + Number(c.investment), 0);

  const geral = calcular(leads, novos.length, totalImp, totalInv);

  const porCanal = CANAIS.map((canal) => {
    const v = verba.get(canal) ?? { imp: 0, inv: 0 };
    return {
      canal,
      metricas: calcular(
        leads.filter((l) => l.channel === canal),
        novos.filter((l) => l.channel === canal).length,
        v.imp,
        v.inv
      ),
    };
  });

  return {
    month,
    geral,
    porCanal,
    // Canal que gerou lead mas ninguém lançou verba: os custos dele saem zerados
    // e é melhor avisar do que mostrar CPL de R$ 0,00 como se fosse verdade.
    canaisSemVerba: porCanal
      .filter((c) => c.metricas.leads > 0 && (verba.get(c.canal)?.inv ?? 0) === 0)
      .map((c) => c.canal),
  };
}

export async function getVerbaDoMes(month: string) {
  const linhas = await prisma.channelMonth.findMany({ where: { month } });
  return CANAIS.map((canal) => {
    const l = linhas.find((x) => x.channel === canal);
    return { canal, impressions: l?.impressions ?? 0, investment: Number(l?.investment ?? 0) };
  });
}
