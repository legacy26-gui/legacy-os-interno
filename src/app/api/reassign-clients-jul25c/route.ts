import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rotina única: R2 volta pra Andriele. Sem ?confirm=1 só lista o que faria.
const MOVES: { companyName: string; managerName: string }[] = [{ companyName: "R2", managerName: "Andriele" }];

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
