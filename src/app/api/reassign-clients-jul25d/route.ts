import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rotina única (25/07, lote d): exclui MP automóveis e Special Cars por
// completo (cliente + receitas, histórico, anexos, contratos, campanhas
// etc. — tudo em cascata), e reatribui os clientes indicados. Sem
// ?confirm=1 só lista o que faria.
const DELETES = ["MP automóveis", "Special Cars"];

const MOVES: { companyName: string; managerName: string }[] = [
  { companyName: "Extreme", managerName: "Giovana" },
  { companyName: "Juliano Veiculos", managerName: "Tatiana" },
  { companyName: "Dcar", managerName: "Giovana" },
  { companyName: "Mueller Motors", managerName: "Tatiana" },
  { companyName: "Garage 56", managerName: "Tatiana" },
  { companyName: "Pé Mais", managerName: "Giovana" },
];

export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  if (request.nextUrl.searchParams.get("key") !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }
  const confirm = request.nextUrl.searchParams.get("confirm") === "1";

  const deleteResults: { companyName: string; status: string }[] = [];
  for (const companyName of DELETES) {
    const client = await prisma.client.findFirst({
      where: { companyName },
      include: { _count: { select: { revenues: true, contracts: true, tasks: true, history: true, attachments: true } } },
    });
    if (!client) {
      deleteResults.push({ companyName, status: "erro: cliente não encontrado" });
      continue;
    }
    if (!confirm) {
      deleteResults.push({
        companyName,
        status: `pré-visualização — vai excluir (receitas: ${client._count.revenues}, contratos: ${client._count.contracts}, tarefas: ${client._count.tasks}, histórico: ${client._count.history}, anexos: ${client._count.attachments})`,
      });
      continue;
    }
    await prisma.client.delete({ where: { id: client.id } });
    deleteResults.push({ companyName, status: "excluído" });
  }

  const managers = await prisma.user.findMany({
    where: { name: { in: [...new Set(MOVES.map((m) => m.managerName))] } },
    select: { id: true, name: true },
  });
  const managerByName = new Map(managers.map((m) => [m.name, m.id]));

  const moveResults: { companyName: string; managerName: string; status: string }[] = [];
  for (const move of MOVES) {
    const managerId = managerByName.get(move.managerName);
    if (!managerId) {
      moveResults.push({ ...move, status: "erro: gestor não encontrado" });
      continue;
    }
    const client = await prisma.client.findFirst({ where: { companyName: move.companyName } });
    if (!client) {
      moveResults.push({ ...move, status: "erro: cliente não encontrado" });
      continue;
    }
    if (!confirm) {
      moveResults.push({ ...move, status: `pré-visualização (atual: ${client.managerId ?? "sem gestor"})` });
      continue;
    }
    await prisma.client.update({ where: { id: client.id }, data: { managerId } });
    moveResults.push({ ...move, status: "movido" });
  }

  return NextResponse.json({ confirmed: confirm, deletes: deleteResults, moves: moveResults });
}
