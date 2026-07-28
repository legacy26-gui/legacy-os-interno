import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rotina de leitura: lista clientes agrupados por gestor responsável.
export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  if (request.nextUrl.searchParams.get("key") !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }

  const clients = await prisma.client.findMany({
    select: {
      companyName: true,
      status: true,
      manager: { select: { name: true } },
    },
    orderBy: [{ manager: { name: "asc" } }, { companyName: "asc" }],
  });

  const grouped: Record<string, { companyName: string; status: string }[]> = {};
  for (const c of clients) {
    const key = c.manager?.name ?? "Sem gestor";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ companyName: c.companyName, status: c.status });
  }

  return NextResponse.json({ total: clients.length, grouped });
}
