// Os números da campanha: gasto, lead, custo por lead.
//
// Arquivo puro de propósito (sem banco, sem rede): é aqui que mora a conta, e
// conta que se testa é conta em que se confia. O que vem da Meta é texto e
// vem torto de várias formas — campo faltando, número como string, lista de
// ações que não existe — e tudo isso é tratado aqui, num lugar só.
//
// ── Por que os nomes não são os do Gerenciador ────────────────────────────
//
// A Meta chama de "resultado" o que cada conta configurou como resultado. Duas
// lojas podem ter "resultado" significando coisas diferentes. Aqui o nome é
// sempre o que o número É: lead é a ação que a conta marcou como lead, gasto é
// gasto, clique no link é clique no link.

/** Quantos dias de histórico o sistema guarda e busca. */
export const DIAS_DE_INSIGHT = 30;

/** O período padrão da tela: a última semana, como no Gerenciador. */
export const DIAS_PADRAO = 7;

/** Períodos que a tela oferece. "tudo" é a vida inteira da conta. */
export const PERIODOS = [7, 14, 30] as const;
export type Periodo = (typeof PERIODOS)[number];

// ──────────────────────── O período da tela ────────────────────────────────
//
// Um intervalo com começo e fim, e não mais "quantos dias atrás". Porque
// "do dia 5 ao dia 12" não cabe em número de dias, e porque é assim que se
// pergunta de verdade: ninguém quer saber dos "últimos 14 dias", quer saber
// da quinzena, do mês passado, da semana da campanha de fim de ano.
//
// `de` e `ate` são meio-dia UTC, a mesma âncora das datas gravadas. Meio-dia
// e não meia-noite porque fuso horário num campo de data faz o dia 5 virar o
// dia 4 em algum lugar do caminho.

export interface Intervalo {
  /** `null` em "vida inteira": não há começo, é tudo que existe. */
  de: Date | null;
  ate: Date | null;
  /** Como aparece escrito na tela. */
  rotulo: string;
  /** Como vai na URL (`?periodo=...`). */
  chave: string;
  /** Vida inteira vem da outra tabela: um total por anúncio, não um por dia. */
  vidaInteira: boolean;
}

/** Os atalhos, na ordem em que aparecem. */
export const ATALHOS = [
  "hoje",
  "ontem",
  "7",
  "14",
  "30",
  "mes",
  "mes-passado",
  "tudo",
] as const;
export type Atalho = (typeof ATALHOS)[number];

export const ROTULO_DO_ATALHO: Record<Atalho, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7": "7 dias",
  "14": "14 dias",
  "30": "30 dias",
  mes: "Este mês",
  "mes-passado": "Mês passado",
  tudo: "Vida inteira",
};

/**
 * O fuso em que as lojas vivem e em que a Meta fecha o dia delas.
 *
 * Fixo, e não lido da conta de anúncio: todas as lojas da carteira estão no
 * Brasil. No dia em que houver uma fora, isto vira um campo da conta — e o
 * lugar de mexer é este, que é o único que decide que dia é "hoje".
 */
const FUSO_DAS_LOJAS = "America/Sao_Paulo";

function meioDia(ano: number, mes: number, dia: number) {
  return new Date(Date.UTC(ano, mes, dia, 12));
}

/**
 * Hoje, pelo calendário de Brasília — guardado como meio-dia UTC.
 *
 * ── O defeito que isto conserta ──────────────────────────────────────────
 *
 * Isto lia o dia do relógio UTC. E o gasto é gravado na data do fuso da
 * CONTA DE ANÚNCIO, que nas lojas é America/Sao_Paulo, UTC−3.
 *
 * Das 21h de Brasília em diante o UTC já virou o dia seguinte. Então quem
 * abrisse a tela às 21h30 e clicasse em "Hoje" estava pedindo o gasto de
 * AMANHÃ — e a tela esvaziava inteira, sem erro nenhum, como se a loja não
 * tivesse gastado nada no dia. Três horas por noite, todas as noites.
 *
 * O "meio-dia" continua: guardar a data no meio do dia é o que impede que
 * somar e subtrair dias caia na hora do horário de verão e ande um dia.
 */
function hojeUTC(agora = new Date()) {
  // en-CA dá "2026-11-14", que é o formato que dá pra fatiar sem ambiguidade.
  const [ano, mes, dia] = agora
    .toLocaleDateString("en-CA", { timeZone: FUSO_DAS_LOJAS })
    .split("-")
    .map(Number);
  return meioDia(ano, mes - 1, dia);
}

function somarDias(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** "2026-11-05" → data, ou null se não for data de verdade. */
export function dataDoTexto(texto: string | undefined | null): Date | null {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const [ano, mes, dia] = texto.split("-").map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = meioDia(ano, mes - 1, dia);
  // Confere que a data existe mesmo: 31 de fevereiro vira 3 de março, e aí
  // o mês não bate.
  return d.getUTCMonth() === mes - 1 ? d : null;
}

/** Data → "2026-11-05", pro campo do formulário e pra Graph API. */
export function textoDaData(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "5 de nov" / "5 de nov de 2025" quando o ano não é o de agora. */
export function diaCurto(d: Date, agora = new Date()): string {
  const mesmoAno = d.getUTCFullYear() === agora.getUTCFullYear();
  return d.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    ...(mesmoAno ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

function doAtalho(a: Atalho, agora: Date): Intervalo {
  const hoje = hojeUTC(agora);
  const rotulo = ROTULO_DO_ATALHO[a];

  if (a === "tudo")
    return { de: null, ate: null, rotulo, chave: a, vidaInteira: true };
  if (a === "hoje")
    return { de: hoje, ate: hoje, rotulo, chave: a, vidaInteira: false };
  if (a === "ontem") {
    const o = somarDias(hoje, -1);
    return { de: o, ate: o, rotulo, chave: a, vidaInteira: false };
  }
  if (a === "mes") {
    return {
      de: meioDia(agora.getUTCFullYear(), agora.getUTCMonth(), 1),
      ate: hoje,
      rotulo,
      chave: a,
      vidaInteira: false,
    };
  }
  if (a === "mes-passado") {
    const primeiroDesteMes = meioDia(
      agora.getUTCFullYear(),
      agora.getUTCMonth(),
      1,
    );
    const ultimoDoPassado = somarDias(primeiroDesteMes, -1);
    return {
      de: meioDia(
        ultimoDoPassado.getUTCFullYear(),
        ultimoDoPassado.getUTCMonth(),
        1,
      ),
      ate: ultimoDoPassado,
      rotulo,
      chave: a,
      vidaInteira: false,
    };
  }
  // 7, 14, 30: inclui hoje, então 7 dias é hoje e os 6 anteriores.
  const n = Number(a);
  return {
    de: somarDias(hoje, -(n - 1)),
    ate: hoje,
    rotulo,
    chave: a,
    vidaInteira: false,
  };
}

/**
 * Os últimos `n` dias COMPLETOS: de anteontem-e-tanto até ontem.
 *
 * Hoje fica fora de propósito. Serve pra calcular ritmo de gasto, e um dia que
 * ainda está acontecendo tem sempre menos gasto do que vai ter — incluí-lo
 * puxaria a média pra baixo e faria o saldo parecer durar mais do que dura.
 * Para a conta que importa aqui, errar pra baixo é o lado perigoso.
 */
export function janelaDeDias(
  n: number,
  agora = new Date(),
): { de: Date; ate: Date } {
  const ontem = somarDias(hojeUTC(agora), -1);
  return { de: somarDias(ontem, -(n - 1)), ate: ontem };
}

/**
 * Lê o período da URL.
 *
 * Datas soltas (`de`/`ate`) ganham do atalho: se a pessoa escolheu um
 * intervalo à mão, é esse que vale. Data inválida cai no padrão em vez de
 * quebrar a tela — endereço se edita à mão e se compartilha torto.
 */
export function lerIntervalo(
  busca: { periodo?: string; de?: string; ate?: string },
  agora = new Date(),
): Intervalo {
  const de = dataDoTexto(busca.de);
  const ate = dataDoTexto(busca.ate);

  if (de && ate) {
    // Invertido é engano de digitação, não erro: troca e segue.
    const [inicio, fim] = de <= ate ? [de, ate] : [ate, de];
    return {
      de: inicio,
      ate: fim,
      rotulo:
        inicio.getTime() === fim.getTime()
          ? diaCurto(inicio, agora)
          : `${diaCurto(inicio, agora)} a ${diaCurto(fim, agora)}`,
      chave: "",
      vidaInteira: false,
    };
  }

  const atalho =
    ATALHOS.find((a) => a === busca.periodo) ?? String(DIAS_PADRAO);
  return doAtalho(atalho as Atalho, agora);
}

/**
 * Tipos de "lead" que aparecem nas contas de loja de carro.
 *
 * Qual deles vale é configuração DA CONTA, não do sistema: uma loja roda
 * campanha de WhatsApp, outra de formulário, e somar as duas coisas como se
 * fossem a mesma daria um custo por lead que não quer dizer nada.
 */
/**
 * O que conta como RESULTADO em cada conta.
 *
 * ── Por que isto é escolhido por conta, e não fixo ───────────────────────
 *
 * Porque "resultado" não quer dizer a mesma coisa em todas as lojas. Numa
 * revenda de carro é conversa aberta no WhatsApp; numa loja que vende pelo
 * site é compra. A Meta devolve TODAS as ações de cada anúncio, e quem
 * decide qual delas é a que importa é o cadastro da conta.
 *
 * ── A compra estava faltando, e sumia o número sem avisar ────────────────
 *
 * A lista tinha cinco tipos e os cinco eram de lead. A Rustic vende pelo
 * site: o resultado dela é compra, e não havia nem como configurar isso. O
 * número aparecia zerado — não "não configurado", zerado — como se a loja não
 * tivesse vendido nada.
 *
 * ── Qual compra escolher ─────────────────────────────────────────────────
 *
 * No Gerenciador, a coluna "Resultados" de uma campanha otimizada pra compra
 * com Pixel diz "Website purchases", que é o
 * `offsite_conversion.fb_pixel_purchase`. É esse o certo pra venda no site.
 *
 * `omni_purchase` é a soma que a Meta faz de todas as origens — site, app,
 * loja física. Fica como segunda opção porque conta a mesma venda uma vez
 * só quando ela chega por dois caminhos; usar os dois juntos contaria duas
 * vezes, e por isso é um OU, não uma soma.
 */
/**
 * `forca` ordena o palpite do sistema, e NÃO a lista da tela.
 *
 * ── Por que a quantidade não serve pra decidir ───────────────────────────
 *
 * Porque clique sempre ganha de conversão, por ordem de grandeza. Na
 * primeira versão o palpite era "o tipo que mais apareceu", e numa loja com
 * 412 compras e 9.800 cliques ele sugeriu contar CLIQUE — que faria a loja
 * parecer ter 9.800 resultados e o custo por resultado despencar pra um
 * número lindo e mentiroso.
 *
 * Então a ordem é por valor pro negócio: compra ganha de lead, lead ganha de
 * checkout iniciado, e clique só entra quando não há mais nada. A quantidade
 * só desempata entre tipos da mesma força.
 */
export const TIPOS_DE_LEAD: { valor: string; rotulo: string; forca: number }[] =
  [
    {
      valor: "onsite_conversion.messaging_conversation_started_7d",
      rotulo: "Conversa iniciada no WhatsApp/Direct",
      forca: 3,
    },
    { valor: "lead", rotulo: "Formulário de cadastro (Lead Ads)", forca: 3 },
    {
      valor: "onsite_conversion.lead_grouped",
      rotulo: "Lead (agrupado pela Meta)",
      forca: 3,
    },
    {
      valor: "offsite_conversion.fb_pixel_lead",
      rotulo: "Lead no site (Pixel)",
      forca: 3,
    },
    {
      valor: "offsite_conversion.fb_pixel_purchase",
      rotulo: "Compra no site (Pixel)",
      forca: 4,
    },
    {
      valor: "omni_purchase",
      rotulo: "Compra (somando todas as origens)",
      forca: 4,
    },
    {
      valor: "offsite_conversion.fb_pixel_initiate_checkout",
      rotulo: "Checkout iniciado no site (Pixel)",
      forca: 2,
    },
    {
      valor: "link_click",
      rotulo: "Clique no link (quando não há conversão)",
      forca: 1,
    },
  ];

export function rotuloDoTipoDeLead(valor: string): string {
  return TIPOS_DE_LEAD.find((t) => t.valor === valor)?.rotulo ?? valor;
}

// ─────────────────────── O que a Meta devolve ──────────────────────────────

/** Uma linha crua de /insights, com tudo que pode faltar como opcional. */
export interface LinhaCrua {
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: { action_type?: string; value?: string }[];
  date_start?: string;
  date_stop?: string;
}

export interface LinhaLimpa {
  adId: string;
  adName: string;
  adsetId: string;
  adsetName: string;
  campaignId: string | null;
  campaignName: string | null;
  /** Só a data, meio-dia UTC: a Meta fecha o dado por dia, sem hora. */
  date: Date;
  spendCents: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  leads: number;
}

/**
 * Texto da Meta → número inteiro.
 *
 * Tudo vem como string ("1234", "12.34") e qualquer campo pode faltar. Campo
 * que falta é zero: a Meta omite o que não aconteceu.
 */
function inteiro(texto: string | undefined): number {
  if (!texto) return 0;
  const n = Number(texto);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * Gasto em centavos.
 *
 * A Meta manda "1234.56" — ponto decimal, sempre, independente do idioma da
 * conta. Multiplicar por 100 e arredondar na hora de converter evita o
 * centavo que some quando se soma float depois.
 */
export function gastoEmCentavos(spend: string | undefined): number {
  if (!spend) return 0;
  const n = Number(spend);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Quantas vezes a ação configurada como lead aconteceu. */
export function contarLeads(
  actions: LinhaCrua["actions"],
  tipoDeLead: string,
): number {
  if (!actions?.length) return 0;
  return actions
    .filter((a) => a.action_type === tipoDeLead)
    .reduce((soma, a) => soma + inteiro(a.value), 0);
}

/**
 * Tudo que a Meta devolveu de ação nesta resposta, somado por tipo.
 *
 * É o que permite dizer, depois, se o zero na tela é "a loja não vendeu" ou
 * "o tipo configurado é o errado". Sem guardar isto, os dois são o mesmo zero
 * — e o segundo passa meses sem ninguém perceber, que foi o que aconteceu
 * com uma loja que vende pelo site e estava configurada como conversa no
 * WhatsApp.
 *
 * Guarda só os tipos com alguma ocorrência: a Meta devolve dezenas de tipos
 * por anúncio e a maioria vem zerada.
 */
export function somarAcoesPorTipo(linhas: LinhaCrua[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const l of linhas) {
    for (const a of l.actions ?? []) {
      if (!a.action_type) continue;
      const n = inteiro(a.value);
      if (n <= 0) continue;
      total[a.action_type] = (total[a.action_type] ?? 0) + n;
    }
  }
  return total;
}

/**
 * O tipo que mais apareceu, tirando o que já está configurado.
 *
 * Serve pra sugerir na tela: "a Meta está devolvendo 412 compras no site e
 * nenhuma conversa iniciada — era isso que você queria contar?". Só sugere
 * tipo que o sistema sabe contar; sugerir um que não está na lista seria
 * apontar pra uma opção que não existe no seletor.
 *
 * Escolhe pela FORÇA e não pela quantidade — ver o comentário da lista. E
 * nunca sugere clique: clique é o fundo do poço da lista, só aceitável como
 * escolha consciente de quem configurou, nunca como palpite do sistema.
 */
export function tipoQueTalvezSejaOCerto(
  vistas: Record<string, number>,
  configurado: string,
): { valor: string; rotulo: string; quantas: number } | null {
  const candidatos = TIPOS_DE_LEAD.filter(
    (t) => t.valor !== configurado && (vistas[t.valor] ?? 0) > 0,
  ).sort(
    (a, b) =>
      b.forca - a.forca || (vistas[b.valor] ?? 0) - (vistas[a.valor] ?? 0),
  );

  const melhor = candidatos[0];
  if (!melhor) return null;
  // Palpite de clique não se dá: contar clique como resultado faz a loja
  // parecer ter dez mil resultados e o custo por resultado virar centavos.
  // Se é isso que a loja quer, que seja escolhido na mão.
  if (melhor.forca <= 1) return null;
  return {
    valor: melhor.valor,
    rotulo: melhor.rotulo,
    quantas: vistas[melhor.valor] ?? 0,
  };
}

/** A ação configurada apareceu nesta resposta? Serve pra avisar na tela. */
export function temOTipoDeLead(
  linhas: LinhaCrua[],
  tipoDeLead: string,
): boolean {
  return linhas.some((l) =>
    l.actions?.some((a) => a.action_type === tipoDeLead),
  );
}

/**
 * Limpa uma resposta de /insights.
 *
 * Linha sem adset_id ou sem data é descartada: sem os dois não dá pra gravar
 * (é a chave da tabela) e inventar um valor ali seria pior que perder a linha.
 */
export function limparLinhas(
  linhas: LinhaCrua[],
  tipoDeLead: string,
): LinhaLimpa[] {
  const limpas: LinhaLimpa[] = [];
  for (const l of linhas) {
    if (!l.ad_id || !l.adset_id || !l.date_start) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date_start)) continue;
    const [ano, mes, dia] = l.date_start.split("-").map(Number);
    limpas.push({
      adId: l.ad_id,
      adName: l.ad_name ?? l.ad_id,
      adsetId: l.adset_id,
      adsetName: l.adset_name ?? l.adset_id,
      campaignId: l.campaign_id ?? null,
      campaignName: l.campaign_name ?? null,
      date: new Date(Date.UTC(ano, mes - 1, dia, 12)),
      spendCents: gastoEmCentavos(l.spend),
      impressions: inteiro(l.impressions),
      reach: inteiro(l.reach),
      clicks: inteiro(l.clicks),
      linkClicks: inteiro(l.inline_link_clicks),
      leads: contarLeads(l.actions, tipoDeLead),
    });
  }
  return limpas;
}

// ──────────────────────────── Vida inteira ─────────────────────────────────
//
// O acumulado desde que a campanha nasceu. Vem da Meta com
// `date_preset=maximum` e SEM `time_increment`: um total por anúncio, não um
// por dia. Pedir dia a dia a vida inteira seriam anos de linha pra somar
// sempre tudo, por um número que só se olha de vez em quando.
//
// Limite que a Meta impõe e não dá pra contornar: campanha APAGADA some. O
// que ela chama de "máximo" é o máximo do que ainda existe na conta.

export interface VidaInteira {
  adId: string;
  adName: string;
  adsetId: string;
  adsetName: string;
  campaignId: string | null;
  campaignName: string | null;
  spendCents: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  leads: number;
  desde: Date | null;
  ate: Date | null;
}

function comoData(texto: string | undefined): Date | null {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const [ano, mes, dia] = texto.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, 12));
}

export function limparVidaInteira(
  linhas: LinhaCrua[],
  tipoDeLead: string,
): VidaInteira[] {
  const limpas: VidaInteira[] = [];
  for (const l of linhas) {
    if (!l.ad_id || !l.adset_id) continue;
    limpas.push({
      adId: l.ad_id,
      adName: l.ad_name ?? l.ad_id,
      adsetId: l.adset_id,
      adsetName: l.adset_name ?? l.adset_id,
      campaignId: l.campaign_id ?? null,
      campaignName: l.campaign_name ?? null,
      spendCents: gastoEmCentavos(l.spend),
      impressions: inteiro(l.impressions),
      reach: inteiro(l.reach),
      clicks: inteiro(l.clicks),
      linkClicks: inteiro(l.inline_link_clicks),
      leads: contarLeads(l.actions, tipoDeLead),
      desde: comoData(l.date_start),
      ate: comoData(l.date_stop),
    });
  }
  return limpas;
}

// ───────────────────────────── As contas ───────────────────────────────────

export interface Numeros {
  spendCents: number;
  impressions: number;
  /** Pessoas alcançadas. Impressões conta VEZES; isto conta gente. */
  reach: number;
  clicks: number;
  linkClicks: number;
  leads: number;
}

export const ZERO: Numeros = {
  spendCents: 0,
  impressions: 0,
  reach: 0,
  clicks: 0,
  linkClicks: 0,
  leads: 0,
};

export function somar(linhas: Numeros[]): Numeros {
  return linhas.reduce(
    (t, l) => ({
      spendCents: t.spendCents + l.spendCents,
      impressions: t.impressions + l.impressions,
      // Alcance NÃO se soma de verdade — a mesma pessoa pode estar em dois
      // conjuntos, e somando ela conta duas vezes. A Meta só sabe o número
      // certo no nível que ela mesma calculou. Somamos porque é a melhor
      // aproximação que temos, e a tela chama de "alcance somado" pra não
      // prometer exatidão que não existe.
      reach: t.reach + l.reach,
      clicks: t.clicks + l.clicks,
      linkClicks: t.linkClicks + l.linkClicks,
      leads: t.leads + l.leads,
    }),
    { ...ZERO },
  );
}

/**
 * Custo por lead, em centavos.
 *
 * `null` quando não houve lead — e não zero, e não infinito. Gastar R$ 800 e
 * não ter lead nenhum não é "custo zero por lead": é não ter custo por lead,
 * porque não houve lead. A tela mostra "—" e o gasto do lado, que é a
 * informação verdadeira e a que assusta na hora certa.
 */
export function custoPorLead(n: Numeros): number | null {
  return n.leads > 0 ? Math.round(n.spendCents / n.leads) : null;
}

/** Cliques no link ÷ impressões, em %. `null` sem impressão nenhuma. */
export function ctr(n: Numeros): number | null {
  return n.impressions > 0 ? (n.linkClicks / n.impressions) * 100 : null;
}

// ── As colunas que o Gerenciador mostra e aqui faltavam ──────────────────
//
// Nenhuma delas custa chamada nova: gasto, impressões, alcance e cliques já
// vêm na varredura, e as três abaixo são conta em cima disso. Faltavam na
// tela, não no banco.
//
// Todas devolvem null em vez de zero quando não dá pra calcular. Zero é um
// número — "custou zero por clique" — e é mentira quando o que houve foi
// "não teve clique nenhum". O traço na tela diz a verdade: não há o que
// dividir.

/** Custo por mil impressões, em centavos. */
export function cpm(n: Numeros): number | null {
  return n.impressions > 0 ? (n.spendCents / n.impressions) * 1000 : null;
}

/**
 * Custo por clique no link, em centavos.
 *
 * No clique NO LINK e não em `clicks`: `clicks` da Meta conta qualquer toque
 * no anúncio — curtida, ver mais, abrir a foto, tocar no nome da página. Um
 * CPC calculado em cima disso sai barato e não quer dizer nada sobre quanta
 * gente foi parar na conversa.
 */
export function cpc(n: Numeros): number | null {
  return n.linkClicks > 0 ? n.spendCents / n.linkClicks : null;
}

/**
 * Quantas vezes, em média, a mesma pessoa viu.
 *
 * É a conta que denuncia público pequeno demais: frequência subindo com
 * resultado caindo é a mesma gente vendo o mesmo anúncio até enjoar.
 */
export function frequencia(n: Numeros): number | null {
  return n.reach > 0 ? n.impressions / n.reach : null;
}

/** Centavos → "R$ 1.142,78". */
export function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Número grande com ponto de milhar: 12345 → "12.345". */
export function numero(n: number): string {
  return n.toLocaleString("pt-BR");
}

/** O primeiro dia do período, às 12h UTC (mesma âncora das datas gravadas). */
export function desdeQuando(dias: number, hoje = new Date()): Date {
  const d = new Date(
    Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), 12),
  );
  d.setUTCDate(d.getUTCDate() - (dias - 1));
  return d;
}

/** "2026-11-12" — o formato de data que a Graph API aceita. */
export function comoDataDaMeta(d: Date): string {
  return d.toISOString().slice(0, 10);
}
