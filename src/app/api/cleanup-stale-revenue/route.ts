import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rotina única: remove cobranças pendentes (deste mês em diante) de clientes
// que já não são mais Ativos — sobras de quando o cliente foi cancelado sem
// que a rotina de limpeza existisse ainda. É isso que fazia o MRR do topo
// (só clientes ativos) não bater com o total do quadro/lista de receitas
// (que incluíam essas cobranças órfãs). Preview por padrão; ?confirm=1 aplica.
export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  if (request.nextUrl.searchParams.get("key") !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }
  const confirm = request.nextUrl.searchParams.get("confirm") === "1";

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const stale = await prisma.revenue.findMany({
    where: {
      status: { in: ["PENDENTE", "ATRASADO"] },
      dueDate: { gte: monthStart },
      client: { status: { not: "ATIVO" } },
    },
    select: {
      id: true,
      value: true,
      dueDate: true,
      description: true,
      client: { select: { companyName: true, status: true } },
    },
  });

  const totalValue = stale.reduce((s, r) => s + Number(r.value), 0);

  if (!confirm) {
    return NextResponse.json({
      preview: true,
      message: "Prévia — chame com ?confirm=1 pra aplicar.",
      count: stale.length,
      totalValue,
      items: stale.map((r) => ({
        client: r.client.companyName,
        clientStatus: r.client.status,
        description: r.description,
        value: r.value,
        dueDate: r.dueDate,
      })),
    });
  }

  const ids = stale.map((r) => r.id);
  await prisma.revenue.deleteMany({ where: { id: { in: ids } } });

  return NextResponse.json({ message: "Cobranças órfãs removidas.", count: stale.length, totalValue });
}
