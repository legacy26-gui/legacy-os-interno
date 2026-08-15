import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rotina única: zera o "a receber" de meses anteriores. Nada mais está
// atrasado de verdade — o que sobrou de julho pra trás é cobrança que nunca
// foi baixada no sistema, e não dívida real. Só mexe em PENDENTE/ATRASADO com
// vencimento antes do mês atual; o que já foi pago continua intacto no
// histórico (é o que alimenta o faturado e o DRE dos meses passados).
// Preview por padrão; ?confirm=1 aplica.
export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  if (request.nextUrl.searchParams.get("key") !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }
  const confirm = request.nextUrl.searchParams.get("confirm") === "1";

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const stale = await prisma.revenue.findMany({
    where: { status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { lt: monthStart } },
    select: {
      id: true,
      value: true,
      dueDate: true,
      description: true,
      client: { select: { companyName: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  const totalValue = stale.reduce((s, r) => s + Number(r.value), 0);
  const byMonth = new Map<string, { count: number; value: number }>();
  for (const r of stale) {
    const key = r.dueDate.toISOString().slice(0, 7);
    const entry = byMonth.get(key) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += Number(r.value);
    byMonth.set(key, entry);
  }

  if (!confirm) {
    return NextResponse.json({
      preview: true,
      message: "Prévia — chame com ?confirm=1 pra aplicar.",
      mesAtualPreservado: monthStart.toISOString().slice(0, 7),
      count: stale.length,
      totalValue,
      porMes: [...byMonth.entries()].map(([month, v]) => ({ month, ...v })),
      items: stale.map((r) => ({
        client: r.client.companyName,
        description: r.description,
        value: r.value,
        dueDate: r.dueDate,
      })),
    });
  }

  const result = await prisma.revenue.deleteMany({
    where: { status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { lt: monthStart } },
  });

  return NextResponse.json({
    message: "A receber de meses anteriores zerado.",
    deleted: result.count,
    totalValue,
    porMes: [...byMonth.entries()].map(([month, v]) => ({ month, ...v })),
  });
}
