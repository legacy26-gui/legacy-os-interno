import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { pushConfigurado, avisarTodos } from "@/lib/push";

// Ferramenta de configuração do push, protegida pelo SETUP_SECRET.
//
//   GET  ?key=...            → diz se já está configurado e quantos aparelhos
//                              estão inscritos
//   GET  ?key=...&gerar=1    → gera um par de chaves VAPID novo pra colar na
//                              Vercel (só gera e mostra; não guarda nada)
//   POST ?key=...            → dispara um aviso de teste pra todo mundo

export const dynamic = "force-dynamic";

function autorizado(request: NextRequest) {
  const secret = process.env.SETUP_SECRET;
  if (!secret) return false;
  return request.nextUrl.searchParams.get("key") === secret;
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "Chave inválida." }, { status: 403 });

  if (request.nextUrl.searchParams.get("gerar")) {
    const par = webpush.generateVAPIDKeys();
    return NextResponse.json({
      instrucoes:
        "Cole estes dois valores nas variáveis de ambiente da Vercel (Production, Preview e Development) e faça um redeploy. Gerar de novo invalida as inscrições que já existem.",
      VAPID_PUBLIC_KEY: par.publicKey,
      VAPID_PRIVATE_KEY: par.privateKey,
      VAPID_SUBJECT: "mailto:contato@legacydigital.com",
    });
  }

  const inscritos = await prisma.pushSubscription.findMany({
    select: { id: true, userAgent: true, createdAt: true, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    configurado: pushConfigurado(),
    aparelhosInscritos: inscritos.length,
    aparelhos: inscritos.map((i) => ({
      quem: i.user?.name ?? "—",
      aparelho: i.userAgent?.slice(0, 80) ?? "—",
      desde: i.createdAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "Chave inválida." }, { status: 403 });

  const entregues = await avisarTodos({
    titulo: "🔔 Teste do Legacy OS",
    corpo: "Se você está lendo isso no celular, o aviso de lead novo vai chegar.",
    url: "/comercial",
    tag: "teste",
  });

  return NextResponse.json({ entregues });
}
