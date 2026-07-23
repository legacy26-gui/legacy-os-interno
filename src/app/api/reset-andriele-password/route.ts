import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PASSWORD } from "@/lib/seed-data";

// Rotina única: diagnostica e reseta o acesso da Andriele pra senha padrão,
// caso o login esteja falhando por algum motivo (senha trocada, conta
// inativa, etc).
export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  if (request.nextUrl.searchParams.get("key") !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { email: "andriele@legacydigital.com" } });
  if (!user) {
    return NextResponse.json({ error: "Usuário Andriele não encontrado." }, { status: 404 });
  }

  const before = { active: user.active, mustChangePassword: user.mustChangePassword, role: user.role };

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, active: true, mustChangePassword: true },
  });

  return NextResponse.json({
    message: "Senha da Andriele resetada pra padrão.",
    before,
    email: user.email,
    newPassword: DEFAULT_PASSWORD,
  });
}
