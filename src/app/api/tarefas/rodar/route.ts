import { NextResponse } from "next/server";
import { rodarRotinaDeTarefas, type Hora } from "@/lib/tarefas/robo";
import { extrasDaManha } from "@/lib/tarefas/resumo-da-manha";
import { avisarOnboardingsDoDia } from "@/lib/onboarding/avisos";

// A porta do agendador pro robô das tarefas (ver vercel.json e src/lib/tarefas/robo.ts):
//   /api/tarefas/rodar?hora=manha  → a lista do dia de cada pessoa + o resumo da carteira (gestora) / as gravações do dia (Igor)
//   /api/tarefas/rodar?hora=tarde  → "está feito?" + quadro das atrasadas pro dono e a Andrielli
//
// Com CRON_SECRET configurado, só o agendador da Vercel entra. A rota não devolve conteúdo de tarefa nenhum (só quantos
// avisos saíram) e cada aviso sai uma vez por pessoa/dia/tipo. Mesma régua de /api/financeiro/avisos.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET?.trim();
  if (segredo && req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ ok: false, motivo: "segredo-invalido" }, { status: 401 });
  }
  const hora = new URL(req.url).searchParams.get("hora");
  if (hora !== "manha" && hora !== "tarde") return NextResponse.json({ ok: false, motivo: "hora-invalida" }, { status: 400 });
  try {
    const r = await rodarRotinaDeTarefas(hora as Hora, new Date(), extrasDaManha);
    // De manhã também: os onboardings parados ou atrasados (prazo de 7 dias) viram aviso pro dono e pra Andrielli.
    // Só roda dentro da janela da manhã (a rotina acima já recusa fora dela), pra não mandar às 3h.
    const onboardings = hora === "manha" && !r.pulou ? await avisarOnboardingsDoDia().catch((e) => { console.error("[onboarding] avisos do dia falharam", e); return null; }) : null;
    console.log("[tarefas] rotina:", JSON.stringify(r));
    return NextResponse.json({ ok: true, hora: r.hora, avisos: r.avisos.length, atrasadasPara: r.atrasadasPara.length, pulou: r.pulou ?? null, onboardings: onboardings ? onboardings.enviados.length : null });
  } catch (erro) {
    console.error("[tarefas] rotina falhou", erro);
    return NextResponse.json({ ok: false, motivo: "erro-interno" }, { status: 500 });
  }
}
