import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, decrypt } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { chavePublicaPush, pushConfigurado } from "@/lib/push";

// O aparelho da equipe se inscreve aqui pra receber aviso de lead novo.
// Precisa de sessão: só quem trabalha na agência recebe notificação nossa.

async function usuarioLogado() {
  const session = await decrypt(await getSessionCookie());
  if (!session?.userId || session.expiresAt < Date.now()) return null;
  return session.userId;
}

// A tela pergunta por aqui se dá pra oferecer o botão e com que chave inscrever.
export async function GET() {
  if (!(await usuarioLogado())) return NextResponse.json({ erro: "sem sessão" }, { status: 401 });
  return NextResponse.json({ configurado: pushConfigurado(), chavePublica: chavePublicaPush() });
}

export async function POST(request: NextRequest) {
  const userId = await usuarioLogado();
  if (!userId) return NextResponse.json({ erro: "sem sessão" }, { status: 401 });

  let corpo: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "json inválido" }, { status: 400 });
  }

  const { endpoint, keys } = corpo;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ erro: "inscrição incompleta" }, { status: 422 });
  }

  // O mesmo aparelho reinscrevendo (troca de permissão, app reinstalado) tem
  // que atualizar, não duplicar: o endereço é a identidade da inscrição.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userId,
      userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
    update: { p256dh: keys.p256dh, auth: keys.auth, userId },
  });

  return NextResponse.json({ ok: true });
}

// Desligar o aviso neste aparelho.
export async function DELETE(request: NextRequest) {
  if (!(await usuarioLogado())) return NextResponse.json({ erro: "sem sessão" }, { status: 401 });

  const endpoint = request.nextUrl.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ erro: "informe o endpoint" }, { status: 400 });

  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return NextResponse.json({ ok: true });
}
