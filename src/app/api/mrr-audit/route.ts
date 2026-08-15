import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MRR_TAG = "[MRR]";

// Rotina de leitura: audita se o MRR (soma do monthlyValue dos clientes
// Ativos) bate com o total das receitas [MRR] já lançadas pro mês atual, e
// aponta a causa de qualquer diferença (cliente ativo sem lançamento ainda,
// lançamento de cliente que não é mais ativo, ou preço desatualizado).
export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  if (request.nextUrl.searchParams.get("key") !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [activeClients, excludedFromBilling, mrrRevenues] = await Promise.all([
    prisma.client.findMany({
      where: { status: "ATIVO", billingActive: true },
      select: { id: true, companyName: true, monthlyValue: true },
      orderBy: { companyName: "asc" },
    }),
    prisma.client.findMany({
      where: { status: "ATIVO", billingActive: false },
      select: { companyName: true, monthlyValue: true },
      orderBy: { companyName: "asc" },
    }),
    prisma.revenue.findMany({
      where: { dueDate: { gte: monthStart, lt: monthEnd }, description: { startsWith: MRR_TAG } },
      select: { id: true, clientId: true, value: true, status: true, client: { select: { companyName: true, status: true } } },
    }),
  ]);

  const mrr = activeClients.reduce((s, c) => s + Number(c.monthlyValue), 0);
  const mrrRevenueTotal = mrrRevenues.reduce((s, r) => s + Number(r.value), 0);

  const revenueByClientId = new Map(mrrRevenues.map((r) => [r.clientId, r]));
  const activeClientIds = new Set(activeClients.map((c) => c.id));

  const ativoSemLancamento = activeClients
    .filter((c) => Number(c.monthlyValue) > 0 && !revenueByClientId.has(c.id))
    .map((c) => ({ companyName: c.companyName, monthlyValue: c.monthlyValue }));

  const lancamentoDeClienteNaoAtivo = mrrRevenues
    .filter((r) => !activeClientIds.has(r.clientId))
    .map((r) => ({ companyName: r.client.companyName, status: r.client.status, value: r.value }));

  const precoDesatualizado = activeClients
    .filter((c) => {
      const r = revenueByClientId.get(c.id);
      return r && Number(r.value) !== Number(c.monthlyValue);
    })
    .map((c) => ({
      companyName: c.companyName,
      precoAtualDoCliente: c.monthlyValue,
      valorNoLancamentoDoMes: revenueByClientId.get(c.id)!.value,
    }));

  return NextResponse.json({
    month: monthStart.toISOString().slice(0, 7),
    mrr,
    mrrRevenueTotal,
    bate: mrr === mrrRevenueTotal,
    diferenca: mrr - mrrRevenueTotal,
    clientesAtivosComMensalidade: activeClients.length,
    lancamentosMrrNoMes: mrrRevenues.length,
    ativoSemLancamento,
    lancamentoDeClienteNaoAtivo,
    precoDesatualizado,
    excluidosDoFluxoDePagamento: excludedFromBilling,
    clientesAtivos: activeClients.map((c) => ({ companyName: c.companyName, monthlyValue: c.monthlyValue })),
  });
}
