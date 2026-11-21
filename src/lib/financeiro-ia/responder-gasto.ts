import "server-only";

import { prisma } from "@/lib/prisma";
import { diaDaCasa } from "@/lib/dia-da-casa";
import { bateComOsTermos, lerPergunta, type PerguntaDeGasto } from "./interpretar-pergunta";
import { reais } from "./interpretar-gasto";

// A resposta a "quanto gastei de Uber com o Igor esse mês?".
//
// Soma o que foi lançado — na empresa (Expense, só saída confirmada, a régua do DRE)
// e no pessoal (GastoPessoal, SÓ do dono: a trava de privacidade é o `donoId` aqui,
// não a tela) — onde a descrição ou a categoria tem TODOS os termos da pergunta.
//
// A busca é feita em memória, depois de recortar o período: é o jeito de ignorar
// acento e maiúscula ("Almoço" × "almoco") sem depender de collation do banco, e o
// recorte por data já deixa poucos lançamentos.

interface Linha {
  dia: string;
  descricao: string;
  categoria: string;
  cents: number;
  lado: "empresa" | "pessoal";
}

const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const comoData = (d: string) => new Date(`${d}T00:00:00Z`);

async function carregar(donoId: string, p: PerguntaDeGasto): Promise<Linha[]> {
  const de = comoData(p.periodo.de);
  const ate = comoData(p.periodo.ate);
  const linhas: Linha[] = [];

  if (p.escopo !== "pessoal") {
    const empresas = await prisma.expense.findMany({
      where: {
        paid: true,
        date: { gte: de, lt: ate },
        // "Agência" é o padrão dele; só olha o Treinamentos quando ele cita.
        empresa: p.treinamentos ? "TREINAMENTOS" : undefined,
      },
      select: { date: true, description: true, category: true, value: true },
      orderBy: { date: "desc" },
      take: 5000,
    });
    for (const x of empresas) {
      linhas.push({ dia: x.date.toISOString().slice(0, 10), descricao: x.description, categoria: x.category, cents: cents(x.value), lado: "empresa" });
    }
  }
  if (p.escopo !== "empresa") {
    const pessoais = await prisma.gastoPessoal.findMany({
      where: { donoId, date: { gte: de, lt: ate }, ...(p.treinamentos ? { empresa: "TREINAMENTOS" as const } : {}) },
      select: { date: true, description: true, category: true, value: true },
      orderBy: { date: "desc" },
      take: 5000,
    });
    for (const x of pessoais) {
      linhas.push({ dia: x.date.toISOString().slice(0, 10), descricao: x.description, categoria: x.category, cents: cents(x.value), lado: "pessoal" });
    }
  }
  return linhas.sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0));
}

const curto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Os termos como o robô repete na resposta: "Uber e Igor". */
function dizerTermos(termos: string[]): string {
  const t = termos.map((x) => x.charAt(0).toUpperCase() + x.slice(1));
  if (t.length <= 1) return t[0] ?? "";
  return `${t.slice(0, -1).join(", ")} e ${t[t.length - 1]}`;
}

export function perguntaDeGastoTemAssunto(texto: string, agora: Date = new Date()): boolean {
  const p = lerPergunta(texto, diaDaCasa(agora));
  return p.ranking || p.termos.length > 0;
}

/** As categorias que mais pesaram num conjunto de lançamentos, da maior pra menor. */
function porCategoria(linhas: Linha[]): { categoria: string; cents: number; n: number }[] {
  const m = new Map<string, { cents: number; n: number }>();
  for (const l of linhas) {
    const c = l.categoria?.trim() || "Outros";
    const x = m.get(c) ?? { cents: 0, n: 0 };
    x.cents += l.cents;
    x.n++;
    m.set(c, x);
  }
  return [...m].map(([categoria, x]) => ({ categoria, ...x })).sort((a, b) => b.cents - a.cents);
}

const porcento = (parte: number, total: number) => (total > 0 ? `${Math.round((parte / total) * 100)}%` : "");

/** "No que eu mais gastei este mês?": o ranking por categoria (empresa e pessoal separados) e os maiores lançamentos. */
function responderRanking(linhas: Linha[], p: PerguntaDeGasto, assunto: string): string {
  const quando = p.periodo.rotulo;
  const sobre = assunto ? ` com *${assunto}*` : "";
  if (linhas.length === 0) return `Não achei nenhum gasto${sobre} ${quando}.`;
  const total = linhas.reduce((s, l) => s + l.cents, 0);
  const bloco = (titulo: string | null, ls: Linha[]) => {
    const soma = ls.reduce((s, l) => s + l.cents, 0);
    const cats = porCategoria(ls);
    const MOSTRA = 6;
    return [
      titulo ? `*${titulo}* — ${reais(soma)}` : null,
      ...cats.slice(0, MOSTRA).map((c, i) => `${i + 1}. ${c.categoria} — *${reais(c.cents)}* (${porcento(c.cents, soma)}, ${plural(c.n, "lançamento", "lançamentos")})`),
      cats.length > MOSTRA ? `…e mais ${cats.length - MOSTRA} ${cats.length - MOSTRA === 1 ? "categoria" : "categorias"}` : null,
    ].filter((x): x is string => x !== null);
  };
  const daEmpresa = linhas.filter((l) => l.lado === "empresa");
  const pessoais = linhas.filter((l) => l.lado === "pessoal");
  const partes = [`Onde mais foi dinheiro${sobre} ${quando} (total *${reais(total)}*):`, ""];
  if (daEmpresa.length && pessoais.length) partes.push(...bloco("Empresa", daEmpresa), "", ...bloco("Pessoal (retirada)", pessoais));
  else partes.push(...bloco(pessoais.length ? "Pessoal (retirada)" : null, linhas));
  const maiores = [...linhas].sort((a, b) => b.cents - a.cents).slice(0, 3);
  partes.push("", "Maiores lançamentos:", ...maiores.map((l) => `• ${curto(l.dia)} · ${l.descricao} — ${reais(l.cents)}${daEmpresa.length && pessoais.length ? ` (${l.lado})` : ""}`));
  return partes.join("\n");
}

export async function responderPerguntaDeGasto(donoId: string, texto: string, agora: Date = new Date()): Promise<string> {
  const hoje = diaDaCasa(agora);
  const p = lerPergunta(texto, hoje);
  const todas = await carregar(donoId, p);
  if (p.ranking) {
    return responderRanking(todas.filter((l) => bateComOsTermos(l.descricao, l.categoria, p.termos)), p, dizerTermos(p.rotulos));
  }
  const achadas = todas.filter((l) => bateComOsTermos(l.descricao, l.categoria, p.termos));
  const assunto = dizerTermos(p.rotulos);
  const quando = p.periodo.rotulo;

  if (achadas.length === 0) {
    // Com mais de um termo, mostra o que existe de cada um: "nenhum com os dois" não
    // quer dizer que não houve Uber, e quem perguntou quer saber qual dos dois falhou.
    if (p.termos.length > 1) {
      const por = p.termos.map((t) => {
        const so = todas.filter((l) => bateComOsTermos(l.descricao, l.categoria, [t]));
        return { t: p.rotulos[p.termos.indexOf(t)] ?? t, n: so.length, soma: so.reduce((s, l) => s + l.cents, 0) };
      });
      if (por.some((x) => x.n > 0)) {
        return (
          `Não achei nenhum gasto com *${assunto}* juntos ${quando}.\n\n` +
          "Separado:\n" +
          por.map((x) => `• ${x.t.charAt(0).toUpperCase() + x.t.slice(1)}: ${x.n > 0 ? `${reais(x.soma)} em ${plural(x.n, "lançamento", "lançamentos")}` : "nada"}`).join("\n") +
          "\n\nSe o nome não está na descrição do gasto, eu não consigo ligar um ao outro. Daqui pra frente escreve junto: *uber 23 igor*."
        );
      }
    }
    return `Não achei nenhum gasto com *${assunto}* ${quando}.`;
  }

  const total = achadas.reduce((s, l) => s + l.cents, 0);
  const daEmpresa = achadas.filter((l) => l.lado === "empresa");
  const pessoais = achadas.filter((l) => l.lado === "pessoal");

  const linhas = [`*${assunto}* ${quando}: *${reais(total)}* em ${plural(achadas.length, "lançamento", "lançamentos")}`];
  if (daEmpresa.length > 0 && pessoais.length > 0) {
    linhas.push(
      `• Empresa: ${reais(daEmpresa.reduce((s, l) => s + l.cents, 0))} (${daEmpresa.length})`,
      `• Pessoal: ${reais(pessoais.reduce((s, l) => s + l.cents, 0))} (${pessoais.length})`,
    );
  } else if (pessoais.length > 0) {
    linhas.push("Tudo pessoal (retirada).");
  }

  const MOSTRA = 8;
  linhas.push("", ...achadas.slice(0, MOSTRA).map((l) => `${curto(l.dia)} · ${l.descricao} — ${reais(l.cents)}`));
  if (achadas.length > MOSTRA) linhas.push(`…e mais ${achadas.length - MOSTRA}`);
  return linhas.join("\n");
}
