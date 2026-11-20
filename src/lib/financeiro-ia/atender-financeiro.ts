import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { diaDaCasa } from "@/lib/dia-da-casa";
import { enviarTexto } from "@/lib/whatsapp/zapi";
import { anotar } from "@/lib/whatsapp/trilha";
import { acharPessoaPeloNumero } from "@/lib/whatsapp/atender-privado";
import {
  gastoSemCategoria,
  lerGastos,
  lerRespostaDeDestino,
  linhaDoGasto,
  pedeDesfazer,
  pedeResumo,
  reais,
  textoDaPergunta,
  type GastoLido,
} from "./interpretar-gasto";
import { lerComIa } from "./ler-com-ia";

// O grupo "financeiro (gastos)": o Guilherme anota CADA gasto ali, e o robô lança.
//
//   "almoço 45, uber 23"      → lança os dois na empresa (o padrão dele)
//   "gasolina 200 pessoal"     → lança como RETIRADA (gasto pessoal)
//   "mercado 310"              → pergunta: pessoal ou empresa?
//   "pessoal"                  → responde a pergunta aberta
//   "desfaz"                   → apaga o último lançamento
//   "resumo"                   → quanto foi no mês, empresa e pessoal
//
// ── Por que não precisa do @ aqui ────────────────────────────────────────
//
// Nos grupos de loja o robô só age marcado, porque ali a conversa é dos outros.
// Este grupo existe pra isto: tudo que o dono escreve é com o robô. Mesmo assim,
// mensagem sem número nenhum (um "bom dia", um comentário) passa em silêncio.
//
// ── Só o dono ───────────────────────────────────────────────────────────
//
// Decisão do Guilherme: a página Pessoal é só dele. Então só a mensagem DELE
// lança — se alguém mais entrar no grupo, o robô não lança gasto em nome do
// Guilherme a partir do celular de outra pessoa.

export interface MensagemFinanceira {
  grupoId: string;
  texto: string;
  telefone: string | null;
  messageId?: string | null;
  agora?: Date;
}

export type DesfechoFinanceiro =
  | { tipo: "nao-e-o-dono" }
  | { tipo: "lancou"; empresa: number; pessoal: number; perguntou: number }
  | { tipo: "respondeu-pendencia"; lancados: number }
  | { tipo: "desfez"; apagados: number }
  | { tipo: "resumo" }
  | { tipo: "nao-entendeu" }
  | { tipo: "silencio" };

async function responder(grupoId: string, texto: string, messageId?: string | null) {
  const r = await enviarTexto(grupoId, texto);
  if (!r.ok) await anotar(messageId, grupoId, "financeiro-nao-enviou", r.erro ?? "");
}

/** Quem escreveu, pelo telefone ou pelo @lid (o WhatsApp esconde o número em parte dos grupos). */
async function quemEscreveu(telefone: string | null) {
  if (!telefone) return null;
  const direto = await acharPessoaPeloNumero(telefone);
  if (direto) return direto;
  const digitos = telefone.replace(/\D/g, "");
  // Lid chega às vezes sem o "@lid": 14 dígitos que não batem com telefone nenhum.
  if (digitos.length >= 13 && !/@/.test(telefone)) return acharPessoaPeloNumero(`${digitos}@lid`);
  return null;
}

// ── A pendência (o "pessoal ou empresa?" em aberto) ──────────────────────

function ehGastoLido(x: unknown): x is GastoLido {
  const g = x as Partial<GastoLido> | null;
  return (
    !!g &&
    typeof g.descricao === "string" &&
    typeof g.valorCents === "number" &&
    g.valorCents > 0 &&
    typeof g.categoriaEmpresa === "string" &&
    typeof g.categoriaPessoal === "string" &&
    (g.empresa === "AGENCIA" || g.empresa === "TREINAMENTOS") &&
    typeof g.dia === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(g.dia)
  );
}

async function lerPendencia(grupoId: string): Promise<GastoLido[]> {
  const p = await prisma.pendenciaFinanceira.findUnique({ where: { grupoId } });
  if (!p || !Array.isArray(p.itens)) return [];
  // JSON do banco é validado, não assumido: item torto é descartado, nunca lançado.
  return (p.itens as unknown[]).filter(ehGastoLido);
}

async function guardarPendencia(grupoId: string, itens: GastoLido[]) {
  if (itens.length === 0) {
    await prisma.pendenciaFinanceira.deleteMany({ where: { grupoId } });
    return;
  }
  const json = itens as unknown as Prisma.InputJsonValue;
  await prisma.pendenciaFinanceira.upsert({
    where: { grupoId },
    create: { grupoId, itens: json },
    update: { itens: json },
  });
}

// ── Lançar ───────────────────────────────────────────────────────────────

const comoData = (dia: string) => new Date(`${dia}T00:00:00Z`);

async function lancar(donoId: string, gastos: GastoLido[], loteId: string) {
  let empresa = 0;
  let pessoal = 0;
  for (const g of gastos) {
    const value = new Prisma.Decimal(g.valorCents).div(100);
    if (g.destino === "pessoal") {
      await prisma.gastoPessoal.create({
        data: {
          donoId,
          empresa: g.empresa,
          description: g.descricao.slice(0, 200),
          category: g.categoriaPessoal,
          value,
          date: comoData(g.dia),
          origem: "robo-whatsapp",
          loteId,
        },
      });
      pessoal++;
    } else if (g.destino === "empresa") {
      await prisma.expense.create({
        data: {
          empresa: g.empresa,
          description: g.descricao.slice(0, 200),
          category: g.categoriaEmpresa,
          value,
          date: comoData(g.dia),
          // Saída anotada é saída que aconteceu: nasce confirmada, igual à da tela.
          paid: true,
          paidDate: comoData(g.dia),
          responsibleId: donoId,
          origem: "robo-whatsapp",
          loteId,
        },
      });
      empresa++;
    }
  }
  try {
    for (const rota of ["/financeiro", "/financeiro/dre", "/financeiro/dfc", "/financeiro/analise", "/financeiro/gastos", "/financeiro/pessoal"]) {
      revalidatePath(rota);
    }
  } catch {
    // Fora de um pedido do Next (teste) não há o que atualizar.
  }
  return { empresa, pessoal };
}

// ── O atendimento ────────────────────────────────────────────────────────

export async function atenderGrupoFinanceiro(
  m: MensagemFinanceira,
  grupo: { donoId: string },
): Promise<DesfechoFinanceiro> {
  const agora = m.agora ?? new Date();
  const hoje = diaDaCasa(agora);

  const pessoa = await quemEscreveu(m.telefone);
  if (!pessoa || pessoa.id !== grupo.donoId) {
    await anotar(m.messageId, m.grupoId, "financeiro-nao-e-o-dono", pessoa ? pessoa.name : "número não reconhecido");
    return { tipo: "nao-e-o-dono" };
  }
  const loteId = m.messageId || `fin-${agora.getTime()}`;
  const pendentes = await lerPendencia(m.grupoId);

  // ── 1. Resposta à pergunta aberta ─────────────────────────────────────
  if (pendentes.length > 0) {
    const destinos = lerRespostaDeDestino(m.texto, pendentes.length);
    if (destinos) {
      const decididos = pendentes.map((g, i) => ({ ...g, destino: destinos[i] }));
      await lancar(grupo.donoId, decididos, loteId);
      await guardarPendencia(m.grupoId, []);
      await anotar(m.messageId, m.grupoId, "financeiro-respondeu", `${decididos.length} lançados`);
      await responder(
        m.grupoId,
        `Lancei:\n${decididos.map((g) => linhaDoGasto(g, hoje)).join("\n")}`,
        m.messageId,
      );
      return { tipo: "respondeu-pendencia", lancados: decididos.length };
    }
  }

  // ── 2. "desfaz" ───────────────────────────────────────────────────────
  if (pedeDesfazer(m.texto)) {
    // A pergunta aberta é a coisa mais recente: desfazer começa por ela.
    if (pendentes.length > 0) {
      await guardarPendencia(m.grupoId, []);
      await responder(
        m.grupoId,
        `Descartei sem lançar:\n${pendentes.map((g) => `• ${g.descricao} — ${reais(g.valorCents)}`).join("\n")}`,
        m.messageId,
      );
      return { tipo: "desfez", apagados: pendentes.length };
    }
    return desfazerUltimo(m, grupo.donoId, agora, hoje);
  }

  // ── 3. "resumo" ───────────────────────────────────────────────────────
  if (pedeResumo(m.texto)) {
    await responder(m.grupoId, await textoDoResumo(grupo.donoId, agora), m.messageId);
    return { tipo: "resumo" };
  }

  // ── 4. Gasto novo ─────────────────────────────────────────────────────
  const leitura = lerGastos(m.texto, hoje);
  let gastos = leitura.gastos;
  const naoEntendi: string[] = [];

  if (leitura.semCerteza.length > 0) {
    const daIa = await lerComIa(leitura.semCerteza, hoje);
    if (daIa) {
      gastos = [...gastos, ...daIa];
    } else {
      // Sem IA: o que tem valor claro entra como "Outros" (e pergunta o destino);
      // o que tem dois números fica pra ele reescrever.
      for (const p of leitura.semCerteza) {
        const g = p.motivo === "sem-categoria" ? gastoSemCategoria(p.texto, hoje) : null;
        if (g) gastos.push(g);
        else naoEntendi.push(p.texto);
      }
    }
  }

  if (gastos.length === 0 && naoEntendi.length === 0) {
    // Sem número nenhum: conversa, não gasto.
    await anotar(m.messageId, m.grupoId, "financeiro-sem-gasto");
    return { tipo: "silencio" };
  }

  const certos = gastos.filter((g) => g.destino !== "duvida");
  const duvidas = gastos.filter((g) => g.destino === "duvida");
  const feitos = await lancar(grupo.donoId, certos, loteId);

  // As dúvidas novas se juntam às antigas: uma pergunta só, numerada, pra tudo.
  const todasAsDuvidas = [...pendentes, ...duvidas];
  if (duvidas.length > 0) await guardarPendencia(m.grupoId, todasAsDuvidas);

  const partes: string[] = [];
  if (certos.length > 0) {
    partes.push(`Lancei:\n${certos.map((g) => linhaDoGasto(g, hoje)).join("\n")}`);
  }
  if (naoEntendi.length > 0) {
    partes.push(
      `Não entendi o valor de: ${naoEntendi.map((t) => `"${t}"`).join(", ")}.\n` +
        "Me manda assim: *café 18* (o que foi e quanto).",
    );
  }
  if (todasAsDuvidas.length > 0) partes.push(textoDaPergunta(todasAsDuvidas));
  if (certos.length > 0) partes.push("Errou? Manda *desfaz*.");

  await anotar(
    m.messageId,
    m.grupoId,
    "financeiro-lancou",
    `empresa=${feitos.empresa} pessoal=${feitos.pessoal} duvida=${duvidas.length} nao-entendi=${naoEntendi.length}`,
  );
  await responder(m.grupoId, partes.join("\n\n"), m.messageId);

  if (gastos.length === 0) return { tipo: "nao-entendeu" };
  return { tipo: "lancou", empresa: feitos.empresa, pessoal: feitos.pessoal, perguntou: duvidas.length };
}

/** Apaga o último lançamento do robô (os dois lados: empresa e pessoal), até 48h depois. */
async function desfazerUltimo(
  m: MensagemFinanceira,
  donoId: string,
  agora: Date,
  hoje: string,
): Promise<DesfechoFinanceiro> {
  const desde = new Date(agora.getTime() - 48 * 60 * 60 * 1000);
  const [e, p] = await Promise.all([
    prisma.expense.findFirst({
      where: { origem: "robo-whatsapp", responsibleId: donoId, loteId: { not: null }, createdAt: { gte: desde } },
      orderBy: { createdAt: "desc" },
      select: { loteId: true, createdAt: true },
    }),
    prisma.gastoPessoal.findFirst({
      where: { origem: "robo-whatsapp", donoId, loteId: { not: null }, createdAt: { gte: desde } },
      orderBy: { createdAt: "desc" },
      select: { loteId: true, createdAt: true },
    }),
  ]);
  const ultimo = !e ? p : !p ? e : e.createdAt >= p.createdAt ? e : p;
  if (!ultimo?.loteId) {
    await responder(m.grupoId, "Não achei lançamento meu das últimas 48 horas pra apagar.", m.messageId);
    return { tipo: "desfez", apagados: 0 };
  }

  const lote = ultimo.loteId;
  const [daEmpresa, pessoais] = await Promise.all([
    prisma.expense.findMany({ where: { loteId: lote, responsibleId: donoId, origem: "robo-whatsapp" } }),
    prisma.gastoPessoal.findMany({ where: { loteId: lote, donoId, origem: "robo-whatsapp" } }),
  ]);
  await prisma.expense.deleteMany({ where: { id: { in: daEmpresa.map((x) => x.id) } } });
  await prisma.gastoPessoal.deleteMany({ where: { id: { in: pessoais.map((x) => x.id) } } });

  const linhas = [
    ...daEmpresa.map((x) => `• ${x.description} — ${reais(Math.round(Number(x.value) * 100))} · Empresa`),
    ...pessoais.map((x) => `• ${x.description} — ${reais(Math.round(Number(x.value) * 100))} · Pessoal`),
  ];
  try {
    for (const rota of ["/financeiro", "/financeiro/dre", "/financeiro/dfc", "/financeiro/gastos", "/financeiro/pessoal"]) revalidatePath(rota);
  } catch {
    // fora do Next
  }
  void hoje;
  await anotar(m.messageId, m.grupoId, "financeiro-desfez", `${linhas.length} apagados`);
  await responder(m.grupoId, `Apaguei:\n${linhas.join("\n")}`, m.messageId);
  return { tipo: "desfez", apagados: linhas.length };
}

/** O mês até hoje: empresa (Agência) e pessoal, com as categorias pessoais que mais pesaram. */
async function textoDoResumo(donoId: string, agora: Date): Promise<string> {
  const hoje = diaDaCasa(agora);
  const [ano, mes] = hoje.split("-").map(Number);
  const de = new Date(Date.UTC(ano, mes - 1, 1));
  const ate = new Date(Date.UTC(ano, mes, 1));

  const [empresa, pessoais] = await Promise.all([
    prisma.expense.aggregate({
      where: { empresa: "AGENCIA", paid: true, date: { gte: de, lt: ate } },
      _sum: { value: true },
      _count: true,
    }),
    prisma.gastoPessoal.groupBy({
      by: ["category"],
      where: { donoId, date: { gte: de, lt: ate } },
      _sum: { value: true },
    }),
  ]);
  const totalEmpresa = Math.round(Number(empresa._sum.value ?? 0) * 100);
  const porCategoria = pessoais
    .map((x) => ({ categoria: x.category, cents: Math.round(Number(x._sum.value ?? 0) * 100) }))
    .sort((a, b) => b.cents - a.cents);
  const totalPessoal = porCategoria.reduce((s, x) => s + x.cents, 0);

  const nomeDoMes = de.toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  const linhas = [
    `*${nomeDoMes.charAt(0).toUpperCase() + nomeDoMes.slice(1)} até hoje*`,
    `Empresa (Agência): *${reais(totalEmpresa)}* em ${empresa._count} ${empresa._count === 1 ? "saída" : "saídas"}`,
    `Pessoal (retiradas): *${reais(totalPessoal)}*`,
  ];
  if (porCategoria.length > 0) {
    linhas.push(
      "",
      "Onde mais foi o pessoal:",
      ...porCategoria
        .slice(0, 5)
        .map((x) => `• ${x.categoria} — ${reais(x.cents)} (${Math.round((x.cents / Math.max(totalPessoal, 1)) * 100)}%)`),
    );
  }
  linhas.push("", "O detalhe com gráfico está no Legacy OS, em Financeiro.");
  return linhas.join("\n");
}
