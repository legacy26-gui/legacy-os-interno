import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rotina única: atribui ao Guilherme todos os clientes sem gestor (a carteira
// que sobrou do Luiz após a reestruturação). Sem ?confirm=1 só lista, pra
// conferir antes de aplicar.
export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  if (request.nextUrl.searchParams.get("key") !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }

  const guilherme = await prisma.user.findUnique({ where: { email: "guilherme@legacydigital.com" } });
  if (!guilherme) {
    return NextResponse.json({ error: "Usuário Guilherme não encontrado." }, { status: 404 });
  }

  const unassigned = await prisma.client.findMany({
    where: { managerId: null },
    select: { id: true, companyName: true },
    orderBy: { companyName: "asc" },
  });

  if (request.nextUrl.searchParams.get("confirm") !== "1") {
    return NextResponse.json({
      message: "Pré-visualização. Chame com &confirm=1 para aplicar.",
      count: unassigned.length,
      clients: unassigned.map((c) => c.companyName),
    });
  }

  const result = await prisma.client.updateMany({
    where: { managerId: null },
    data: { managerId: guilherme.id },
  });

  return NextResponse.json({
    message: "Clientes sem gestor atribuídos ao Guilherme.",
    clientsAssigned: result.count,
  });
}
