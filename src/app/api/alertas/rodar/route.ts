import { NextResponse } from "next/server";
import { rodarAlertas } from "@/lib/alertas/robo";

// A porta que o robô usa pra acordar.
//
// Quem bate nesta porta é o agendador da Vercel, uma vez por dia (ver
// vercel.json). Não tem nada de automático dentro do sistema: página só roda
// quando alguém abre, então sem um relógio de fora ninguém descobre que a
// gravação de ontem não foi entregue.
//
// Protegida por segredo, e isso não é exagero: sem trava, qualquer um na
// internet poderia ficar chamando esta rota. Não apagaria nada — o robô só
// lê e manda aviso — mas daria pra fazer o celular da equipe vibrar à
// vontade, e a central morreria de tanto ninguém aguentar.
//
// Fecha na falta do segredo, não abre. Se o CRON_SECRET não estiver
// configurado, esta rota não funciona pra ninguém, nem pro agendador. O botão
// "Conferir agora" da tela de Alertas não passa por aqui (é ação de servidor,
// com login), então o Guilherme consegue disparar na mão mesmo antes de a
// variável existir.

export const dynamic = "force-dynamic";
// O robô consulta quatro coisas e manda os avisos. 60s é folga de sobra pro
// tamanho da agência, e evita cortar no meio se um dia a lista crescer.
export const maxDuration = 60;

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo) return false;
  // A Vercel manda o segredo neste cabeçalho sozinha, desde que a variável
  // CRON_SECRET exista no projeto.
  return req.headers.get("authorization") === `Bearer ${segredo}`;
}

export async function GET(req: Request) {
  if (!autorizado(req)) {
    const configurado = !!process.env.CRON_SECRET?.trim();
    // A resposta diz se falta o segredo ou se ele veio errado — é o que
    // permite descobrir por que o robô não rodou sem ter que adivinhar.
    return NextResponse.json(
      { ok: false, motivo: configurado ? "segredo-invalido" : "sem-cron-secret" },
      { status: 401 }
    );
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
