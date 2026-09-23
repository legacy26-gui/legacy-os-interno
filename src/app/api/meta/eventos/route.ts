import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { metaConfigurada, enviarEventoMeta, avisarMetaDaEtapa, telefoneParaMeta } from "@/lib/meta-capi";

// Conferência da Conversions API, protegida pelo SETUP_SECRET.
//
//   GET  ?key=...                 → configuração e últimos envios
//   POST ?key=...&lead=<id>       → reenvia os eventos daquele lead
//
// Existe porque envio de evento é invisível: sem isso, só se descobre que
// parou de funcionar quando o anúncio já está otimizando errado.

export const dynamic = "force-dynamic";

function autorizado(request: NextRequest) {
  const secret = process.env.SETUP_SECRET;
  if (!secret) return false;
  return request.nextUrl.searchParams.get("key") === secret;
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "Chave inválida." }, { status: 403 });

  const [envios, comRastro, semRastro] = await Promise.all([
    prisma.metaCapiEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        eventName: true,
        eventId: true,
        sucesso: true,
        resposta: true,
        createdAt: true,
        lead: { select: { companyName: true, stage: true } },
      },
    }),
    prisma.lead.count({ where: { OR: [{ fbc: { not: null } }, { fbp: { not: null } }, { fbclid: { not: null } }] } }),
    prisma.lead.count({ where: { fbc: null, fbp: null, fbclid: null } }),
  ]);

  return NextResponse.json({
    configurada: metaConfigurada(),
    pixelId: process.env.META_PIXEL_ID?.trim() ?? null,
    tokenConfigurado: !!process.env.META_CAPI_TOKEN?.trim(),
    versaoDaApi: process.env.META_API_VERSION?.trim() || "v21.0",
    modoDeTeste: !!process.env.META_TEST_EVENT_CODE?.trim(),
    leads: { comRastroDeAnuncio: comRastro, semRastro },
    ultimosEnvios: envios.map((e) => ({
      lead: e.lead.companyName,
      etapa: e.lead.stage,
      evento: e.eventName,
      eventId: e.eventId,
      sucesso: e.sucesso,
      quando: e.createdAt,
      ...(e.sucesso ? {} : { resposta: e.resposta?.slice(0, 300) }),
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "Chave inválida." }, { status: 403 });

  const leadId = request.nextUrl.searchParams.get("lead");
  if (!leadId) return NextResponse.json({ error: "Informe ?lead=<id>." }, { status: 400 });

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true, companyName: true, contactName: true, phone: true, city: true, state: true,
      fbc: true, fbp: true, fbclid: true, landingUrl: true,
      clientIp: true, clientUserAgent: true, pixelEventId: true, stage: true,
    },
  });
  if (!lead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  // Reenvio manual ignora o registro anterior: é justamente pra tentar de novo
  // o que falhou.
  await prisma.metaCapiEvent.deleteMany({ where: { leadId } });

  const resultado = await enviarEventoMeta(lead, "Lead");
  await avisarMetaDaEtapa(leadId);

  const registros = await prisma.metaCapiEvent.findMany({
    where: { leadId },
    select: { eventName: true, eventId: true, sucesso: true, resposta: true },
  });

  return NextResponse.json({
    lead: lead.companyName,
    telefoneParaMeta: telefoneParaMeta(lead.phone),
    temRastro: !!(lead.fbc || lead.fbp || lead.fbclid),
    leadEnviado: resultado,
    eventos: registros.map((r) => ({
      evento: r.eventName,
      eventId: r.eventId,
      sucesso: r.sucesso,
      ...(r.sucesso ? {} : { resposta: r.resposta?.slice(0, 300) }),
    })),
  });
}
