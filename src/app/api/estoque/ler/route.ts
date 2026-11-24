import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lerTodasAsLojas } from "@/lib/estoque/ler-estoque";

// A porta que lê o estoque das lojas. O agendador (vercel.json) bate aqui às 9h e às 15h
// de Brasília. Sem o segredo, só trabalha se a última passada foi há mais de 30 minutos —
// e o que ganha quem bate sem ser o agendador é nada: a rota não devolve dado de loja.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ROBO = "estoque-leitura";
const INTERVALO_SEM_SEGREDO_MIN = 30;
const ORCAMENTO_MS = 240_000;

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET?.trim();
  if (segredo) {
    if (req.headers.get("authorization") !== `Bearer ${segredo}`) {
      return NextResponse.json({ ok: false, motivo: "segredo-invalido" }, { status: 401 });
    }
  } else {
    const ultima = await prisma.roboExecucao.findUnique({ where: { nome: ROBO } });
    const minutos = ultima ? (Date.now() - ultima.rodouEm.getTime()) / 60_000 : Infinity;
    if (minutos < INTERVALO_SEM_SEGREDO_MIN) {
      return NextResponse.json({ ok: true, pulou: "muito-cedo", faltamMinutos: Math.ceil(INTERVALO_SEM_SEGREDO_MIN - minutos) });
    }
  }

  // Marca ANTES de trabalhar: duas chamadas juntas não leem o mesmo site em dobro.
  await prisma.roboExecucao.upsert({ where: { nome: ROBO }, create: { nome: ROBO }, update: { rodouEm: new Date() } });

  try {
    const r = await lerTodasAsLojas(ORCAMENTO_MS);
    return NextResponse.json({ ...r, ok: true, lojasComSucesso: r.ok });
  } catch (e) {
    console.error("[estoque] leitura falhou:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, motivo: "erro-interno" }, { status: 500 });
  }
}
