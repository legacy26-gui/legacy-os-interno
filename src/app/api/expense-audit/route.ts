import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Leitura: mostra as despesas fixas cadastradas e, no mês atual, o que já está
// confirmado e o que aguarda confirmação. Serve pra conferir o estado depois
// de passar as saídas fixas a exigirem confirmação.
// Com ?resetFixas=1 devolve as saídas fixas do mês atual pra "aguardando" —
// útil porque as geradas antes dessa regra nasceram já confirmadas.
export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  const params = request.nextUrl.searchParams;
  if (params.get("key") !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [fixas, doMes] = await Promise.all([
    prisma.fixedExpense.findMany({
      select: { id: true, description: true, category: true, value: true, dueDay: true, active: true },
      orderBy: { description: "asc" },
    }),
    prisma.expense.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      select: { id: true, description: true, value: true, date: true, paid: true, fixedExpenseId: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const resumo = (lista: typeof doMes) => ({
    qtd: lista.length,
    total: lista.reduce((s, e) => s + Number(e.value), 0),
    itens: lista.map((e) => ({ description: e.description, value: e.value, date: e.date, fixa: !!e.fixedExpenseId })),
  });

  const confirmadas = doMes.filter((e) => e.paid);
  const aguardando = doMes.filter((e) => !e.paid);
  const fixasConfirmadas = doMes.filter((e) => e.paid && e.fixedExpenseId);

  if (params.get("resetFixas") === "1") {
    const result = await prisma.expense.updateMany({
      where: { date: { gte: monthStart, lt: monthEnd }, fixedExpenseId: { not: null }, paid: true },
      data: { paid: false, paidDate: null },
    });
    return NextResponse.json({
      message: "Saídas fixas do mês voltaram para 'aguardando confirmação'.",
      atualizadas: result.count,
    });
  }

  return NextResponse.json({
    mes: monthStart.toISOString().slice(0, 7),
    despesasFixasCadastradas: fixas,
    confirmadas: resumo(confirmadas),
    aguardandoConfirmacao: resumo(aguardando),
    // Se vier algo aqui, são fixas geradas antes da nova regra: chame com
    // ?resetFixas=1 pra elas voltarem a exigir confirmação.
    fixasJaConfirmadasQuePodemVoltar: resumo(fixasConfirmadas),
  });
}
