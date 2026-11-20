import "server-only";

import { prisma } from "@/lib/prisma";
import type { Empresa } from "@/generated/prisma/client";

// Os números das páginas "Gastos da empresa" e "Pessoal".
//
// As duas páginas fazem a mesma pergunta — pra onde foi o dinheiro neste mês —
// sobre gavetas diferentes. A da empresa lê `Expense` (só saída confirmada, a
// mesma régua do DRE); a pessoal lê `GastoPessoal` e SÓ do dono: a trava de
// privacidade é o `donoId` no `where`, não a tela.

export type Fonte = { tipo: "empresa"; empresa: Empresa } | { tipo: "pessoal"; donoId: string };

export interface CategoriaDoMes {
  categoria: string;
  cents: number;
  /** Fatia do total do mês, 0–100. */
  pct: number;
  lancamentos: number;
  /** O mesmo da categoria no mês anterior, pra dizer se subiu. */
  anteriorCents: number;
}

export interface MesDoHistorico {
  mes: string; // AAAA-MM
  rotulo: string; // "nov"
  cents: number;
}

export interface Lancamento {
  id: string;
  dia: string; // AAAA-MM-DD
  descricao: string;
  categoria: string;
  cents: number;
  peloRobo: boolean;
}

export interface GastosDoMes {
  mes: string;
  rotuloDoMes: string;
  totalCents: number;
  anteriorCents: number;
  porCategoria: CategoriaDoMes[];
  historico: MesDoHistorico[];
  lancamentos: Lancamento[];
  /** Quantos dias do mês já passaram (o mês inteiro, se for passado). */
  diasCorridos: number;
}

const inicioDoMes = (d: Date, delta = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);

async function linhas(fonte: Fonte, de: Date, ate: Date) {
  if (fonte.tipo === "empresa") {
    const r = await prisma.expense.findMany({
      where: { empresa: fonte.empresa, paid: true, date: { gte: de, lt: ate } },
      select: { id: true, date: true, description: true, category: true, value: true, origem: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    return r.map((x) => ({ ...x, peloRobo: x.origem === "robo-whatsapp" }));
  }
  const r = await prisma.gastoPessoal.findMany({
    where: { donoId: fonte.donoId, date: { gte: de, lt: ate } },
    select: { id: true, date: true, description: true, category: true, value: true, origem: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return r.map((x) => ({ ...x, peloRobo: x.origem === "robo-whatsapp" }));
}

export async function gastosDoMes(fonte: Fonte, ref: Date, agora: Date = new Date()): Promise<GastosDoMes> {
  const de = inicioDoMes(ref);
  const ate = inicioDoMes(ref, 1);
  const antes = inicioDoMes(ref, -1);
  const seisAtras = inicioDoMes(ref, -5);

  // Uma leitura de seis meses serve as três perguntas: o mês, o anterior e o histórico.
  const todas = await linhas(fonte, seisAtras, ate);
  const doMes = todas.filter((x) => x.date >= de);
  const doAnterior = todas.filter((x) => x.date >= antes && x.date < de);

  const totalCents = doMes.reduce((s, x) => s + cents(x.value), 0);
  const anteriorCents = doAnterior.reduce((s, x) => s + cents(x.value), 0);

  const mapa = new Map<string, { cents: number; n: number }>();
  for (const x of doMes) {
    const a = mapa.get(x.category) ?? { cents: 0, n: 0 };
    a.cents += cents(x.value);
    a.n += 1;
    mapa.set(x.category, a);
  }
  const anteriorPorCategoria = new Map<string, number>();
  for (const x of doAnterior) anteriorPorCategoria.set(x.category, (anteriorPorCategoria.get(x.category) ?? 0) + cents(x.value));

  const porCategoria = [...mapa.entries()]
    .map(([categoria, v]) => ({
      categoria,
      cents: v.cents,
      lancamentos: v.n,
      pct: totalCents > 0 ? (v.cents / totalCents) * 100 : 0,
      anteriorCents: anteriorPorCategoria.get(categoria) ?? 0,
    }))
    .sort((a, b) => b.cents - a.cents);

  const historico: MesDoHistorico[] = [];
  for (let i = 0; i < 6; i++) {
    const m = inicioDoMes(seisAtras, i);
    const fim = inicioDoMes(m, 1);
    historico.push({
      mes: m.toISOString().slice(0, 7),
      rotulo: m.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", ""),
      cents: todas.filter((x) => x.date >= m && x.date < fim).reduce((s, x) => s + cents(x.value), 0),
    });
  }

  const ehEsteMes = de.getUTCFullYear() === agora.getUTCFullYear() && de.getUTCMonth() === agora.getUTCMonth();
  const diasNoMes = new Date(Date.UTC(de.getUTCFullYear(), de.getUTCMonth() + 1, 0)).getUTCDate();
  const rotulo = de.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

  return {
    mes: de.toISOString().slice(0, 7),
    rotuloDoMes: rotulo.charAt(0).toUpperCase() + rotulo.slice(1),
    totalCents,
    anteriorCents,
    porCategoria,
    historico,
    lancamentos: doMes.slice(0, 300).map((x) => ({
      id: x.id,
      dia: x.date.toISOString().slice(0, 10),
      descricao: x.description,
      categoria: x.category,
      cents: cents(x.value),
      peloRobo: x.peloRobo,
    })),
    diasCorridos: ehEsteMes ? Math.max(1, agora.getUTCDate()) : diasNoMes,
  };
}

/** As retiradas pessoais que saíram do caixa de uma empresa num intervalo — o total, sem o detalhe. */
export async function retiradasDoCaixa(empresa: Empresa, de: Date, ate: Date): Promise<number> {
  const r = await prisma.gastoPessoal.aggregate({
    where: { empresa, date: { gte: de, lt: ate } },
    _sum: { value: true },
  });
  return Number(r._sum.value ?? 0);
}
