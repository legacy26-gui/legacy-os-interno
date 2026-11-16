import { NextResponse } from "next/server";
import { mandarRelatoriosDaSemana } from "@/lib/whatsapp/robo-dos-relatorios";

// A porta que o agendador usa na manhã de segunda.
//
// ── O horário, que não cabe no vercel.json ───────────────────────────────
//
// Lá está `*/5 11-12 * * 1`: de cinco em cinco minutos, das 11h às 12h59
// UTC, segunda-feira. Em Brasília isso é das 8h às 9h59.
//
// A explicação mora AQUI porque o vercel.json não aceita comentário. JSON
// não tem, e a Vercel valida o arquivo de forma estrita: qualquer chave que
// ela não conhece — um "comment" que alguém pôs pra se explicar — derruba o
// deploy inteiro, com erro de configuração e não de código. Foi o que
// aconteceu quando este cron nasceu, e por isso esta nota existe.
//
// ── Esta rota exige segredo, sem exceção ─────────────────────────────────
//
// A rota dos alertas aceita ser chamada sem CRON_SECRET, e com razão: o que
// alguém ganharia é nada, porque ela só avisa a equipe sobre o que piorou.
//
// Esta MANDA MENSAGEM PRA CLIENTE. Chamada por quem não devia, ela entrega o
// relatório errado, na hora errada, no grupo de uma loja — e mensagem
// mandada no WhatsApp não se desmanda. Então sem CRON_SECRET ela não
// trabalha. Se ele não estiver configurado, o envio automático não existe e
// os relatórios continuam saindo pelo botão, na mão, como sempre saíram.
//
// ── Por que uma rodada manda poucos ──────────────────────────────────────
//
// Pra não queimar o número. A explicação inteira está em
// robo-dos-relatorios.ts; aqui basta saber que a rota é feita pra ser
// chamada VÁRIAS vezes na manhã de segunda, não uma só.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/**
 * Até 60s por rodada.
 *
 * Quatro mensagens com pausa de até catorze segundos entre elas cabem com
 * folga. Não adianta pedir mais: tempo de função parado esperando é tempo
 * jogado fora, e a próxima rodada já está a cinco minutos de distância.
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo) {
    return NextResponse.json(
      { ok: false, motivo: "sem-cron-secret" },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json(
      { ok: false, motivo: "segredo-invalido" },
      { status: 401 },
    );
  }

  try {
    const r = await mandarRelatoriosDaSemana();
    // Nomes de loja voltam porque quem lê isto é o painel da Vercel, do
    // próprio dono. Erro de envio já vai cortado lá dentro e nunca carrega
    // a URL da Z-API: ver zapi.ts.
    return NextResponse.json({ ok: true, ...r });
  } catch (erro) {
    return NextResponse.json(
      {
        ok: false,
        motivo: erro instanceof Error ? erro.message.slice(0, 200) : "falhou",
      },
      { status: 500 },
    );
  }
}
