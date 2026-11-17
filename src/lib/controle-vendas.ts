// Há quanto tempo cada loja não vende, e quando isso vira alarme.
//
// Sem "server-only": a tela do servidor e qualquer componente de navegador
// precisam do mesmo cálculo, pra não aparecer "há 7 dias" num lugar e "há 8"
// no outro.
//
// Os prazos são do Guilherme:
//   até 6 dias  → verde     (vendendo)
//   7 a 14      → amarelo   (esfriou)
//   15 a 29     → vermelho  (parou)
//   30 ou mais  → vermelho sólido com alerta (abandonou)
export const DIAS_AMARELO = 7;
export const DIAS_VERMELHO = 15;
export const DIAS_CRITICO = 30;

export type TomDaVenda = "verde" | "amarelo" | "vermelho" | "critico";

export interface EstadoDaVenda {
  /** Dias desde a última venda. Sem venda nenhuma, conta desde que virou cliente. */
  dias: number;
  tom: TomDaVenda;
  texto: string;
  /** Verdadeiro quando a loja nunca registrou venda — muda o texto, não a cor. */
  nuncaVendeu: boolean;
}

/** Dias cheios entre duas datas, contados por dia de calendário. */
export function diasEntre(de: Date, ate: Date): number {
  const a = Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate());
  const b = Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function tomPorDias(dias: number): TomDaVenda {
  if (dias >= DIAS_CRITICO) return "critico";
  if (dias >= DIAS_VERMELHO) return "vermelho";
  if (dias >= DIAS_AMARELO) return "amarelo";
  return "verde";
}

/**
 * O estado da loja.
 *
 * `ultimaVenda` nulo = nunca vendeu. Nesse caso a conta parte de quando ela
 * virou cliente (`desde`), e não de uma data fixa: loja que entrou ontem não
 * pode nascer no vermelho por nunca ter vendido ainda.
 */
export function estadoDaVenda(
  ultimaVenda: Date | null,
  desde: Date,
  hoje: Date = new Date()
): EstadoDaVenda {
  const nuncaVendeu = ultimaVenda === null;
  const dias = diasEntre(ultimaVenda ?? desde, hoje);
  const tom = tomPorDias(dias);

  let texto: string;
  if (nuncaVendeu) texto = dias === 0 ? "Entrou hoje, sem venda" : `Sem venda desde que entrou (${dias} dias)`;
  else if (dias === 0) texto = "Vendeu hoje";
  else if (dias === 1) texto = "Vendeu ontem";
  else texto = `há ${dias} dias sem vender`;

  return { dias, tom, texto, nuncaVendeu };
}

// A escada de cores.
//
// A faixa crítica é vermelho SÓLIDO, não preto. Preto parecia a escolha óbvia
// pra "pior que vermelho", mas numa tela escura o preto é a cor do fundo: a
// linha recuava em vez de avançar, e o vermelho de 15 dias parecia mais grave
// que o de 30. Mesma cor, no volume máximo, é o que lê como escalada.
//
// Trocar a escada inteira é mexer nestes quatro blocos e em mais nada: a tela
// não conhece cor nenhuma.
export const ESTILO_DA_LINHA: Record<TomDaVenda, string> = {
  verde: "hover:bg-surface-muted",
  amarelo: "bg-amber-500/10 hover:bg-amber-500/15",
  vermelho: "bg-red-500/20 hover:bg-red-500/25",
  critico: "bg-red-600 hover:bg-red-700 text-white",
};

export const ESTILO_DO_SELO: Record<TomDaVenda, string> = {
  verde: "bg-emerald-500/15 text-emerald-500",
  amarelo: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  vermelho: "bg-red-500/25 text-red-400",
  critico: "bg-white text-red-700 font-bold",
};

export const ROTULO_DO_TOM: Record<TomDaVenda, string> = {
  verde: "Vendendo",
  amarelo: "Esfriou",
  vermelho: "Parou",
  critico: "Abandonou",
};

// Cor do nome da loja e dos textos secundários em cada faixa. Fica aqui junto
// das outras cores pra a tela não precisar saber de nenhuma: trocar a escada
// de cores é mexer num arquivo só.
export const ESTILO_DO_LINK: Record<TomDaVenda, string> = {
  verde: "hover:text-accent",
  amarelo: "hover:text-accent",
  vermelho: "hover:text-accent",
  critico: "text-white",
};

export const ESTILO_SECUNDARIO: Record<TomDaVenda, string> = {
  verde: "text-foreground-muted",
  amarelo: "text-foreground-muted",
  vermelho: "text-foreground-muted",
  critico: "text-red-100",
};

// ─────────────────────── Venda a venda, por dia ───────────────────────────
//
// A tela "Por loja" acima responde "quem parou de vender?". Esta parte serve
// a outra pergunta, que o Guilherme pediu depois: "o que foi vendido, da mais
// recente pra mais antiga, e quanto deu em cada data".
//
// São duas perguntas diferentes e por isso duas abas, não uma tela só: a
// primeira é sobre a LOJA e tem uma linha por loja; esta é sobre a VENDA e
// tem uma linha por venda.
//
// A regra de agrupar mora aqui, pura, pelo mesmo motivo que o resto deste
// arquivo: dá pra testar o total de um dia sem subir banco nem tela.

/** O mínimo que uma venda precisa ter pra entrar na conta de um dia. */
export interface VendaParaAgrupar {
  soldAt: Date;
  /** Em reais. A conversão de Decimal pra número acontece antes de chegar aqui. */
  value: number;
  /** Quanto foi investido em anúncio pra vender aquilo. */
  adSpend: number;
}

export interface DiaDeVendas<V> {
  /** "2026-11-17" — serve de chave de lista e de identidade do dia. */
  chave: string;
  dia: Date;
  qtd: number;
  total: number;
  investido: number;
  vendas: V[];
}

/**
 * Junta as vendas por data, da mais recente pra mais antiga.
 *
 * ── Por que UTC em tudo ──────────────────────────────────────────────────
 *
 * Porque `soldAt` é `@db.Date`: uma data sem hora, que chega aqui como
 * meia-noite UTC. Ler o dia pelo fuso de quem está olhando faria a venda do
 * dia 17 aparecer no dia 16 pra quem está em Brasília — e o total de um dia
 * cairia no dia anterior. `formatDate` já imprime em UTC pelo mesmo motivo;
 * a chave daqui tem que combinar com ela.
 *
 * ── Por que ordenar aqui dentro ──────────────────────────────────────────
 *
 * O banco já devolve ordenado, mas quem lê esta função não deveria precisar
 * saber disso pra confiar no resultado. A ordenação é estável, então a ordem
 * que o chamador escolheu DENTRO de um mesmo dia (a mais recém-lançada
 * primeiro) é preservada.
 */
export function agruparPorDia<V extends VendaParaAgrupar>(
  vendas: V[],
): DiaDeVendas<V>[] {
  const porDia = new Map<string, DiaDeVendas<V>>();

  for (const v of [...vendas].sort(
    (a, b) => b.soldAt.getTime() - a.soldAt.getTime(),
  )) {
    const chave = v.soldAt.toISOString().slice(0, 10);
    let dia = porDia.get(chave);
    if (!dia) {
      dia = { chave, dia: v.soldAt, qtd: 0, total: 0, investido: 0, vendas: [] };
      porDia.set(chave, dia);
    }
    dia.qtd += 1;
    dia.total += v.value;
    dia.investido += v.adSpend;
    dia.vendas.push(v);
  }

  // O Map guarda a ordem de inserção, e a inserção já veio ordenada.
  return [...porDia.values()];
}

/** O total do período inteiro: o que vai na faixa de cima. */
export function somarVendas(vendas: VendaParaAgrupar[]) {
  const total = vendas.reduce((s, v) => s + v.value, 0);
  const investido = vendas.reduce((s, v) => s + v.adSpend, 0);
  return {
    qtd: vendas.length,
    total,
    investido,
    // Ticket médio e custo por venda só existem com venda: dividir por zero
    // daria Infinity na tela, que não é número nenhum.
    ticket: vendas.length > 0 ? total / vendas.length : null,
    custoPorVenda: vendas.length > 0 ? investido / vendas.length : null,
  };
}

/**
 * A faixa de `soldAt` que corresponde a um intervalo da tela.
 *
 * ── O defeito que isto evita ─────────────────────────────────────────────
 *
 * O seletor de período é o mesmo do Meta Ads, e lá o intervalo é ancorado ao
 * MEIO-DIA UTC — de propósito, pra somar e subtrair dias não escorregar na
 * hora do horário de verão (ver hojeUTC em meta/insights.ts).
 *
 * Mas `soldAt` é `@db.Date`: data pura, que chega e volta como MEIA-NOITE
 * UTC. Usar o intervalo cru no `where` compararia meia-noite com meio-dia, e
 * a venda do primeiro dia da faixa ficaria de fora — a de HOJE, inclusive,
 * em "Hoje" e em "7 dias". A tela não acusaria nada: mostraria uma venda a
 * menos, calada, justamente a mais recente.
 *
 * Então os dois extremos descem pra meia-noite do próprio dia. Como `soldAt`
 * está sempre exatamente na meia-noite, `gte` e `lte` pegam os dois dias
 * inteiros.
 *
 * Devolve `{}` quando não há começo nem fim ("vida inteira"), pra espalhar
 * direto no `where` sem condicional na tela.
 */
export function faixaDeDatas(intervalo: {
  de: Date | null;
  ate: Date | null;
}): { gte?: Date; lte?: Date } {
  const chao = (d: Date) =>
    new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
    );
  const faixa: { gte?: Date; lte?: Date } = {};
  if (intervalo.de) faixa.gte = chao(intervalo.de);
  if (intervalo.ate) faixa.lte = chao(intervalo.ate);
  return faixa;
}
