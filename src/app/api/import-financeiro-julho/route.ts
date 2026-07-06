import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CLIENTS_JULHO_2026: { companyName: string; monthlyValue: number; dueDay: number | null; plan: string }[] = [
  { companyName: "ADEMICON", monthlyValue: 1000, dueDay: null, plan: "Gestão Completa" },
  { companyName: "Atlanta", monthlyValue: 900, dueDay: 20, plan: "Gestão Completa" },
  { companyName: "Brasil Autopix", monthlyValue: 1000, dueDay: 20, plan: "Gestão Completa" },
  { companyName: "Calmon", monthlyValue: 1100, dueDay: 10, plan: "Gestão Completa" },
  { companyName: "Camacho", monthlyValue: 1000, dueDay: 10, plan: "Gestão Completa" },
  { companyName: "Camacho garage", monthlyValue: 1200, dueDay: 20, plan: "Gestão Completa" },
  { companyName: "Car pg", monthlyValue: 800, dueDay: null, plan: "Áquila IA" },
  { companyName: "Classicar", monthlyValue: 700, dueDay: null, plan: "Áquila IA" },
  { companyName: "Clube Mais", monthlyValue: 1200, dueDay: 30, plan: "Gestão Completa" },
  { companyName: "DOMA VEICULOS", monthlyValue: 1000, dueDay: 20, plan: "Gestão Completa" },
  { companyName: "Dcar", monthlyValue: 500, dueDay: 25, plan: "Gestão Completa" },
  { companyName: "Esquadrao da moda", monthlyValue: 1000, dueDay: null, plan: "Gestão Completa" },
  { companyName: "Extreme", monthlyValue: 1000, dueDay: 20, plan: "Gestão Completa" },
  { companyName: "Forza", monthlyValue: 2200, dueDay: 5, plan: "Gestão Completa" },
  { companyName: "Garage 56", monthlyValue: 1000, dueDay: 20, plan: "Gestão Completa" },
  { companyName: "Jota", monthlyValue: 900, dueDay: 20, plan: "Gestão Completa" },
  { companyName: "Juliano Veiculos", monthlyValue: 1100, dueDay: null, plan: "Gestão Completa" },
  { companyName: "Leonardo Multimarcas", monthlyValue: 1000, dueDay: null, plan: "Gestão Completa" },
  { companyName: "MA veiculos", monthlyValue: 1800, dueDay: null, plan: "Gestão Completa" },
  { companyName: "MP automóveis", monthlyValue: 1800, dueDay: 10, plan: "Gestão Completa" },
  { companyName: "Maggi Caminhões", monthlyValue: 1500, dueDay: 25, plan: "Gestão Completa" },
  { companyName: "Magnata", monthlyValue: 800, dueDay: 10, plan: "Gestão Completa" },
  { companyName: "Mn automoveis", monthlyValue: 1200, dueDay: null, plan: "Gestão Completa" },
  { companyName: "Mueller Motors", monthlyValue: 1850, dueDay: 10, plan: "Gestão Completa + Áquila IA" },
  { companyName: "Pr rodas", monthlyValue: 500, dueDay: 20, plan: "Gestão Completa" },
  { companyName: "Pé Mais", monthlyValue: 1200, dueDay: 30, plan: "Gestão Completa" },
  { companyName: "R2", monthlyValue: 1000, dueDay: 15, plan: "Gestão Completa" },
  { companyName: "Radar Multimarcas", monthlyValue: 1200, dueDay: null, plan: "Gestão Completa" },
  { companyName: "Redline", monthlyValue: 700, dueDay: 20, plan: "Gestão Completa" },
  { companyName: "Sandro", monthlyValue: 900, dueDay: 25, plan: "Gestão Completa" },
  { companyName: "Solução", monthlyValue: 1500, dueDay: 20, plan: "Gestão Completa" },
  { companyName: "Special Cars", monthlyValue: 2000, dueDay: 10, plan: "Gestão Completa + Áquila IA" },
  { companyName: "Tadeu motors", monthlyValue: 1000, dueDay: 30, plan: "Gestão Completa" },
  { companyName: "Top car", monthlyValue: 1000, dueDay: 20, plan: "Gestão Completa" },
  { companyName: "VR", monthlyValue: 1000, dueDay: 15, plan: "Gestão Completa" },
  { companyName: "WM Automóveis", monthlyValue: 1800, dueDay: 20, plan: "Gestão Completa" },
  { companyName: "comodoro", monthlyValue: 1000, dueDay: 20, plan: "Gestão Completa" },
  { companyName: "guaracar", monthlyValue: 950, dueDay: 20, plan: "Gestão Completa" },
  { companyName: "podium", monthlyValue: 1500, dueDay: 10, plan: "Gestão Completa" },
];

const EXPENSES_JULHO_2026: { description: string; category: string; value: number }[] = [
  { description: "Andrielli", category: "Equipe", value: 5000 },
  { description: "Tatiana", category: "Equipe", value: 2300 },
  { description: "Igor", category: "Equipe", value: 2700 },
  { description: "Luiz", category: "Equipe", value: 2200 },
  { description: "Brendon", category: "Equipe", value: 2500 },
  { description: "Giovana", category: "Equipe", value: 1800 },
  { description: "Canva", category: "Softwares e ferramentas", value: 34.9 },
  { description: "CapCut", category: "Softwares e ferramentas", value: 65.9 },
  { description: "Armazenamento", category: "Softwares e ferramentas", value: 99.9 },
  { description: "ChatGPT", category: "Softwares e ferramentas", value: 100 },
];

const EXPENSE_DATE = new Date("2026-07-01T00:00:00.000Z");

export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  const key = request.nextUrl.searchParams.get("key");
  if (key !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }

  const clientsResult: { companyName: string; action: "created" | "updated" }[] = [];

  for (const c of CLIENTS_JULHO_2026) {
    const existing = await prisma.client.findFirst({ where: { companyName: c.companyName } });
    if (existing) {
      await prisma.client.update({
        where: { id: existing.id },
        data: { monthlyValue: c.monthlyValue, dueDay: c.dueDay, plan: c.plan, status: "ATIVO" },
      });
      clientsResult.push({ companyName: c.companyName, action: "updated" });
    } else {
      await prisma.client.create({
        data: {
          companyName: c.companyName,
          contactName: c.companyName,
          monthlyValue: c.monthlyValue,
          dueDay: c.dueDay,
          plan: c.plan,
          status: "ATIVO",
        },
      });
      clientsResult.push({ companyName: c.companyName, action: "created" });
    }
  }

  const expensesResult: { description: string; action: "created" | "skipped" }[] = [];
  for (const e of EXPENSES_JULHO_2026) {
    const existing = await prisma.expense.findFirst({
      where: { description: e.description, category: e.category, date: EXPENSE_DATE },
    });
    if (existing) {
      expensesResult.push({ description: e.description, action: "skipped" });
      continue;
    }
    await prisma.expense.create({
      data: { description: e.description, category: e.category, value: e.value, date: EXPENSE_DATE },
    });
    expensesResult.push({ description: e.description, action: "created" });
  }

  return NextResponse.json({
    message: "Importação do Financeiro Julho executada com sucesso.",
    clients: {
      total: clientsResult.length,
      created: clientsResult.filter((c) => c.action === "created").length,
      updated: clientsResult.filter((c) => c.action === "updated").length,
      details: clientsResult,
    },
    expenses: {
      total: expensesResult.length,
      created: expensesResult.filter((e) => e.action === "created").length,
      skipped: expensesResult.filter((e) => e.action === "skipped").length,
    },
  });
}
