import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Utilitário administrativo: grava o saldo conferido em banco sem precisar
// abrir a tela. Mesma coisa que o formulário em /financeiro/dfc faz — existe
// pra permitir cadastrar/corrigir o saldo remotamente.
// Uso: ?key=SETUP_SECRET&balance=2089&date=2026-08-15&confirm=1
//      &empresa=AGENCIA|TREINAMENTOS (sem isso, mexe no caixa da agência)
export async function GET(request: NextRequest) {
  const configuredSecret = process.env.SETUP_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "SETUP_SECRET não configurado." }, { status: 500 });
  }
  const params = request.nextUrl.searchParams;
  if (params.get("key") !== configuredSecret) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }

  // Cada empresa tem o saldo inicial dela. Sem o parâmetro, assume a agência —
  // é o caixa que já existia antes de o Treinamentos entrar no sistema.
  const empresaRaw = params.get("empresa")?.toUpperCase();
  if (empresaRaw && empresaRaw !== "AGENCIA" && empresaRaw !== "TREINAMENTOS") {
    return NextResponse.json({ error: "empresa deve ser AGENCIA ou TREINAMENTOS." }, { status: 400 });
  }
  const empresa = (empresaRaw ?? "AGENCIA") as "AGENCIA" | "TREINAMENTOS";

  const atual = await prisma.cashSetting.findUnique({ where: { empresa } });

  const balanceRaw = params.get("balance");
  const dateRaw = params.get("date");
  if (!balanceRaw || !dateRaw) {
    return NextResponse.json({
      message: "Informe balance e date (AAAA-MM-DD), e confirm=1 pra gravar.",
      saldoAtual: atual,
    });
  }

  const openingBalance = Number(balanceRaw);
  if (!Number.isFinite(openingBalance)) {
    return NextResponse.json({ error: "balance inválido." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return NextResponse.json({ error: "date deve estar no formato AAAA-MM-DD." }, { status: 400 });
  }
  const openingDate = new Date(`${dateRaw}T00:00:00Z`);

  if (params.get("confirm") !== "1") {
    return NextResponse.json({
      preview: true,
      message: "Prévia — chame com confirm=1 pra gravar.",
      saldoAtual: atual,
      vaiGravar: { empresa, openingBalance, openingDate },
    });
  }

  const saved = await prisma.cashSetting.upsert({
    where: { empresa },
    update: { openingBalance, openingDate },
    create: { id: empresa.toLowerCase(), empresa, openingBalance, openingDate },
  });

  return NextResponse.json({ message: "Saldo em banco gravado.", saldo: saved });
}
