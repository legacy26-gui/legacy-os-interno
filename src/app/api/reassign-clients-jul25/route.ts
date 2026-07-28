import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rotina única: redistribuição de carteira pedida em 25/07 — move clientes
// específicos para o gestor indicado. Sem ?confirm=1 só lista o que faria.
const MOVES: { companyName: string; managerName: string }[] = [
  { companyName: "Leonardo Multimarcas", managerName: "Giovana" },
  { companyName: "Pr rodas", managerName: "Giovana" },
  { companyName: "R2", managerName: "Giovana" },
  { companyName: "Tadeu motors", managerName: "Giovana" },
  { companyName: "VR", managerName: "Giovana" },
  { companyName: "Monza automoveis", managerName: "Giovana" },
  { companyName: "Placidino Veiculos", managerName: "Giovana" },
  { companyName: "Car pg", managerName: "Tatiana" },
  { companyName: "Brasil Veiculos", managerName: "Tatiana" },
];

export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  if (request.nextUrl.searchParams.get("key") !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }

  const managers = await prisma.user.findMany({
    where: { name: { in: [...new Set(MOVES.map((m) => m.managerName))] } },
    select: { id: true, name: true },
  });
  const managerByName = new Map(managers.map((m) => [m.name, m.id]));

  const results: { companyName: string; managerName: string; status: string }[] = [];

  for (const move of MOVES) {
    const managerId = managerByName.get(move.managerName);
    if (!managerId) {
      results.push({ ...move, status: "erro: gestor não encontrado" });
      continue;
    }

    const client = await prisma.client.findFirst({ where: { companyName: move.companyName } });
    if (!client) {
      results.push({ ...move, status: "erro: cliente não encontrado" });
      continue;
    }

    if (request.nextUrl.searchParams.get("confirm") !== "1") {
      results.push({ ...move, status: `pré-visualização (atual: ${client.managerId ?? "sem gestor"})` });
      continue;
    }

    await prisma.client.update({ where: { id: client.id }, data: { managerId } });
    results.push({ ...move, status: "movido" });
  }

  return NextResponse.json({
    confirmed: request.nextUrl.searchParams.get("confirm") === "1",
    results,
  });
}
