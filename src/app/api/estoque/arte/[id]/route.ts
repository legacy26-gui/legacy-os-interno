import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { canAccessModule } from "@/lib/permissions";
import { escopoDaCarteira } from "@/lib/carteira";

// A imagem de uma arte do banco de artes, pra tela mostrar. Só pra quem tem a loja na carteira.

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canAccessModule(user.role, "gestao-contas", user.email) && !canAccessModule(user.role, "clientes", user.email)) return new NextResponse("sem acesso", { status: 403 });
  const { id } = await ctx.params;
  const arte = await prisma.arteDoCarro.findFirst({ where: { id, client: escopoDaCarteira(user) }, select: { bytes: true, mime: true } });
  if (!arte) return new NextResponse("não encontrada", { status: 404 });
  return new NextResponse(Buffer.from(arte.bytes), { headers: { "Content-Type": arte.mime, "Cache-Control": "private, max-age=3600" } });
}
