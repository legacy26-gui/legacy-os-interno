import "server-only";

import { prisma } from "@/lib/prisma";
import { diaDaCasaComoData, segundaDaSemana } from "@/lib/dia-da-casa";
import type { Role } from "@/generated/prisma/enums";

// Indicadores internos: quem fez o quê, no período.
//
// ── As regras do Guilherme ──────────────────────────────────────────────
//
//   - Só ele e a Andrielli veem (a tela confere com veTodaACarteira).
//   - Placar POR FUNÇÃO, não nota única: gestora de tráfego se compara com gestora de tráfego.
//     Uma nota única somaria "lojas conferidas" com "gravações entregues" e premiaria quem faz
//     a tarefa mais numerosa, não quem trabalha mais.
//   - Só na tela (nada vai pro WhatsApp).
//
// ── De onde vêm os números ──────────────────────────────────────────────
//
// Só do que o sistema JÁ registra com o nome de quem fez: conferência do Meu Dia, revisão
// escrita, relatório enviado, ação no Meta (anúncio subido, pausa, texto), venda lançada, resgate,
// pedido de verba, arte do Studio, etapa de implantação, gravação, tarefa, anotação na ficha.
// O que é feito fora do sistema (ligação, conversa no grupo sem o robô) não aparece — a tela diz
// isso, pra ninguém ler "zero" como "não trabalhou".
//
// ── Fuso ────────────────────────────────────────────────────────────────
//
// O período é em dias da casa (America/Sao_Paulo, UTC-3 sem horário de verão). Coluna de DATA
// (o dia da conferência) compara com meia-noite UTC daquele dia; coluna de HORÁRIO (criadoEm)
// compara com a meia-noite de Brasília, que é 03:00 UTC.

export type ChaveDoPeriodo = "semana" | "semana-passada" | "mes" | "mes-passado";

export const PERIODOS: { chave: ChaveDoPeriodo; rotulo: string }[] = [
  { chave: "semana", rotulo: "Esta semana" },
  { chave: "semana-passada", rotulo: "Semana passada" },
  { chave: "mes", rotulo: "Este mês" },
  { chave: "mes-passado", rotulo: "Mês passado" },
];

export interface Periodo {
  chave: ChaveDoPeriodo;
  rotulo: string;
  /** Meia-noite UTC do primeiro dia (pra coluna de data). */
  de: Date;
  /** Meia-noite UTC do dia SEGUINTE ao último (exclusivo). */
  ate: Date;
  /** Os mesmos limites em horário de Brasília (pra coluna de data e hora). */
  deHora: Date;
  ateHora: Date;
  /** Dias de segunda a sexta dentro do período, até hoje. */
  diasUteis: number;
}

const DIA = 86_400_000;
const BRASILIA = 3 * 3_600_000;

/** Dias de segunda a sexta em [de, ate). Pura. */
export function contarDiasUteis(de: Date, ate: Date): number {
  let n = 0;
  for (let t = de.getTime(); t < ate.getTime(); t += DIA) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) n++;
  }
  return n;
}

/** O período pedido, contado em dias da casa. Pura (dado o "agora"). */
export function montarPeriodo(chave: string | undefined, agora: Date = new Date()): Periodo {
  const valida = PERIODOS.find((p) => p.chave === chave) ?? PERIODOS[0];
  const hoje = diaDaCasaComoData(agora);
  const amanha = new Date(hoje.getTime() + DIA);
  let de: Date, ate: Date;
  if (valida.chave === "semana") {
    de = segundaDaSemana(agora);
    ate = amanha;
  } else if (valida.chave === "semana-passada") {
    ate = segundaDaSemana(agora);
    de = new Date(ate.getTime() - 7 * DIA);
  } else if (valida.chave === "mes") {
    de = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
    ate = amanha;
  } else {
    ate = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
    de = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));
  }
  return {
    chave: valida.chave,
    rotulo: valida.rotulo,
    de,
    ate,
    deHora: new Date(de.getTime() + BRASILIA),
    ateHora: new Date(ate.getTime() + BRASILIA),
    diasUteis: contarDiasUteis(de, ate.getTime() < amanha.getTime() ? ate : amanha),
  };
}

// ─────────────────────────────── As métricas ───────────────────────────────

export type ChaveDaMetrica =
  | "carteira"
  | "ritmo"
  | "conferidas"
  | "revisoes"
  | "semanais"
  | "relatorios"
  | "anuncios"
  | "acoesMeta"
  | "vendas"
  | "resgates"
  | "verbas"
  | "artes"
  | "artesRevisadas"
  | "aprovados"
  | "etapas"
  | "gravacoes"
  | "entregas"
  | "tarefas"
  | "anotacoes";

export interface Metrica {
  chave: ChaveDaMetrica;
  rotulo: string;
  /** O que o número quer dizer, pra quem passa o mouse (e pra ninguém ler errado). */
  explica: string;
  /** Porcentagem (0–100) em vez de contagem. */
  porcento?: boolean;
  /** Contexto, não esforço: não entra no "quem mais fez". */
  contexto?: boolean;
}

export const METRICAS: Record<ChaveDaMetrica, Metrica> = {
  carteira: { chave: "carteira", rotulo: "Lojas", explica: "Lojas na carteira da pessoa hoje (sem as canceladas).", contexto: true },
  ritmo: {
    chave: "ritmo",
    rotulo: "Ritmo do Meu Dia",
    explica: "Conferências feitas ÷ (lojas da carteira × dias úteis do período). 100% = conferiu todas as lojas todos os dias úteis.",
    porcento: true,
    contexto: true,
  },
  conferidas: { chave: "conferidas", rotulo: "Conferências", explica: "Caixinhas marcadas no Meu Dia (uma por loja por dia)." },
  revisoes: { chave: "revisoes", rotulo: "Revisões escritas", explica: "Revisões diárias com observação escrita na ficha da loja." },
  semanais: { chave: "semanais", rotulo: "Revisões semanais", explica: "Revisões semanais preenchidas." },
  relatorios: { chave: "relatorios", rotulo: "Relatórios", explica: "Relatórios semanais marcados como enviados pela pessoa." },
  anuncios: { chave: "anuncios", rotulo: "Anúncios subidos", explica: "Anúncios criados pelo sistema (tela ou WhatsApp) a pedido da pessoa." },
  acoesMeta: { chave: "acoesMeta", rotulo: "Ações no Meta", explica: "Pausar, ligar, mudar texto ou verba pelo sistema (fora os anúncios subidos)." },
  vendas: { chave: "vendas", rotulo: "Vendas lançadas", explica: "Vendas registradas pela pessoa no Controle de Vendas." },
  resgates: { chave: "resgates", rotulo: "Resgates", explica: "Ações de resgate de loja parada registradas." },
  verbas: { chave: "verbas", rotulo: "Pedidos de verba", explica: "Pedidos de verba enviados pra loja." },
  artes: { chave: "artes", rotulo: "Artes", explica: "Artes criadas no Legacy Studio." },
  artesRevisadas: { chave: "artesRevisadas", rotulo: "Artes revisadas", explica: "Artes do Studio aprovadas ou devolvidas pra correção." },
  aprovados: { chave: "aprovados", rotulo: "Relatórios decididos", explica: "Relatórios da fila de aprovação decididos (mandar ou segurar)." },
  etapas: { chave: "etapas", rotulo: "Etapas de implantação", explica: "Etapas de implantação de loja nova concluídas." },
  gravacoes: { chave: "gravacoes", rotulo: "Gravações", explica: "Gravações registradas (data da gravação no período)." },
  entregas: { chave: "entregas", rotulo: "Entregas", explica: "Gravações marcadas como entregues no período." },
  tarefas: { chave: "tarefas", rotulo: "Tarefas", explica: "Tarefas finalizadas no período." },
  anotacoes: { chave: "anotacoes", rotulo: "Anotações", explica: "Anotações feitas no histórico das fichas das lojas." },
};

export type Funcao = "trafego" | "gerencia" | "direcao";

export const FUNCOES: { chave: Funcao; rotulo: string; principais: ChaveDaMetrica[] }[] = [
  {
    chave: "trafego",
    rotulo: "Gestão de tráfego",
    principais: ["carteira", "ritmo", "conferidas", "revisoes", "relatorios", "anuncios", "acoesMeta", "vendas", "resgates"],
  },
  { chave: "gerencia", rotulo: "Gerência", principais: ["aprovados", "etapas", "gravacoes", "entregas", "artesRevisadas", "tarefas"] },
  { chave: "direcao", rotulo: "Direção", principais: [] },
];

export const funcaoDoCargo = (role: Role): Funcao => (role === "GESTOR_TRAFEGO" ? "trafego" : role === "GERENTE" ? "gerencia" : "direcao");

export interface LinhaDaPessoa {
  id: string;
  nome: string;
  cargo: string | null;
  funcao: Funcao;
  valores: Record<ChaveDaMetrica, number>;
}

export interface PlacarDaFuncao {
  funcao: Funcao;
  rotulo: string;
  colunas: Metrica[];
  pessoas: LinhaDaPessoa[];
  /** Por coluna: o maior valor (pra destacar quem lidera). 0 = ninguém. */
  lider: Partial<Record<ChaveDaMetrica, number>>;
  /** Quem mais fez no período, somando só as colunas de esforço desta função. */
  destaque: { id: string; nome: string; total: number } | null;
}

const ZERO = (): Record<ChaveDaMetrica, number> =>
  Object.fromEntries(Object.keys(METRICAS).map((k) => [k, 0])) as Record<ChaveDaMetrica, number>;

/** "Ritmo": conferências ÷ (lojas × dias úteis), de 0 a 100. Pura. */
export function ritmoDoMeuDia(conferidas: number, lojas: number, diasUteis: number): number {
  const esperado = lojas * diasUteis;
  return esperado > 0 ? Math.min(100, Math.round((conferidas / esperado) * 100)) : 0;
}

/**
 * Monta o placar de cada função: as colunas principais da função, mais qualquer outra em que
 * alguém daquela função tenha feito algo (a gestora que também faz arte aparece com "Artes").
 * Pura.
 */
export function montarPlacares(linhas: LinhaDaPessoa[]): PlacarDaFuncao[] {
  const placares: PlacarDaFuncao[] = [];
  for (const f of FUNCOES) {
    const pessoas = linhas.filter((l) => l.funcao === f.chave);
    if (pessoas.length === 0) continue;
    const extras = (Object.keys(METRICAS) as ChaveDaMetrica[]).filter(
      (k) => !f.principais.includes(k) && !METRICAS[k].contexto && pessoas.some((p) => p.valores[k] > 0),
    );
    const colunas = [...f.principais, ...extras].map((k) => METRICAS[k]);
    if (colunas.length === 0) continue;
    const esforco = colunas.filter((c) => !c.contexto);
    const total = (p: LinhaDaPessoa) => esforco.reduce((s, c) => s + p.valores[c.chave], 0);
    // Quem mais fez primeiro; empate, pelo ritmo; depois, pelo nome.
    pessoas.sort((a, b) => total(b) - total(a) || b.valores.ritmo - a.valores.ritmo || a.nome.localeCompare(b.nome));
    const lider: Partial<Record<ChaveDaMetrica, number>> = {};
    for (const c of colunas) lider[c.chave] = Math.max(0, ...pessoas.map((p) => p.valores[c.chave]));
    const primeiro = pessoas[0];
    placares.push({
      funcao: f.chave,
      rotulo: f.rotulo,
      colunas,
      pessoas,
      lider,
      destaque: primeiro && total(primeiro) > 0 && pessoas.length > 1 ? { id: primeiro.id, nome: primeiro.nome, total: total(primeiro) } : null,
    });
  }
  return placares;
}

// ─────────────────────────────── As consultas ───────────────────────────────

type Contagem = { chave: string | null; n: number }[];
const porPessoa = (linhas: { _count: { _all: number } }[], campo: string): Contagem =>
  linhas.map((l) => ({ chave: (l as unknown as Record<string, string | null>)[campo], n: l._count._all }));

/** Os números de cada pessoa ativa da casa no período. */
export async function indicadoresDaEquipe(periodo: Periodo): Promise<LinhaDaPessoa[]> {
  const { de, ate, deHora, ateHora } = periodo;
  const hora = { gte: deHora, lt: ateHora };

  const [
    pessoas,
    carteiras,
    conferidas,
    revisoes,
    semanais,
    relatorios,
    anuncios,
    acoesMeta,
    vendas,
    resgates,
    verbas,
    artes,
    artesRevisadas,
    aprovados,
    etapas,
    gravacoes,
    entregas,
    tarefas,
    anotacoes,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true, employee: { select: { position: true } } },
    }),
    prisma.client.groupBy({ by: ["managerId"], where: { status: { not: "CANCELADO" }, managerId: { not: null } }, _count: { _all: true } }),
    prisma.clienteConferido.groupBy({ by: ["quemId"], where: { dia: { gte: de, lt: ate }, quemId: { not: null } }, _count: { _all: true } }),
    prisma.dailyReview.groupBy({ by: ["reviewerId"], where: { createdAt: hora, reviewerId: { not: null }, notes: { not: null } }, _count: { _all: true } }),
    prisma.weeklyReview.groupBy({ by: ["reviewerId"], where: { createdAt: hora, reviewerId: { not: null } }, _count: { _all: true } }),
    prisma.relatorioEnviado.groupBy({ by: ["quemId"], where: { enviadoEm: hora, quemId: { not: null } }, _count: { _all: true } }),
    prisma.metaAcao.groupBy({
      by: ["quemId"],
      where: { criadoEm: hora, quemId: { not: null }, ok: true, origem: "criacao-rascunho", nivel: "anuncio" },
      _count: { _all: true },
    }),
    prisma.metaAcao.groupBy({
      by: ["quemId"],
      where: { criadoEm: hora, quemId: { not: null }, ok: true, origem: { not: "criacao-rascunho" } },
      _count: { _all: true },
    }),
    prisma.clientSale.groupBy({ by: ["createdById"], where: { createdAt: hora, createdById: { not: null } }, _count: { _all: true } }),
    prisma.acaoDeResgate.groupBy({ by: ["quemId"], where: { quando: hora, quemId: { not: null } }, _count: { _all: true } }),
    prisma.pedidoDeVerba.groupBy({ by: ["enviadoPorId"], where: { enviadoEm: hora, enviadoPorId: { not: null } }, _count: { _all: true } }),
    prisma.studioArte.groupBy({ by: ["criadoPorId"], where: { criadoEm: hora, criadoPorId: { not: null } }, _count: { _all: true } }),
    prisma.studioArte.groupBy({ by: ["revisadoPorId"], where: { revisadoEm: hora, revisadoPorId: { not: null } }, _count: { _all: true } }),
    prisma.relatorioParaAprovar.groupBy({ by: ["decididoPorId"], where: { decididoEm: hora, decididoPorId: { not: null } }, _count: { _all: true } }),
    prisma.onboardingEtapa.groupBy({ by: ["concluidoPorId"], where: { concluidoEm: hora, concluidoPorId: { not: null } }, _count: { _all: true } }),
    prisma.gravacao.groupBy({ by: ["ownerId"], where: { gravadoEm: hora, ownerId: { not: null } }, _count: { _all: true } }),
    prisma.gravacao.groupBy({ by: ["ownerId"], where: { entregueEm: hora, ownerId: { not: null } }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ["assigneeId"], where: { status: "FINALIZADO", updatedAt: hora, assigneeId: { not: null } }, _count: { _all: true } }),
    prisma.clientHistory.groupBy({ by: ["authorId"], where: { createdAt: hora, authorId: { not: null } }, _count: { _all: true } }),
  ]);

  const linhas = new Map<string, LinhaDaPessoa>();
  for (const p of pessoas) {
    linhas.set(p.id, { id: p.id, nome: p.name, cargo: p.employee?.position ?? null, funcao: funcaoDoCargo(p.role), valores: ZERO() });
  }
  const somar = (contagem: Contagem, chave: ChaveDaMetrica) => {
    for (const c of contagem) if (c.chave && linhas.has(c.chave)) linhas.get(c.chave)!.valores[chave] += c.n;
  };
  somar(porPessoa(carteiras, "managerId"), "carteira");
  somar(porPessoa(conferidas, "quemId"), "conferidas");
  somar(porPessoa(revisoes, "reviewerId"), "revisoes");
  somar(porPessoa(semanais, "reviewerId"), "semanais");
  somar(porPessoa(relatorios, "quemId"), "relatorios");
  somar(porPessoa(anuncios, "quemId"), "anuncios");
  somar(porPessoa(acoesMeta, "quemId"), "acoesMeta");
  somar(porPessoa(vendas, "createdById"), "vendas");
  somar(porPessoa(resgates, "quemId"), "resgates");
  somar(porPessoa(verbas, "enviadoPorId"), "verbas");
  somar(porPessoa(artes, "criadoPorId"), "artes");
  somar(porPessoa(artesRevisadas, "revisadoPorId"), "artesRevisadas");
  somar(porPessoa(aprovados, "decididoPorId"), "aprovados");
  somar(porPessoa(etapas, "concluidoPorId"), "etapas");
  somar(porPessoa(gravacoes, "ownerId"), "gravacoes");
  somar(porPessoa(entregas, "ownerId"), "entregas");
  somar(porPessoa(tarefas, "assigneeId"), "tarefas");
  somar(porPessoa(anotacoes, "authorId"), "anotacoes");

  for (const l of linhas.values()) l.valores.ritmo = ritmoDoMeuDia(l.valores.conferidas, l.valores.carteira, periodo.diasUteis);

  // Quem não tem carteira nem fez nada no período não entra (usuário de teste, conta parada).
  return [...linhas.values()].filter((l) => Object.entries(l.valores).some(([k, v]) => k !== "ritmo" && v > 0));
}
