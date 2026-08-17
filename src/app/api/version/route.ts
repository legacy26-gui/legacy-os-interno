import { NextResponse } from "next/server";

// Endpoint público e sem dados sensíveis: diz qual commit está rodando em
// produção. Serve pra saber, sem adivinhar, se um deploy já subiu — as telas
// do sistema exigem login e não dão pra conferir de fora.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0] ?? null,
    deployedAt: process.env.VERCEL_DEPLOYMENT_ID ? new Date().toISOString() : null,
  });
}
