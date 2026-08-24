import { NextRequest, NextResponse } from "next/server";
import { gerarDiagnostico, GeracaoDuplicada } from "@/lib/ai/diagnostico";
import { AI_CONFIG, aiApiKey } from "@/lib/ai/config";
import { prisma } from "@/lib/prisma";

// Disparo manual do diagnóstico, fora da tela — serve pra reprocessar fichas
// antigas e pra conferir a configuração da IA sem depender do navegador.
// Protegido pelo SETUP_SECRET, igual às outras rotinas administrativas.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(request: NextRequest) {
  const secret = process.env.SETUP_SECRET;
  if (!secret) return false;
  return request.nextUrl.searchParams.get("key") === secret;
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "Chave inválida." }, { status: 403 });

  const [pendentes, ultimas] = await Promise.all([
    prisma.clientOnboarding.count({ where: { analyses: { none: { status: "CONCLUIDO" } } } }),
    prisma.onboardingAnalysis.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        onboardingId: true,
        kind: true,
        version: true,
        status: true,
        model: true,
        promptVersion: true,
        durationMs: true,
        error: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    ia: {
      provider: AI_CONFIG.provider,
      model: AI_CONFIG.model,
      effort: AI_CONFIG.effort,
      chaveConfigurada: !!aiApiKey(),
    },
    fichasSemDiagnostico: pendentes,
    ultimasAnalises: ultimas,
  });
}

export async function POST(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "Chave inválida." }, { status: 403 });

  const onboardingId = request.nextUrl.searchParams.get("ficha");
  const kind = request.nextUrl.searchParams.get("tipo") === "final" ? "PLANO_FINAL" : "PRE_DIAGNOSTICO";
  if (!onboardingId) {
    return NextResponse.json({ error: "Informe ?ficha=<id> (e opcionalmente &tipo=final)." }, { status: 400 });
  }

  try {
    const r = await gerarDiagnostico({ onboardingId, kind });
    const analise = await prisma.onboardingAnalysis.findUnique({
      where: { id: r.analysisId },
      select: { status: true, error: true, durationMs: true, version: true, model: true },
    });
    return NextResponse.json({ analysisId: r.analysisId, ...analise });
  } catch (erro) {
    const status = erro instanceof GeracaoDuplicada ? 409 : 500;
    return NextResponse.json({ error: erro instanceof Error ? erro.message : String(erro) }, { status });
  }
}
