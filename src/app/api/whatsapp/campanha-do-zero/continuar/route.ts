import { NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { assinaturaDaContinuacao, continuarCampanhaDoZero } from "@/lib/whatsapp/campanha-do-zero-whats";

// Continua a criação de uma campanha do zero pedida pelo WhatsApp (muitos carros não cabem numa chamada só).
// Só o próprio sistema chama: a assinatura é um HMAC do usuário com o segredo de sessão.

export const maxDuration = 300;

export async function POST(req: Request) {
  let userId = "";
  try {
    userId = String(((await req.json()) as { userId?: unknown }).userId ?? "");
  } catch {
    return NextResponse.json({ erro: "corpo" }, { status: 400 });
  }
  const veio = Buffer.from(req.headers.get("x-assinatura") ?? "");
  const certa = Buffer.from(assinaturaDaContinuacao(userId));
  if (!userId || veio.length !== certa.length || !timingSafeEqual(veio, certa)) return NextResponse.json({ erro: "assinatura" }, { status: 401 });
  after(async () => {
    await continuarCampanhaDoZero(userId);
  });
  return NextResponse.json({ ok: true });
}
