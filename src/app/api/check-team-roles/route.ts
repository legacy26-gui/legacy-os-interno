import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rotina de leitura: lista papel/status atual de cada usuário, pra conferir
// permissões sem precisar acessar o banco direto.
export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  if (request.nextUrl.searchParams.get("key") !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: { name: true, email: true, role: true, active: true, mustChangePassword: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ users });
}
