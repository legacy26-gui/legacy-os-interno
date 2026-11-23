import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

/**
 * O banco responde? Uma consulta de nada (`SELECT 1`) com prazo de 4 segundos. Só devolve se funcionou e, se não,
 * o CÓDIGO do erro do Prisma (P1001 = não alcança o banco, P1002 = demorou, P1000 = senha recusada, P1017 = conexão
 * fechada) — nunca a mensagem, que pode trazer endereço do banco. Serve pra distinguir "o sistema caiu" de "o banco
 * não responde" quando o login dá erro.
 */
async function bancoResponde(): Promise<{ ok: boolean; ms: number; codigo?: string }> {
  const inicio = Date.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("prazo"), { code: "TIMEOUT-4s" })), 4000)),
    ]);
    return { ok: true, ms: Date.now() - inicio };
  } catch (e) {
    const codigo = (e as { code?: string })?.code ?? (e as Error)?.name ?? "erro";
    return { ok: false, ms: Date.now() - inicio, codigo: String(codigo).slice(0, 40) };
  }
}

export async function GET() {
  const banco = await bancoResponde();
  return NextResponse.json({
    banco,
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
