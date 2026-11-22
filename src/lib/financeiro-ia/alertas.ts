import "server-only";

import { prisma } from "@/lib/prisma";
import { diaDaCasa } from "@/lib/dia-da-casa";
import { getDreMonth } from "@/lib/metrics";
import type { Empresa } from "@/generated/prisma/client";
import { projetarFimDoMes } from "./projecao";
import { normal, reais, type GastoLido } from "./interpretar-gasto";

// Financeiro, passo 2: o robô que AVISA, em vez de só anotar.
//
// ── O que ele vigia ─────────────────────────────────────────────────────
//
//   1. Gasto fora do padrão — um lançamento bem acima do normal da categoria (na hora, junto do "Lancei").
//   2. Categoria que passou da média — o mês já gastou mais que a média dos 3 meses anteriores
//      (na hora, só no lançamento que CRUZA a média: avisar a cada gasto seguinte seria ruído).
//   3. Retirada acima do lucro — o pessoal tirou mais do que a empresa lucrou.
//   4. Conta perto do vencimento — fixo ou conta a pagar vencendo hoje/amanhã, e o que atrasou.
//   5. O mês fechando no vermelho — pela projeção do caixa.
//   + Ideias de onde economizar: o que mais cresceu e o gasto miúdo que se repete.
//
// ── O que ele NÃO faz ───────────────────────────────────────────────────
//
// Não mexe em dinheiro nenhum: só lê e escreve no grupo do dono. As regras são em código, com
// limites fixos (abaixo) — nada de IA decidindo o que é "muito". Gasto fixo (salário, aluguel)
// fica fora das médias de categoria e do "fora do padrão": ele cai todo no começo do mês e faria
// a categoria "estourar" no dia 5 de todo mês.

/** Um lançamento, do jeito que as regras precisam. */
export interface Lanc {
  dia: string;
  cents: number;
  categoria: string;
  descricao: string;
  fixo: boolean;
  loteId: string | null;
}

/** Limites das regras. Fixos de propósito: o mesmo gasto tem que dar o mesmo aviso. */
export const LIMITES = {
  /** "Fora do padrão": pelo menos isso de lançamentos na categoria pra saber o que é normal. */
  minimoDeHistorico: 5,
  /** …e o valor tem que ser N vezes a mediana… */
  vezesAMediana: 3,
  /** …e pelo menos isto acima dela (R$ 50), pra café de R$ 15 não virar alarme. */
  folgaMinimaCents: 5_000,
  /** Média de categoria abaixo disto (R$ 100/mês) não gera aviso. */
  mediaMinimaCents: 10_000,
  /** "No ritmo de passar": a partir deste dia do mês e projetando isto da média. */
  diaDoRitmo: 10,
  ritmoSobreAMedia: 1.3,
  /** Gasto miúdo que se repete: a partir de N vezes no mês. */
  repeticoes: 6,
  /** Conta "vencendo": hoje e os próximos N dias. */
  diasAntesDoVencimento: 1,
};

const DIA_MS = 86_400_000;
const somarDias = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * DIA_MS).toISOString().slice(0, 10);
const inicioDoMes = (iso: string, delta = 0) => {
  const [a, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + delta, 1)).toISOString().slice(0, 10);
};
const diasNoMes = (iso: string) => {
  const [a, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
};
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const curto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const nomeDoMes = (iso: string) => new Date(`${iso.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });

// ─────────────────────────────── Regras puras ───────────────────────────────

export function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
}

/** O valor está fora do padrão da categoria? `null` = normal (ou sem histórico pra saber). Pura. */
export function foraDoPadrao(cents: number, anteriores: number[]): { medianaCents: number; vezes: number } | null {
  if (anteriores.length < LIMITES.minimoDeHistorico) return null;
  const med = mediana(anteriores);
  if (med <= 0) return null;
  if (cents < med * LIMITES.vezesAMediana || cents - med < LIMITES.folgaMinimaCents) return null;
  return { medianaCents: med, vezes: Math.round(cents / med) };
}

/** A média mensal de uma categoria nos 3 meses antes do mês de `hoje` (sem os fixos). `null` = pouco histórico. Pura. */
export function mediaDaCategoria(lancs: Lanc[], categoria: string, hoje: string): number | null {
  const meses = [inicioDoMes(hoje, -3), inicioDoMes(hoje, -2), inicioDoMes(hoje, -1)];
  const totais = meses.map((de, i) => {
    const ate = i < 2 ? meses[i + 1] : inicioDoMes(hoje);
    return lancs.filter((l) => !l.fixo && l.categoria === categoria && l.dia >= de && l.dia < ate).reduce((s, l) => s + l.cents, 0);
  });
  // Precisa de pelo menos 2 dos 3 meses com gasto: categoria nova não tem "média".
  if (totais.filter((t) => t > 0).length < 2) return null;
  const media = Math.round(totais.reduce((s, t) => s + t, 0) / 3);
  return media >= LIMITES.mediaMinimaCents ? media : null;
}

export interface CategoriaAcima {
  categoria: string;
  atualCents: number;
  mediaCents: number;
  projetadoCents: number;
  /** "passou": o mês já gastou mais que a média inteira. "ritmo": ainda não, mas vai, no ritmo atual. */
  tipo: "passou" | "ritmo";
}

/** As categorias do mês de `hoje` acima da média (ou no ritmo de passar). Pura. */
export function categoriasAcimaDaMedia(lancs: Lanc[], hoje: string): CategoriaAcima[] {
  const de = inicioDoMes(hoje);
  const dia = Number(hoje.slice(8, 10));
  const doMes = lancs.filter((l) => !l.fixo && l.dia >= de && l.dia <= hoje);
  const categorias = [...new Set(doMes.map((l) => l.categoria))];
  const r: CategoriaAcima[] = [];
  for (const categoria of categorias) {
    const media = mediaDaCategoria(lancs, categoria, hoje);
    if (media === null) continue;
    const atual = doMes.filter((l) => l.categoria === categoria).reduce((s, l) => s + l.cents, 0);
    const projetado = Math.round((atual / Math.max(dia, 1)) * diasNoMes(hoje));
    if (atual > media) r.push({ categoria, atualCents: atual, mediaCents: media, projetadoCents: projetado, tipo: "passou" });
    else if (dia >= LIMITES.diaDoRitmo && projetado >= media * LIMITES.ritmoSobreAMedia) {
      r.push({ categoria, atualCents: atual, mediaCents: media, projetadoCents: projetado, tipo: "ritmo" });
    }
  }
  return r.sort((a, b) => (b.tipo === "passou" ? 1 : 0) - (a.tipo === "passou" ? 1 : 0) || b.atualCents - b.mediaCents - (a.atualCents - a.mediaCents));
}

/** O gasto miúdo que se repete no mês ("uber" 14 vezes). Agrupa pela primeira palavra da descrição. Pura. */
export function gastosQueSeRepetem(lancs: Lanc[], hoje: string): { nome: string; vezes: number; totalCents: number }[] {
  const de = inicioDoMes(hoje);
  const grupos = new Map<string, { nome: string; vezes: number; totalCents: number }>();
  for (const l of lancs) {
    if (l.fixo || l.dia < de || l.dia > hoje) continue;
    const chave = normal(l.descricao).split(" ").find((p) => p.length >= 3 && !/^\d/.test(p));
    if (!chave) continue;
    const g = grupos.get(chave) ?? { nome: l.descricao.split(/\s+/)[0], vezes: 0, totalCents: 0 };
    g.vezes++;
    g.totalCents += l.cents;
    grupos.set(chave, g);
  }
  return [...grupos.values()].filter((g) => g.vezes >= LIMITES.repeticoes).sort((a, b) => b.totalCents - a.totalCents);
}

// ─────────────────────────────── As consultas ───────────────────────────────

const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Lançamentos da empresa (só os que saíram) ou do pessoal do dono, de `de` até `ate` (exclusivo). */
async function carregar(fonte: { empresa: Empresa } | { donoId: string }, de: string, ate: string): Promise<Lanc[]> {
  const periodo = { gte: new Date(`${de}T00:00:00Z`), lt: new Date(`${ate}T00:00:00Z`) };
  if ("empresa" in fonte) {
    const r = await prisma.expense.findMany({
      where: { empresa: fonte.empresa, paid: true, date: periodo },
      select: { date: true, value: true, category: true, description: true, fixedExpenseId: true, loteId: true },
      take: 20_000,
    });
    return r.map((x) => ({ dia: iso(x.date), cents: cents(x.value), categoria: x.category, descricao: x.description, fixo: !!x.fixedExpenseId, loteId: x.loteId }));
  }
  const r = await prisma.gastoPessoal.findMany({
    where: { donoId: fonte.donoId, date: periodo },
    select: { date: true, value: true, category: true, description: true, loteId: true },
    take: 20_000,
  });
  return r.map((x) => ({ dia: iso(x.date), cents: cents(x.value), categoria: x.category, descricao: x.description, fixo: false, loteId: x.loteId }));
}

/**
 * O aviso que vai JUNTO do "Lancei": gasto fora do padrão e categoria que acabou de passar da média.
 * Lê o histórico de cada fonte uma vez. Devolve linhas prontas (vazio = nada a dizer).
 */
export async function avisosDoLancamento(donoId: string, lancados: GastoLido[], loteId: string, agora: Date = new Date()): Promise<string[]> {
  if (lancados.length === 0) return [];
  const hoje = diaDaCasa(agora);
  const de = inicioDoMes(hoje, -3);
  const ate = somarDias(hoje, 1);
  const cache = new Map<string, Promise<Lanc[]>>();
  const fonteDe = (g: GastoLido) => (g.destino === "pessoal" ? `p:${donoId}` : `e:${g.empresa}`);
  const historico = (g: GastoLido) => {
    const k = fonteDe(g);
    if (!cache.has(k)) cache.set(k, carregar(g.destino === "pessoal" ? { donoId } : { empresa: g.empresa }, de, ate));
    return cache.get(k)!;
  };

  const linhas: string[] = [];
  const jaAvisada = new Set<string>();
  for (const g of lancados) {
    if (g.destino !== "pessoal" && g.destino !== "empresa") continue;
    const categoria = g.destino === "pessoal" ? g.categoriaPessoal : g.categoriaEmpresa;
    const todos = await historico(g);
    const antes = todos.filter((l) => l.loteId !== loteId);

    // 1. O lançamento, contra os 90 dias anteriores da mesma categoria.
    const anteriores = antes.filter((l) => !l.fixo && l.categoria === categoria && l.dia >= somarDias(hoje, -90)).map((l) => l.cents);
    const fora = foraDoPadrao(g.valorCents, anteriores);
    if (fora) {
      linhas.push(
        `⚠️ *${g.descricao}* (${reais(g.valorCents)}) está ${fora.vezes}x acima do normal em ${categoria}${g.destino === "pessoal" ? " (pessoal)" : ""}: costuma ser uns ${reais(fora.medianaCents)}.`,
      );
    }

    // 2. A categoria cruzou a média do mês COM este lote (só avisa uma vez: no lançamento que cruza).
    const chave = `${fonteDe(g)}|${categoria}`;
    if (jaAvisada.has(chave)) continue;
    const media = mediaDaCategoria(todos, categoria, hoje);
    if (media === null) continue;
    const doMes = (ls: Lanc[]) => ls.filter((l) => !l.fixo && l.categoria === categoria && l.dia >= inicioDoMes(hoje) && l.dia <= hoje).reduce((s, l) => s + l.cents, 0);
    const depois = doMes(todos);
    if (doMes(antes) <= media && depois > media) {
      jaAvisada.add(chave);
      linhas.push(
        `📈 ${categoria}${g.destino === "pessoal" ? " (pessoal)" : ""} já passou da média: ${reais(depois)} em ${nomeDoMes(hoje)}, contra ${reais(media)} por mês nos últimos 3 meses.`,
      );
    }
  }
  return linhas;
}

export interface ContaVencendo {
  descricao: string;
  cents: number;
  vence: string;
  empresa: Empresa;
  imposto: boolean;
}

/** Contas da empresa ainda não pagas: atrasadas (até 60 dias) e vencendo de hoje a amanhã. */
export async function contasVencendo(agora: Date = new Date()): Promise<{ atrasadas: ContaVencendo[]; vencendo: ContaVencendo[] }> {
  const hoje = diaDaCasa(agora);
  const r = await prisma.expense.findMany({
    where: {
      paid: false,
      date: { gte: new Date(`${somarDias(hoje, -60)}T00:00:00Z`), lt: new Date(`${somarDias(hoje, LIMITES.diasAntesDoVencimento + 1)}T00:00:00Z`) },
    },
    select: { description: true, value: true, date: true, empresa: true, category: true },
    orderBy: { date: "asc" },
    take: 200,
  });
  const contas = r.map((x) => ({ descricao: x.description, cents: cents(x.value), vence: iso(x.date), empresa: x.empresa, imposto: /imposto|das\b|simples|inss|fgts|iss\b|darf/i.test(`${x.category} ${x.description}`) }));
  return { atrasadas: contas.filter((c) => c.vence < hoje), vencendo: contas.filter((c) => c.vence >= hoje) };
}

const linhaDaConta = (c: ContaVencendo, hoje: string) =>
  `• ${c.imposto ? "🧾 " : ""}${c.descricao} — *${reais(c.cents)}* (${c.vence === hoje ? "vence hoje" : c.vence === somarDias(hoje, 1) ? "vence amanhã" : c.vence < hoje ? `venceu ${curto(c.vence)}` : `vence ${curto(c.vence)}`}${c.empresa === "TREINAMENTOS" ? ", Treinamentos" : ""})`;

/** O aviso diário de vencimentos. `null` = nada vencendo nem atrasado. */
export async function textoDosVencimentos(agora: Date = new Date()): Promise<string | null> {
  const hoje = diaDaCasa(agora);
  const { atrasadas, vencendo } = await contasVencendo(agora);
  if (atrasadas.length === 0 && vencendo.length === 0) return null;
  const partes: string[] = ["⏰ *Contas da empresa*"];
  if (vencendo.length) partes.push(`Vencendo:\n${vencendo.map((c) => linhaDaConta(c, hoje)).join("\n")}`);
  if (atrasadas.length) partes.push(`Ainda em aberto (já venceu):\n${atrasadas.map((c) => linhaDaConta(c, hoje)).join("\n")}`);
  partes.push("Pagou? Manda *paguei* + o nome da conta, que eu dou baixa.");
  return partes.join("\n\n");
}

/**
 * Retirada x lucro de um mês (empresa). `null` = sem retirada, retirada dentro do lucro, ou mês sem receita
 * confirmada nenhuma (sem receita lançada não dá pra falar de lucro: seria alarme falso todo começo de mês).
 */
async function retiradaAcimaDoLucro(empresa: Empresa, mesIso: string): Promise<{ retiradaCents: number; lucroCents: number } | null> {
  const dre = await getDreMonth(empresa, new Date(`${mesIso}T12:00:00Z`));
  if (dre.receitaConfirmada <= 0) return null;
  const retirada = Math.round(dre.retiradas * 100);
  const lucro = Math.round(dre.lucroLiquido * 100);
  return retirada > 0 && retirada > lucro ? { retiradaCents: retirada, lucroCents: lucro } : null;
}

/**
 * Tudo o que merece atenção agora: o que o resumo semanal e o comando "alertas" mostram.
 * `semana` = incluir o que saiu nos últimos 7 dias (o resumo de segunda).
 */
export async function textoDosAlertas(donoId: string, agora: Date = new Date(), opcoes: { semana?: boolean } = {}): Promise<string> {
  const hoje = diaDaCasa(agora);
  const mesAtual = inicioDoMes(hoje);
  const mesPassado = inicioDoMes(hoje, -1);
  const de = inicioDoMes(hoje, -3);
  const ate = somarDias(hoje, 1);

  const [empresa, pessoal, projecao, retiradaMesPassado, retiradaMesAtual, vencimentos] = await Promise.all([
    carregar({ empresa: "AGENCIA" }, de, ate),
    carregar({ donoId }, de, ate),
    projetarFimDoMes("AGENCIA", agora),
    retiradaAcimaDoLucro("AGENCIA", mesPassado),
    // O mês corrente só depois do dia 15: antes disso a receita do mês ainda está entrando.
    Number(hoje.slice(8, 10)) >= 15 ? retiradaAcimaDoLucro("AGENCIA", mesAtual) : Promise.resolve(null),
    contasVencendo(agora),
  ]);

  const partes: string[] = [];

  if (opcoes.semana) {
    const seteAtras = somarDias(hoje, -7);
    const daSemana = (ls: Lanc[]) => ls.filter((l) => l.dia >= seteAtras && l.dia < hoje);
    const se = daSemana(empresa), sp = daSemana(pessoal);
    const total = (ls: Lanc[]) => ls.reduce((s, l) => s + l.cents, 0);
    const topo = (ls: Lanc[]) => {
      const m = new Map<string, number>();
      for (const l of ls) m.set(l.categoria, (m.get(l.categoria) ?? 0) + l.cents);
      return [...m].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => `${c} ${reais(v)}`).join(" · ");
    };
    partes.push(
      `🗓️ *Semana de ${curto(seteAtras)} a ${curto(somarDias(hoje, -1))}*\n` +
        `• Empresa: *${reais(total(se))}*${se.length ? ` (${topo(se)})` : ""}\n` +
        `• Pessoal: *${reais(total(sp))}*${sp.length ? ` (${topo(sp)})` : ""}`,
    );
  }

  // O mês fechando no vermelho, pela projeção do caixa.
  if (projecao.fechaEmCents !== null && projecao.fechaEmCents < 0) {
    partes.push(`🔴 Pelo ritmo de agora, o caixa da empresa fecha ${nomeDoMes(hoje)} *negativo em ${reais(-projecao.fechaEmCents)}*. Manda *saldo* pra ver a conta.`);
  }

  // Categorias acima da média.
  const acima = [
    ...categoriasAcimaDaMedia(empresa, hoje).map((c) => ({ ...c, lado: "empresa" })),
    ...categoriasAcimaDaMedia(pessoal, hoje).map((c) => ({ ...c, lado: "pessoal" })),
  ];
  if (acima.length) {
    partes.push(
      `📈 *Acima da média* (${nomeDoMes(hoje)} × média dos 3 meses anteriores):\n` +
        acima
          .slice(0, 6)
          .map((c) =>
            c.tipo === "passou"
              ? `• ${c.categoria}${c.lado === "pessoal" ? " (pessoal)" : ""}: ${reais(c.atualCents)} — já passou da média de ${reais(c.mediaCents)}`
              : `• ${c.categoria}${c.lado === "pessoal" ? " (pessoal)" : ""}: ${reais(c.atualCents)} até agora; no ritmo, fecha em ${reais(c.projetadoCents)} (média ${reais(c.mediaCents)})`,
          )
          .join("\n"),
    );
  }

  // Retirada acima do lucro.
  const ret: string[] = [];
  if (retiradaMesPassado) {
    ret.push(`• ${nomeDoMes(mesPassado)}: retiradas de ${reais(retiradaMesPassado.retiradaCents)} contra lucro de ${reais(retiradaMesPassado.lucroCents)} — ${reais(retiradaMesPassado.retiradaCents - retiradaMesPassado.lucroCents)} saíram do caixa da empresa.`);
  }
  if (retiradaMesAtual) {
    ret.push(`• ${nomeDoMes(hoje)} até agora: retiradas de ${reais(retiradaMesAtual.retiradaCents)} contra lucro de ${reais(retiradaMesAtual.lucroCents)} (o mês ainda não fechou; recebimentos podem mudar isso).`);
  }
  if (ret.length) partes.push(`💸 *Retirada acima do lucro*\n${ret.join("\n")}`);

  // Contas.
  const proximas = opcoes.semana ? await contasDaSemana(agora) : vencimentos.vencendo;
  if (proximas.length || vencimentos.atrasadas.length) {
    const linhas = [...vencimentos.atrasadas.map((c) => linhaDaConta(c, hoje)), ...proximas.map((c) => linhaDaConta(c, hoje))];
    partes.push(`⏰ *Contas ${opcoes.semana ? "da semana" : "vencendo"}*\n${linhas.slice(0, 10).join("\n")}${linhas.length > 10 ? `\n…e mais ${linhas.length - 10}` : ""}`);
  }

  // Ideias de onde economizar.
  const ideias: string[] = [];
  const cresceu = acima.filter((c) => c.tipo === "passou").sort((a, b) => b.atualCents - b.mediaCents - (a.atualCents - a.mediaCents))[0];
  if (cresceu) {
    ideias.push(`• ${cresceu.categoria}${cresceu.lado === "pessoal" ? " (pessoal)" : ""} está ${reais(cresceu.atualCents - cresceu.mediaCents)} acima do normal. Segurar até o fim do mês é a economia mais rápida.`);
  }
  for (const r of [...gastosQueSeRepetem(pessoal, hoje), ...gastosQueSeRepetem(empresa, hoje)].slice(0, 2)) {
    ideias.push(`• ${r.nome}: ${plural(r.vezes, "vez", "vezes")} este mês (${reais(r.totalCents)}). Cortar pela metade sobra uns ${reais(Math.round(r.totalCents / 2))}.`);
  }
  if (ideias.length) partes.push(`💡 *Onde dá pra economizar*\n${ideias.join("\n")}`);

  if (partes.length === (opcoes.semana ? 1 : 0)) {
    partes.push("✅ Nada fora do normal: categorias dentro da média, sem conta atrasada e sem retirada acima do lucro.");
  }
  return partes.join("\n\n");
}

/** As contas que vencem de hoje até o próximo domingo (o resumo de segunda). */
async function contasDaSemana(agora: Date): Promise<ContaVencendo[]> {
  const hoje = diaDaCasa(agora);
  const r = await prisma.expense.findMany({
    where: { paid: false, date: { gte: new Date(`${hoje}T00:00:00Z`), lt: new Date(`${somarDias(hoje, 7)}T00:00:00Z`) } },
    select: { description: true, value: true, date: true, empresa: true, category: true },
    orderBy: { date: "asc" },
    take: 50,
  });
  return r.map((x) => ({ descricao: x.description, cents: cents(x.value), vence: iso(x.date), empresa: x.empresa, imposto: /imposto|das\b|simples|inss|fgts|iss\b|darf/i.test(`${x.category} ${x.description}`) }));
}

/** "alertas", "onde economizar", "dicas de economia", "o que está fora do normal?" */
export function pedeAlertas(texto: string): boolean {
  const t = normal(texto).replace(/[?!.]/g, "").trim();
  return (
    /^(alertas?|avisos?|dicas?|ideias?)$/.test(t) ||
    /\b(onde|como|o que) (eu )?(posso |da pra |dar pra |devo )?(economizar|cortar|reduzir)\b/.test(t) ||
    /\b(dicas?|ideias?) (de|pra|para) (economia|economizar|cortar gastos?)\b/.test(t) ||
    /\b(fora do (normal|padrao)|algum alerta|tem alerta)\b/.test(t)
  );
}
