import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rotina única: desativa o acesso do Luiz e deixa a carteira dele sem gestor
// para redistribuição manual posterior.
export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  if (request.nextUrl.searchParams.get("key") !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }

  const luiz = await prisma.user.findUnique({ where: { email: "luiz@legacydigital.com" } });
  if (!luiz) {
    return NextResponse.json({ error: "Usuário Luiz não encontrado." }, { status: 404 });
  }

  const unassigned = await prisma.client.updateMany({
    where: { managerId: luiz.id },
    data: { managerId: null },
  });

  await prisma.user.update({ where: { id: luiz.id }, data: { active: false } });

  return NextResponse.json({
    message: "Luiz desativado e clientes deixados sem gestor.",
    clientsUnassigned: unassigned.count,
  });
}
