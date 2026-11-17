import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rotina única: tira o Placidino da carteira, mantendo a cobrança do mês em
// que ele saiu.
//
// ── Por que uma rota, e não um clique na tela ────────────────────────────
//
// Porque a tela faz exatamente isto já, e bem — marcar CANCELADO em
// `updateClient` registra o churn no Comercial e limpa as cobranças futuras.
// O que faltava era alguém clicar, e o Guilherme pediu pra não precisar.
//
// Mesmo padrão das outras rotinas únicas daqui: chave na URL, PRÉVIA por
// padrão, só aplica com ?confirm=1. Rotina de manutenção que mexe em dinheiro
// sem mostrar antes o que vai mexer é como se apaga a coisa errada.
//
// ── O que ela preserva, e por quê ────────────────────────────────────────
//
// A cobrança do MÊS CORRENTE fica. O serviço do mês foi entregue e o cliente
// que sai no meio do mês costuma pagar a mensalidade assim mesmo. Apagá-la
// sumiria com receita real do Financeiro, baixaria o faturamento do mês e
// tiraria da frente uma cobrança que alguém ainda precisa receber.
//
// Some só o que vence do PRIMEIRO DIA DO MÊS SEGUINTE em diante, e só o que
// ainda não foi pago. Nada que já está PAGO é tocado, nunca: é o que sustenta
// o histórico e o DRE dos meses fechados.
//
// Depois de rodar com sucesso, este arquivo pode ser apagado.

const NOME = "Placidino";

export async function GET(request: NextRequest) {
  const segredo = process.env.SETUP_SECRET;
  if (!segredo) {
    return NextResponse.json(
      { error: "SETUP_SECRET não configurado." },
      { status: 500 },
    );
  }
  if (request.nextUrl.searchParams.get("key") !== segredo) {
    return NextResponse.json({ error: "Chave inválida." }, { status: 403 });
  }
  const confirmar = request.nextUrl.searchParams.get("confirm") === "1";

  const cliente = await prisma.client.findFirst({
    where: { companyName: { contains: NOME, mode: "insensitive" } },
    select: {
      id: true,
      companyName: true,
      status: true,
      monthlyValue: true,
    },
  });
  if (!cliente) {
    return NextResponse.json(
      { error: `Não achei nenhum cliente com "${NOME}" no nome.` },
      { status: 404 },
    );
  }

  const agora = new Date();
  const inicioDoMes = new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1),
  );
  const mesQueVem = new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1),
  );

  const comoLinha = {
    id: true,
    value: true,
    dueDate: true,
    status: true,
    description: true,
  } as const;

  const [fica, some, jaPagas] = await Promise.all([
    // O mês corrente: é esta que tem que sobreviver.
    prisma.revenue.findMany({
      where: {
        empresa: "AGENCIA",
        clientId: cliente.id,
        dueDate: { gte: inicioDoMes, lt: mesQueVem },
      },
      select: comoLinha,
      orderBy: { dueDate: "asc" },
    }),
    // Dos meses seguintes, e só o que não foi pago.
    prisma.revenue.findMany({
      where: {
        empresa: "AGENCIA",
        clientId: cliente.id,
        status: { in: ["PENDENTE", "ATRASADO"] },
        dueDate: { gte: mesQueVem },
      },
      select: comoLinha,
      orderBy: { dueDate: "asc" },
    }),
    // Pra deixar explícito na resposta que nada pago é tocado.
    prisma.revenue.count({
      where: { empresa: "AGENCIA", clientId: cliente.id, status: "PAGO" },
    }),
  ]);

  const emReais = (v: unknown) =>
    Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const resumo = {
    cliente: cliente.companyName,
    statusAgora: cliente.status,
    mensalidade: emReais(cliente.monthlyValue),
    mantem: {
      quantas: fica.length,
      total: emReais(fica.reduce((s, r) => s + Number(r.value), 0)),
      linhas: fica.map((r) => ({
        vence: r.dueDate.toISOString().slice(0, 10),
        valor: emReais(r.value),
        status: r.status,
      })),
    },
    apaga: {
      quantas: some.length,
      total: emReais(some.reduce((s, r) => s + Number(r.value), 0)),
      linhas: some.map((r) => ({
        vence: r.dueDate.toISOString().slice(0, 10),
        valor: emReais(r.value),
        status: r.status,
      })),
    },
    cobrancasJaPagas: jaPagas,
    naoToca: "nada com status PAGO, nem nada que vence até o fim deste mês",
  };

  if (!confirmar) {
    return NextResponse.json({
      previa: true,
      ...resumo,
      comoAplicar: "repita o endereço acrescentando &confirm=1",
    });
  }

  // ── Aplicar ───────────────────────────────────────────────────────────
  const jaEraCancelado = cliente.status === "CANCELADO";

  await prisma.client.update({
    where: { id: cliente.id },
    data: { status: "CANCELADO" },
  });

  // O churn alimenta o painel do Comercial. Só registra se ele ainda não era
  // cancelado — rodar a rotina duas vezes não pode virar dois churns.
  let churnRegistrado = false;
  if (!jaEraCancelado) {
    await prisma.commercialEvent.create({
      data: {
        empresa: "AGENCIA",
        type: "CHURN",
        companyName: cliente.companyName,
        value: cliente.monthlyValue,
      },
    });
    churnRegistrado = true;
  }

  const { count } = await prisma.revenue.deleteMany({
    where: {
      empresa: "AGENCIA",
      clientId: cliente.id,
      status: { in: ["PENDENTE", "ATRASADO"] },
      dueDate: { gte: mesQueVem },
    },
  });

  return NextResponse.json({
    aplicado: true,
    cliente: cliente.companyName,
    statusNovo: "CANCELADO",
    churnRegistrado,
    cobrancasFuturasApagadas: count,
    cobrancaDesteMesMantida: resumo.mantem,
  });
}
