import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runInitialSeed } from "@/lib/seed-data";

export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json(
      { error: "SETUP_SECRET não está configurado nas variáveis de ambiente do projeto." },
      { status: 500 }
    );
  }

  const key = request.nextUrl.searchParams.get("key");
  if (key !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }

  const result = await runInitialSeed(prisma);

  return NextResponse.json({
    message: "Configuração inicial executada com sucesso.",
    defaultPassword: result.defaultPassword,
    templatesCreated: result.templatesCount,
    users: result.users,
  });
}
