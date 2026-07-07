import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000);
}

// Três perfis de saúde para gerar contas verde / amarela / vermelha nos testes.
const PROFILES = [
  { label: "saudavel", daily: 0, weekly: 2, change: 1, creative: 3 },
  { label: "alerta", daily: 2, weekly: 3, change: 2, creative: 20 },
  { label: "critico", daily: 4, weekly: 12, change: 10, creative: 40 },
];

export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  if (request.nextUrl.searchParams.get("key") !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }

  const operators = await prisma.user.findMany({
    where: { active: true, role: { not: "ADMIN" } },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  if (operators.length === 0) {
    return NextResponse.json({ error: "Nenhum operador (usuário) encontrado. Rode /api/setup primeiro." }, { status: 400 });
  }

  const clients = await prisma.client.findMany({
    where: { status: { not: "CANCELADO" } },
    select: { id: true, managerId: true },
    orderBy: { companyName: "asc" },
  });

  // Limpa os dados do módulo para deixar o seed repetível.
  await prisma.dailyReview.deleteMany({});
  await prisma.weeklyReview.deleteMany({});
  await prisma.campaignChange.deleteMany({});

  let reviewsCreated = 0;
  let changesCreated = 0;

  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    // Atribui gestor por rodízio apenas se o cliente ainda não tiver um.
    const managerId = c.managerId ?? operators[i % operators.length].id;
    if (!c.managerId) {
      await prisma.client.update({ where: { id: c.id }, data: { managerId } });
    }

    const p = PROFILES[i % PROFILES.length];

    await prisma.dailyReview.create({
      data: {
        clientId: c.id,
        reviewerId: managerId,
        checkedCpl: true,
        checkedBudget: true,
        checkedRejected: true,
        checkedFrequency: true,
        checkedComments: p.label !== "critico",
        checkedLeads: true,
        checkedLeadDelivery: true,
        checkedService: p.label === "saudavel",
        checkedScheduling: p.label === "saudavel",
        notes: `Revisão diária de exemplo (${p.label}).`,
        createdAt: daysAgo(p.daily),
      },
    });
    reviewsCreated++;

    await prisma.weeklyReview.create({
      data: {
        clientId: c.id,
        reviewerId: managerId,
        createdCreative: p.label === "saudavel",
        createdAd: p.label === "saudavel",
        testedAudience: p.label !== "critico",
        updatedOffers: p.label === "saudavel",
        reportSent: true,
        clientReplied: p.label !== "critico",
        adjustmentsDone: p.label === "saudavel",
        notes: `Revisão semanal de exemplo (${p.label}).`,
        createdAt: daysAgo(p.weekly),
      },
    });
    reviewsCreated++;

    // Alteração genérica recente (define "dias sem alteração").
    await prisma.campaignChange.create({
      data: {
        clientId: c.id,
        responsibleId: managerId,
        type: "ORCAMENTO_ALTERADO",
        description: "Ajuste de orçamento (exemplo).",
        createdAt: daysAgo(p.change),
      },
    });
    changesCreated++;

    // Criativo novo (define "dias sem criativo novo").
    await prisma.campaignChange.create({
      data: {
        clientId: c.id,
        responsibleId: managerId,
        type: "CRIATIVO_NOVO",
        description: "Novo criativo publicado (exemplo).",
        createdAt: daysAgo(p.creative),
      },
    });
    changesCreated++;
  }

  return NextResponse.json({
    message: "Dados de exemplo do módulo Gestão de Contas criados.",
    clients: clients.length,
    operators: operators.length,
    reviewsCreated,
    changesCreated,
  });
}
