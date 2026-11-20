import "server-only";

import { prisma } from "@/lib/prisma";
import { CARTEIRA_NO_META } from "@/lib/carteira";
import { janelaDeDias } from "./insights";
import {
  avaliarLoja,
  comoDias,
  DIAS_ATENCAO,
  DIAS_DO_RITMO,
  SALDO_RESIDUAL_CENTS,
} from "./estado-da-loja";
import { saldoEmReais } from "./saldo";

// Quais lojas estão com a verba acabando — a versão ENXUTA, pro alerta.
//
// ── Por que não usa montarPainelDoDia ────────────────────────────────────
//
// O painel do Meu Dia já sabe responder isto, e o comentário dele mesmo diz
// que a apuração "vai servir o robô dos alertas". Mas o painel faz quatro
// consultas pesadas, e três delas (artes cansadas, projeção do mês) não têm
// nada a ver com saldo.
//
// O problema é onde o alerta é calculado: o sininho do cabeçalho recalcula
// TODOS os alertas a cada página aberta do sistema. Pendurar o painel inteiro
// ali faria cada clique, de cada pessoa, rodar quatro agregações sobre o
// histórico de insights só pra saber se alguma conta zerou.
//
// Então esta função faz só o que o saldo precisa — uma consulta de lojas e uma
// agregação de gasto — e passa pela MESMA régua (`avaliarLoja`) que o Meu Dia.
// É isso que garante a regra que o alerta de venda parada já segue: a tela e o
// aviso não podem discordar. Se amanhã o corte de "acabando" mudar, muda nos
// dois, porque o número mora num lugar só.

export type NivelDeVerba = 1 | 2 | 3;

export interface LojaComPoucaVerba {
  clientId: string;
  nome: string;
  managerId: string | null;
  /** 3 = conta zerada ou para hoje · 2 = acabando · 1 = hora de cobrar o Pix. */
  nivel: NivelDeVerba;
  saldoCents: number | null;
  /** Já escrito: "2 dias", "menos de 1 dia". */
  dura: string | null;
  /** A conta está zerada de fato (não só "dura pouco"). */
  zerada: boolean;
}

/**
 * Lojas pré-pagas que não chegam no próximo abastecimento.
 *
 * Fica de fora, de propósito:
 *
 *  - Conta no cartão: não tem saldo a acompanhar.
 *  - Loja com link de Pix já mandado e no prazo (o tom "aguardando" do Meu
 *    Dia): alguém já tratou, e avisar de novo seria cobrar quem já agiu. Se o
 *    prazo vencer e o dinheiro não vier, ela volta sozinha.
 *  - Erro de leitura: "o sistema não sabe" é problema nosso e não da loja, e
 *    não vira aviso de verba. (Só entra quando os dias de saldo, com o último
 *    número lido, já estão abaixo do corte.)
 */
export async function lojasComPoucaVerba(
  agora: Date = new Date(),
): Promise<LojaComPoucaVerba[]> {
  const clientes = await prisma.client.findMany({
    where: {
      ...CARTEIRA_NO_META,
      // Só quem tem conta pré-paga ativa: é a única que tem saldo.
      metaAdAccounts: { some: { active: true, isPrepay: true } },
    },
    select: {
      id: true,
      companyName: true,
      managerId: true,
      gastoMensalPrevistoCents: true,
      pedidosDeVerba: {
        orderBy: { enviadoEm: "desc" },
        take: 1,
        select: { enviadoEm: true, entrouEm: true },
      },
      metaAdAccounts: {
        where: { active: true },
        select: {
          id: true,
          isPrepay: true,
          lastSyncError: true,
          balanceSnapshots: {
            orderBy: { capturedAt: "desc" },
            take: 1,
            select: { availableCents: true },
          },
        },
      },
    },
    orderBy: { companyName: "asc" },
    // Trava de sanidade, igual às outras do arquivo de alertas: se isto
    // devolver a casa inteira, é defeito de dado e não cem avisos.
    take: 200,
  });
  if (clientes.length === 0) return [];

  const contas = clientes.flatMap((c) => c.metaAdAccounts.map((a) => a.id));
  const ritmo = janelaDeDias(DIAS_DO_RITMO, agora);

  // O ritmo de gasto por conta e por dia: é a régua dos dias de saldo, a mesma
  // do Meu Dia.
  const porDia = await prisma.metaInsightDaily.groupBy({
    by: ["adAccountId", "date"],
    where: { adAccountId: { in: contas }, date: { gte: ritmo.de, lte: ritmo.ate } },
    _sum: { spendCents: true },
  });
  const ritmoDaConta = new Map<string, { gasto: number; dias: Set<number> }>();
  for (const g of porDia) {
    const atual = ritmoDaConta.get(g.adAccountId) ?? { gasto: 0, dias: new Set<number>() };
    atual.gasto += g._sum.spendCents ?? 0;
    atual.dias.add(g.date.getTime());
    ritmoDaConta.set(g.adAccountId, atual);
  }

  const achadas: LojaComPoucaVerba[] = [];

  for (const c of clientes) {
    const prePagas = c.metaAdAccounts.filter((a) => a.isPrepay);
    const lidas = prePagas.filter((a) => a.balanceSnapshots[0]);
    // Saldo só vale quando TODAS as pré-pagas foram lidas: somar parte delas
    // faria uma loja com duas contas parecer mais pobre do que é.
    const saldo =
      prePagas.length > 0 && lidas.length === prePagas.length
        ? lidas.reduce((s, a) => s + a.balanceSnapshots[0].availableCents, 0)
        : null;

    let gastoRecenteCents = 0;
    const dias = new Set<number>();
    for (const a of c.metaAdAccounts) {
      const r = ritmoDaConta.get(a.id);
      if (!r) continue;
      gastoRecenteCents += r.gasto;
      for (const d of r.dias) dias.add(d);
    }

    const v = avaliarLoja({
      temConta: c.metaAdAccounts.length > 0,
      saldoCents: saldo,
      temPrePaga: prePagas.length > 0,
      comErro: c.metaAdAccounts.some((a) => a.lastSyncError),
      gastoRecenteCents,
      diasComDado: dias.size,
      gastoMensalPrevistoCents: c.gastoMensalPrevistoCents,
      // Igual ao Meu Dia: o aviso de "gastou sem lead" mora na tela do Meta
      // Ads, com o período escolhido lá. Aqui a pergunta é só o saldo.
      gastoDoPeriodoCents: 0,
      leads: 0,
      pedido: c.pedidosDeVerba[0] ?? null,
      agora,
    });

    let nivel: NivelDeVerba | null = null;
    if (v.tom === "sem-saldo") nivel = 3;
    else if (v.tom === "acabando") nivel = 2;
    // "atencao" também nasce de erro de leitura e de gasto sem lead; só conta
    // como verba quando os DIAS é que a puseram ali.
    else if (v.tom === "atencao" && v.diasExatos !== null && v.diasExatos < DIAS_ATENCAO) nivel = 1;
    // "aguardando" (Pix já cobrado, no prazo), "bom" e "neutro": sem aviso.
    if (!nivel) continue;

    achadas.push({
      clientId: c.id,
      nome: c.companyName,
      managerId: c.managerId,
      nivel,
      saldoCents: saldo,
      dura: comoDias(v.diasDeSaldo),
      zerada: saldo !== null && saldo < SALDO_RESIDUAL_CENTS,
    });
  }

  return achadas;
}

/** O texto de uma loja no aviso: "Saldo R$ 36,12 — dura menos de 1 dia". */
export function descreverVerba(l: LojaComPoucaVerba): string {
  if (l.zerada) return "Conta zerada — a campanha para hoje";
  const saldo = l.saldoCents === null ? null : saldoEmReais(l.saldoCents);
  const dura = l.dura ? `dura ${l.dura}` : null;
  return [saldo ? `Saldo ${saldo}` : null, dura].filter(Boolean).join(" — ") || "Verba acabando";
}
