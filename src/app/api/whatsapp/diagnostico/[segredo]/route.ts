import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

// A janela de diagnóstico do robô de WhatsApp.
//
// ── Por que ela precisou existir ─────────────────────────────────────────
//
// Porque quando o robô fica mudo não sobra nada pra olhar. O atendimento
// acontece depois da resposta HTTP, então a rota responde "recebido" mesmo
// quando decide não fazer nada — e a decisão, que é o que interessa, morre
// sem deixar rastro.
//
// A tela de Configurações mostra os recados que chegaram, mas depender de
// alguém tirar print pra cada hipótese transforma cada investigação em uma
// ida e volta. Esta rota devolve, de uma vez, as três coisas que explicam
// 99% dos silêncios:
//
//   1. os últimos recados que a Z-API mandou (chegou? era grupo? marcaram?)
//   2. de qual loja é cada grupo que apareceu, e se o robô está autorizado
//   3. quais grupos estão marcados como internos
//
// ── Por que o mesmo segredo do webhook ───────────────────────────────────
//
// Porque quem tem aquele segredo já consegue forjar uma mensagem vinda do
// grupo de uma loja — que é poder maior do que ler esta página. Um segundo
// segredo só pra isto seria mais uma coisa pra guardar sem proteger nada a
// mais.
//
// Não devolve texto de mensagem nenhuma: ver guardar-recado.ts.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ segredo: string }> },
) {
  const esperado = process.env.ZAPI_WEBHOOK_SECRET?.trim();
  const { segredo } = await ctx.params;
  if (!esperado || esperado.length < 16 || !iguais(segredo, esperado)) {
    return new NextResponse("não encontrado", { status: 404 });
  }

  const recados = await prisma.recadoDaZapi.findMany({
    orderBy: { recebidoEm: "desc" },
    take: 12,
  });

  // Os grupos que apareceram nos recados, pra cruzar com o cadastro.
  const vistos = [
    ...new Set(recados.map((r) => r.de).filter((d): d is string => !!d)),
  ];

  const [lojas, internos] = await Promise.all([
    prisma.client.findMany({
      where: { whatsappGrupoId: { not: null } },
      select: {
        companyName: true,
        whatsappGrupoId: true,
        whatsappDesligaAuto: true,
        manager: { select: { name: true, whatsapp: true } },
      },
    }),
    prisma.grupoInterno.findMany({ select: { grupoId: true, nome: true } }),
  ]);

  const porGrupo = new Map(lojas.map((l) => [l.whatsappGrupoId!, l]));
  const internosIds = new Set(internos.map((i) => i.grupoId));

  return NextResponse.json({
    agora: new Date().toISOString(),
    // O que a Z-API mandou, do mais novo pro mais velho.
    recados: recados.map((r) => ({
      quando: r.recebidoEm,
      ehGrupo: r.isGroup,
      doProprioRobo: r.fromMe,
      de: r.de,
      participante: r.participante,
      numeroDoRobo: r.numeroDoRobo,
      marcaramNoTexto: r.temArrobaComNumero,
      marcadosNaLista: r.mencionados,
      tamanhoDoTexto: r.tamanhoDoTexto,
      campos: r.chaves,
    })),
    // Pra cada grupo que escreveu: o sistema sabe de quem ele é?
    gruposQueEscreveram: vistos.map((id) => {
      const loja = porGrupo.get(id);
      return {
        grupoId: id,
        ehInterno: internosIds.has(id),
        loja: loja?.companyName ?? null,
        roboAutorizado: loja?.whatsappDesligaAuto ?? null,
        gestor: loja?.manager?.name ?? null,
        gestorTemWhatsapp: !!loja?.manager?.whatsapp,
      };
    }),
    // O cadastro inteiro, pra achar id trocado.
    lojasComGrupo: lojas.map((l) => ({
      loja: l.companyName,
      grupoId: l.whatsappGrupoId,
      roboAutorizado: l.whatsappDesligaAuto,
    })),
    gruposInternos: internos,
    // O que está configurado no servidor, sem revelar nenhum valor.
    configurado: {
      zapi: !!process.env.ZAPI_INSTANCE_ID?.trim(),
      webhookSecret: true,
      escritaNaMeta: !!process.env.META_ADS_WRITE_TOKEN?.trim(),
      leituraNaMeta: !!process.env.META_ADS_READ_TOKEN?.trim(),
      chaveDaIa: !!(
        process.env.OPENAI_API_KEY?.trim() ||
        process.env.ANTHROPIC_API_KEY?.trim()
      ),
      provedorDaIa: process.env.AI_PROVIDER ?? "(padrão: anthropic)",
    },
  });
}
