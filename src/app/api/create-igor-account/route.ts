import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PASSWORD } from "@/lib/seed-data";

// Rotina única: cria o acesso do Igor (videomaker), que ainda não tinha
// login no sistema — necessário pra ele conseguir usar a agenda.
export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  if (request.nextUrl.searchParams.get("key") !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { email: "igor@legacydigital.com" } });
  if (existing) {
    return NextResponse.json({ message: "Igor já tem conta.", email: existing.email, role: existing.role });
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      name: "Igor",
      email: "igor@legacydigital.com",
      passwordHash,
      role: "GERENTE",
      mustChangePassword: true,
    },
  });

  return NextResponse.json({
    message: "Conta do Igor criada.",
    email: user.email,
    password: DEFAULT_PASSWORD,
    role: user.role,
  });
}
