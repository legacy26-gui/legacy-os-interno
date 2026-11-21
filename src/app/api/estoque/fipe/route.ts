import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { atualizarFipe } from "@/lib/fipe/atualizar";

// Confere a tabela FIPE dos carros do estoque. O agendador (vercel.json) bate aqui às 9h30 e 15h30 de Brasília,
// meia hora depois da leitura dos sites. Mesma regra de segredo da leitura do estoque.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ROBO = "estoque-fipe";
const INTERVALO_SEM_SEGREDO_MIN = 30;

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
  await prisma.roboExecucao.upsert({ where: { nome: ROBO }, create: { nome: ROBO }, update: { rodouEm: new Date() } });

  try {
    const r = await atualizarFipe({ consultas: 180, ms: 240_000 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[fipe] rodada falhou:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, motivo: "erro-interno" }, { status: 500 });
  }
}
