import { NextResponse } from "next/server";

// Qual versão está rodando neste endereço.
//
// Público e sem nada sensível, de propósito: as telas do sistema exigem
// login, então sem isto não há como conferir de fora se um deploy subiu.
//
// ── A armadilha que este arquivo já foi ───────────────────────────────────
//
// O `deployedAt` daqui era `new Date()`, calculado a cada pedido. Ou seja,
// ele dizia "agora" sempre — e quem lia achava que era a hora da implantação.
// Passei uma tarde inteira usando esse número como prova de que alguém tinha
// reimplantado versão antiga, e construí três conclusões erradas em cima
// dele. Não havia rollback nenhum.
//
// Agora vem de `BUILD_TIME`, que o next.config congela na hora do build. Se
// um dia ele voltar a mudar entre dois pedidos seguidos, é sinal de que
// alguém o moveu pra dentro da rota de novo.
//
// A regra geral: endpoint de diagnóstico que inventa valor é pior que não
// existir, porque dá confiança falsa justo na hora em que se está procurando
// um problema.

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0] ?? null,
    // Congelado no build. Dois pedidos seguidos têm que devolver o mesmo.
    builtAt: process.env.BUILD_TIME ?? null,
    // Muda a cada implantação. Serve pra distinguir dois deploys do MESMO
    // commit — que é o caso de quem aperta "Redeploy".
    deployment: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    // Qual endereço respondeu. Este projeto tem mais de um domínio apontando
    // pra implantações diferentes, e sem isto não dá pra saber qual se está
    // olhando.
    url: process.env.VERCEL_URL ?? null,
  });
}
