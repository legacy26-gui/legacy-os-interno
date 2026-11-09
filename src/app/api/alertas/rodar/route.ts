import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rodarAlertas, ROBO_DOS_ALERTAS } from "@/lib/alertas/robo";

// A porta que o robô usa pra acordar.
//
// Quem bate aqui é o agendador da Vercel, uma vez por dia (ver vercel.json).
// Não existe nada automático dentro do sistema: página só roda quando alguém
// abre, então sem um relógio de fora ninguém descobre que a gravação de ontem
// não foi entregue.
//
// ── Por que esta rota funciona sem configurar segredo nenhum ───────────────
//
// O jeito recomendado é pôr um CRON_SECRET nas variáveis da Vercel: ela passa
// a mandar esse segredo sozinha em toda chamada do agendador, e aí a rota
// recusa qualquer outra pessoa. Se ele existir, é exatamente isso que
// acontece aqui — e é o modo mais fechado.
//
// Sem ele, em vez de a central inteira ficar sem robô, a rota aceita a
// chamada e se protege de outro jeito. A pergunta certa é: o que alguém
// ganharia chamando isto de fora?
//
//   - Dado: nada. A rota não devolve alerta, nome de cliente nem valor —
//     só quantos problemas existem e quantos avisos saíram.
//   - Encher o celular da equipe: não. O robô só avisa o que PIOROU desde a
//     última vez; chamar mil vezes manda zero avisos. É a mesma trava que já
//     existe pra não avisar o mesmo problema todo dia.
//   - Custo: é o que sobra, e é o que o acelerador abaixo corta — sem
//     segredo, a rota só trabalha de verdade uma vez a cada 15 minutos.
//
// O pior caso de abuso é a conferência do dia acontecer mais cedo do que o
// previsto. A troco disso, o robô funciona no dia em que entra no ar, sem
// depender de ninguém lembrar de criar uma variável. Pôr o CRON_SECRET depois
// fecha a porta de vez, sem mexer em mais nada.

export const dynamic = "force-dynamic";
// O robô consulta quatro coisas e manda os avisos. 60s é folga de sobra pro
// tamanho da agência, e evita cortar no meio se um dia a lista crescer.
export const maxDuration = 60;

/** Sem segredo configurado, o robô só trabalha de novo depois disto. */
const INTERVALO_SEM_SEGREDO_MIN = 15;

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET?.trim();

  // Com segredo configurado: só o agendador entra, e nem acelerador precisa.
  if (segredo) {
    if (req.headers.get("authorization") !== `Bearer ${segredo}`) {
      return NextResponse.json({ ok: false, motivo: "segredo-invalido" }, { status: 401 });
    }
  } else {
    const ultima = await prisma.roboExecucao.findUnique({ where: { nome: ROBO_DOS_ALERTAS } });
    const minutos = ultima ? (Date.now() - ultima.rodouEm.getTime()) / 60_000 : Infinity;
    if (minutos < INTERVALO_SEM_SEGREDO_MIN) {
      // 200 e não 429: a Vercel marcaria a execução como falha, e isso aqui
      // não é falha — é o acelerador fazendo o trabalho dele.
      return NextResponse.json({
        ok: true,
        pulou: "muito-cedo",
        faltamMinutos: Math.ceil(INTERVALO_SEM_SEGREDO_MIN - minutos),
      });
    }
  }

  try {
    const r = await rodarAlertas();
    console.log("[alertas] robô rodou:", JSON.stringify(r));
    return NextResponse.json({ ok: true, ...r });
  } catch (erro) {
    // Devolve 500 de propósito: a Vercel marca a execução como falha e o
    // problema aparece no painel, em vez de um "ok" mentiroso todo dia.
    console.error("[alertas] robô falhou", erro);
    return NextResponse.json({ ok: false, motivo: "erro-interno" }, { status: 500 });
  }
}
