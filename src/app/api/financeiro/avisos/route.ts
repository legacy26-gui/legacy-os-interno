import { NextResponse } from "next/server";
import { rodarAvisosDoFinanceiro } from "@/lib/financeiro-ia/robo-dos-avisos";

// A porta do agendador pros avisos do financeiro (ver vercel.json e robo-dos-avisos.ts).
//
// Com CRON_SECRET configurado, só o agendador da Vercel entra. Sem ele, a rota aceita — e o que
// alguém de fora ganharia chamando é nada: não devolve valor nenhum (só quantos avisos saíram), e
// cada aviso só sai uma vez por dia/semana, no horário da casa. Mesma régua de /api/alertas/rodar.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET?.trim();
  if (segredo && req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ ok: false, motivo: "segredo-invalido" }, { status: 401 });
  }
  try {
    const r = await rodarAvisosDoFinanceiro();
    console.log("[financeiro] avisos:", JSON.stringify(r));
    return NextResponse.json({ ok: true, grupos: r.grupos, enviados: r.enviados.length, pulou: r.pulou ?? null });
  } catch (erro) {
    console.error("[financeiro] avisos falharam", erro);
    return NextResponse.json({ ok: false, motivo: "erro-interno" }, { status: 500 });
  }
}
