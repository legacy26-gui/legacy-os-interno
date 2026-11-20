import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { diaDaCasa } from "@/lib/dia-da-casa";
import { getCashFlow } from "@/lib/metrics";
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
import { ehPerguntaDeGasto } from "./interpretar-pergunta";
import { lerSaldoDito, pedeSaldoOuProjecao } from "./interpretar-saldo";
import { projetarFimDoMes, textoDaProjecao } from "./projecao";
import { lerAPagar, lerPagamentoDeConta, pedeListaAPagar } from "./interpretar-a-pagar";
import { classificar, normal } from "./interpretar-gasto";
import { perguntaDeGastoTemAssunto, responderPerguntaDeGasto } from "./responder-gasto";

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
  /**
   * O que foi ouvido, quando a mensagem veio de ÁUDIO. Vai na primeira linha de toda
   * resposta ("🎙️ Ouvi: …"): transcrição erra, e quem falou precisa ver o que o robô
   * entendeu pra poder corrigir com um "desfaz".
   */
  ouvido?: string;
}

export type DesfechoFinanceiro =
  | { tipo: "nao-e-o-dono" }
  | { tipo: "lancou"; empresa: number; pessoal: number; perguntou: number }
  | { tipo: "respondeu-pendencia"; lancados: number }
  | { tipo: "desfez"; apagados: number }
  | { tipo: "resumo" }
  | { tipo: "respondeu-pergunta" }
  | { tipo: "saldo-atualizado" }
  | { tipo: "anotou-a-pagar"; quantas: number }
  | { tipo: "deu-baixa" }
  | { tipo: "listou-a-pagar" }
  | { tipo: "respondeu-saldo" }
  | { tipo: "nao-entendeu" }
  | { tipo: "silencio" };

async function dizer(m: MensagemFinanceira, texto: string, _messageId?: string | null) {
  const grupoId = m.grupoId;
  const messageId = m.messageId;
  const r = await enviarTexto(grupoId, m.ouvido ? `🎙️ Ouvi: _"${m.ouvido.slice(0, 400)}"_\n\n${texto}` : texto);
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
      await dizer(m, `Lancei:\n${decididos.map((g) => linhaDoGasto(g, hoje)).join("\n")}`,
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
      await dizer(m, `Descartei sem lançar:\n${pendentes.map((g) => `• ${g.descricao} — ${reais(g.valorCents)}`).join("\n")}`,
        m.messageId,
      );
      return { tipo: "desfez", apagados: pendentes.length };
    }
    return desfazerUltimo(m, grupo.donoId, agora, hoje);
  }

  // ── 2b. O saldo em caixa dito no grupo ─────────────────────────────────
  //
  // "meu saldo é 12.500" vira o saldo em caixa do Financeiro. Daí em diante cada gasto
  // anotado sai desse saldo e cada entrada confirmada soma (ver getCashFlow).
  const saldoDito = lerSaldoDito(m.texto);
  if (saldoDito?.tipo === "ambiguo") {
    await dizer(m, "Vi mais de um valor aí. Me fala só o saldo, assim: *meu saldo é 12.500*.");
    return { tipo: "nao-entendeu" };
  }
  if (saldoDito?.tipo === "valor") {
    await anotar(m.messageId, m.grupoId, "financeiro-saldo");
    await dizer(m, await atualizarSaldo(saldoDito.cents, saldoDito.treinamentos ? "TREINAMENTOS" : "AGENCIA", agora));
    return { tipo: "saldo-atualizado" };
  }

  // ── 2c. "qual meu saldo?", "como vou fechar o mês?" ─────────────────────
  if (pedeSaldoOuProjecao(m.texto)) {
    await anotar(m.messageId, m.grupoId, "financeiro-projecao");
    const p = await projetarFimDoMes(/\b(treinamento|treinamentos)\b/i.test(m.texto) ? "TREINAMENTOS" : "AGENCIA", agora);
    await dizer(m, textoDaProjecao(p));
    return { tipo: "respondeu-saldo" };
  }

  // ── 2d. O que FALTA pagar ───────────────────────────────────────────────
  //
  // "gastos faltam Andrielli e Brendon 7.500, Tatiana já está paga": NÃO é gasto novo. É
  // conta a pagar, que entra na projeção do fim do mês. Vem antes do leitor de gastos:
  // sem isto a frase inteira virava descrição de um gasto e a pergunta "pessoal ou
  // empresa?" aparecia pra gente da equipe.
  if (pedeListaAPagar(m.texto)) {
    await anotar(m.messageId, m.grupoId, "financeiro-lista-a-pagar");
    await dizer(m, await textoDaListaAPagar(/\b(treinamento|treinamentos)\b/i.test(m.texto) ? "TREINAMENTOS" : "AGENCIA", agora));
    return { tipo: "listou-a-pagar" };
  }
  const aPagar = lerAPagar(m.texto, hoje);
  if (aPagar) {
    if (aPagar.pessoal) {
      await dizer(m, "Conta pessoal a pagar eu ainda não projeto — só as da empresa. Quando pagar, me manda o gasto com a palavra *pessoal*.");
      return { tipo: "nao-entendeu" };
    }
    await anotar(m.messageId, m.grupoId, "financeiro-a-pagar", `${aPagar.itens.length} contas · ${aPagar.jaPagos.length} já pagos`);
    await dizer(m, await anotarAPagar(grupo.donoId, aPagar, loteId, hoje, agora));
    return { tipo: "anotou-a-pagar", quantas: aPagar.itens.length };
  }

  // "paguei a Andrielli": dá baixa na conta a pagar em vez de criar um gasto igual (contaria duas vezes).
  const pagamento = lerPagamentoDeConta(m.texto);
  if (pagamento) {
    const baixa = await darBaixa(grupo.donoId, pagamento, hoje, agora, loteId);
    if (baixa) {
      await anotar(m.messageId, m.grupoId, "financeiro-baixa");
      await dizer(m, baixa);
      return { tipo: "deu-baixa" };
    }
    // Nenhuma conta a pagar com esse nome: é um gasto que saiu e ninguém tinha previsto.
  }

  // ── 3a. "quanto gastei de Uber com o Igor esse mês?" ──────────────────
  //
  // Pergunta com assunto: soma o que foi lançado e responde. Vem ANTES do resumo
  // e do lançamento: "quanto gastei com uber" tem a palavra uber e nenhum valor, e
  // não pode virar um gasto.
  if (ehPerguntaDeGasto(m.texto) && perguntaDeGastoTemAssunto(m.texto, agora)) {
    await anotar(m.messageId, m.grupoId, "financeiro-pergunta");
    await dizer(m, await responderPerguntaDeGasto(grupo.donoId, m.texto, agora), m.messageId);
    return { tipo: "respondeu-pergunta" };
  }

  // ── 3. "resumo" ───────────────────────────────────────────────────────
  if (pedeResumo(m.texto) || ehPerguntaDeGasto(m.texto)) {
    await dizer(m, await textoDoResumo(grupo.donoId, agora), m.messageId);
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
    // Texto sem número é conversa e passa calado. Áudio não: quem falou precisa saber
    // que foi ouvido e que não virou gasto, senão acha que o robô não escutou.
    if (m.ouvido) await dizer(m, "Não achei gasto nisso — se era um, fala o valor (\"almoço 45\").");
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
  await dizer(m, partes.join("\n\n"), m.messageId);

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
    await dizer(m, "Não achei lançamento meu das últimas 48 horas pra apagar.", m.messageId);
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
  await dizer(m, `Apaguei:\n${linhas.join("\n")}`, m.messageId);
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

/**
 * Grava o saldo em caixa, como o formulário da tela faz (`setCashOpeningBalance`): o
 * valor e o dia de hoje. Responde com o que o sistema calculava antes — a diferença é o
 * que ficou sem lançar — e com a projeção do fim do mês.
 *
 * Aplica na hora, sem pedir confirmação: foi o que o Guilherme pediu. A proteção contra
 * número ouvido errado é o eco do "Ouvi" no áudio e o fato de repetir o saldo certo
 * regravar tudo — não há nada a desfazer.
 */
async function atualizarSaldo(cents: number, empresa: "AGENCIA" | "TREINAMENTOS", agora: Date): Promise<string> {
  const hoje = new Date(`${diaDaCasa(agora)}T00:00:00Z`);
  const antes = (await getCashFlow(empresa, hoje, 1)).saldoEmCaixa;
  const nome = empresa === "TREINAMENTOS" ? "Treinamentos" : "Agência";

  await prisma.cashSetting.upsert({
    where: { empresa },
    update: { openingBalance: new Prisma.Decimal(cents).div(100), openingDate: hoje },
    create: { id: empresa.toLowerCase(), empresa, openingBalance: new Prisma.Decimal(cents).div(100), openingDate: hoje },
  });
  try {
    revalidatePath("/financeiro", "layout");
  } catch {
    // fora do Next (teste)
  }

  const linhas = [`Saldo em caixa atualizado: *${reais(cents)}* (${nome}).`];
  if (antes !== null) {
    const dif = cents - Math.round(antes * 100);
    if (Math.abs(dif) >= 1) {
      linhas.push(`Eu calculava ${reais(Math.round(antes * 100))}: ${dif > 0 ? "sobraram" : "faltaram"} ${reais(Math.abs(dif))} em relação ao que foi lançado — vale ver se ficou algum gasto ou entrada sem anotar.`);
    } else {
      linhas.push("Bateu certinho com o que eu calculava. 👍");
    }
  }
  linhas.push("A partir de agora cada gasto que você anotar sai desse saldo, e cada entrada confirmada soma.");
  linhas.push("", textoDaProjecao(await projetarFimDoMes(empresa, agora)));
  return linhas.join("\n");
}

// ── Contas a pagar ────────────────────────────────────────────────────────

const diaMes = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * Anota as contas a pagar como saída NÃO confirmada (`paid: false`): é o que o "A pagar" da
 * Análise e a projeção do fim do mês já somam. Não mexe no saldo, no DRE nem no DFC — só
 * quando for paga (ver `darBaixa`).
 */
async function anotarAPagar(
  donoId: string,
  leitura: ReturnType<typeof lerAPagar> & object,
  loteId: string,
  hoje: string,
  agora: Date,
): Promise<string> {
  const empresa = leitura.treinamentos ? "TREINAMENTOS" : "AGENCIA";
  for (const i of leitura.itens) {
    await prisma.expense.create({
      data: {
        empresa,
        description: i.descricao.slice(0, 200),
        // Gente da equipe: salário. Imposto, software etc. a regra de categorias reconhece.
        category: classificar(i.descricao)?.empresa ?? "Salários",
        value: new Prisma.Decimal(i.cents).div(100),
        date: comoData(i.vence),
        paid: false,
        responsibleId: donoId,
        origem: "robo-whatsapp",
        loteId,
      },
    });
  }
  try {
    for (const rota of ["/financeiro", "/financeiro/dfc", "/financeiro/analise"]) revalidatePath(rota);
  } catch {
    // fora do Next
  }

  const linhas = [
    "Anotei *a pagar* (entra na projeção do mês, ainda não saiu do caixa):",
    ...leitura.itens.map((i) => `• ${i.descricao} — *${reais(i.cents)}* · vence ${diaMes(comoData(i.vence))}`),
  ];
  if (leitura.jaPagos.length > 0) {
    linhas.push("", `Não contei: ${leitura.jaPagos.join(", ")} (já ${leitura.jaPagos.length === 1 ? "pago" : "pagos"}).`);
  }
  linhas.push("", "Quando pagar, manda *paguei andrielli* que eu dou baixa. Errou? Manda *desfaz*.");
  const p = await projetarFimDoMes(empresa, agora);
  if (p.saldoHojeCents !== null) linhas.push("", `O mês fecha com: *${reais(p.fechaEmCents ?? 0)}*  (sem o dia a dia: ${reais(p.semRitmoCents ?? 0)})`);
  void hoje;
  return linhas.join("\n");
}

/** As contas a pagar do mês (e as atrasadas de antes), pra ele ver o que o robô tem anotado. */
async function textoDaListaAPagar(empresa: "AGENCIA" | "TREINAMENTOS", agora: Date): Promise<string> {
  const [ano, mes] = diaDaCasa(agora).split("-").map(Number);
  const fim = new Date(Date.UTC(ano, mes, 1));
  const desde = new Date(Date.UTC(ano, mes - 4, 1));
  const lista = await prisma.expense.findMany({
    where: { empresa, paid: false, date: { gte: desde, lt: fim } },
    orderBy: { date: "asc" },
    take: 40,
  });
  if (lista.length === 0) return "Não tenho nenhuma conta a pagar anotada neste mês. Pra anotar: *faltam andrielli e brendon 7.500*.";
  const total = lista.reduce((s, x) => s + Math.round(Number(x.value) * 100), 0);
  return [
    `*A pagar (${lista.length}):* ${reais(total)}`,
    ...lista.map((x) => `• ${x.description} — ${reais(Math.round(Number(x.value) * 100))} · ${diaMes(x.date)}${x.fixedExpenseId ? " (fixo)" : ""}`),
    "",
    "Pagou? Manda *paguei* e o nome.",
  ].join("\n");
}

/**
 * "paguei a Andrielli": procura a conta a pagar pelo nome e dá baixa.
 *
 *   - valor igual (ou sem valor): a conta vira paga, com a data de HOJE — é hoje que o
 *     dinheiro sai, e é essa data que desconta do saldo;
 *   - valor MENOR: pagamento parcial — vira um gasto pago desse valor e a conta a pagar
 *     diminui o mesmo tanto;
 *   - valor MAIOR: a conta vira paga pelo valor novo;
 *   - mais de uma conta com esse nome: não adivinha, pede o nome inteiro.
 * `null` quando não há conta a pagar com esse nome — aí é um gasto comum.
 */
async function darBaixa(
  donoId: string,
  pg: { termos: string[]; cents: number | null },
  hoje: string,
  agora: Date,
  loteId: string,
): Promise<string | null> {
  const [ano, mes] = diaDaCasa(agora).split("-").map(Number);
  const abertas = await prisma.expense.findMany({
    where: { paid: false, date: { gte: new Date(Date.UTC(ano, mes - 4, 1)), lt: new Date(Date.UTC(ano, mes, 1)) } },
    orderBy: { date: "asc" },
  });
  const casam = abertas.filter((x) => {
    const palheiro = normal(`${x.description} ${x.category}`);
    return pg.termos.every((t) => palheiro.includes(t));
  });
  if (casam.length === 0) return null;
  if (casam.length > 1) {
    return `Achei mais de uma conta a pagar com isso:\n${casam.slice(0, 6).map((x) => `• ${x.description} — ${reais(Math.round(Number(x.value) * 100))}`).join("\n")}\n\nMe manda de novo com o nome inteiro.`;
  }

  const conta = casam[0];
  const devidoCents = Math.round(Number(conta.value) * 100);
  const pagoCents = pg.cents ?? devidoCents;
  const dia = comoData(hoje);
  const nome = conta.description;

  if (pagoCents < devidoCents) {
    await prisma.$transaction([
      prisma.expense.create({
        data: {
          empresa: conta.empresa,
          description: `${nome} (parcial)`.slice(0, 200),
          category: conta.category,
          value: new Prisma.Decimal(pagoCents).div(100),
          date: dia,
          paid: true,
          paidDate: dia,
          responsibleId: donoId,
          origem: "robo-whatsapp",
          loteId,
        },
      }),
      prisma.expense.update({ where: { id: conta.id }, data: { value: new Prisma.Decimal(devidoCents - pagoCents).div(100) } }),
    ]);
    avisarTelas();
    return `Dei baixa de *${reais(pagoCents)}* em ${nome}. Ainda falta *${reais(devidoCents - pagoCents)}* a pagar.`;
  }

  await prisma.expense.update({
    where: { id: conta.id },
    data: { paid: true, paidDate: dia, date: dia, value: new Prisma.Decimal(pagoCents).div(100) },
  });
  avisarTelas();
  return `Dei baixa: *${nome}* — ${reais(pagoCents)} pago. Já saiu do saldo em caixa e entrou no DRE.`;
}

function avisarTelas() {
  try {
    for (const rota of ["/financeiro", "/financeiro/dre", "/financeiro/dfc", "/financeiro/analise", "/financeiro/gastos"]) revalidatePath(rota);
  } catch {
    // fora do Next
  }
}
