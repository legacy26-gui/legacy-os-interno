import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MRR_TAG = "[MRR]";

// Rotina única: sincroniza a cobrança [MRR] deste mês (ainda não paga) com o
// monthlyValue atual do cliente, pros casos em que o preço mudou depois que
// a cobrança já tinha sido lançada — era isso que fazia o MRR do topo não
// bater com o total do quadro/lista de receitas. Preview por padrão;
// ?confirm=1 aplica.
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
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const revenues = await prisma.revenue.findMany({
    where: {
      status: { in: ["PENDENTE", "ATRASADO"] },
      dueDate: { gte: monthStart, lt: monthEnd },
      description: { startsWith: MRR_TAG },
      client: { status: "ATIVO" },
    },
    select: { id: true, value: true, client: { select: { companyName: true, monthlyValue: true } } },
  });

  const outOfSync = revenues.filter((r) => Number(r.value) !== Number(r.client.monthlyValue));

  if (!confirm) {
    return NextResponse.json({
      preview: true,
      message: "Prévia — chame com ?confirm=1 pra aplicar.",
      count: outOfSync.length,
      items: outOfSync.map((r) => ({
        client: r.client.companyName,
        valorNaCobranca: r.value,
        precoAtualDoCliente: r.client.monthlyValue,
      })),
    });
  }

  for (const r of outOfSync) {
    await prisma.revenue.update({ where: { id: r.id }, data: { value: r.client.monthlyValue } });
  }

  return NextResponse.json({ message: "Cobranças sincronizadas.", count: outOfSync.length });
}
