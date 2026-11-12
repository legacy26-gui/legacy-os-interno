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

/** O que a tela mostra: uma janela de dias, ou tudo desde o começo. */
export type Janela = Periodo | "tudo";

export function janelaDoTexto(texto: string | undefined): Janela {
  if (texto === "tudo") return "tudo";
  return PERIODOS.find((p) => String(p) === texto) ?? DIAS_PADRAO;
}

export function rotuloDaJanela(j: Janela): string {
  return j === "tudo" ? "Vida inteira" : `${j} dias`;
}

/**
 * Tipos de "lead" que aparecem nas contas de loja de carro.
 *
 * Qual deles vale é configuração DA CONTA, não do sistema: uma loja roda
 * campanha de WhatsApp, outra de formulário, e somar as duas coisas como se
 * fossem a mesma daria um custo por lead que não quer dizer nada.
 */
export const TIPOS_DE_LEAD: { valor: string; rotulo: string }[] = [
  {
    valor: "onsite_conversion.messaging_conversation_started_7d",
    rotulo: "Conversa iniciada no WhatsApp/Direct",
  },
  { valor: "lead", rotulo: "Formulário de cadastro (Lead Ads)" },
  { valor: "onsite_conversion.lead_grouped", rotulo: "Lead (agrupado pela Meta)" },
  { valor: "offsite_conversion.fb_pixel_lead", rotulo: "Lead no site (Pixel)" },
  { valor: "link_click", rotulo: "Clique no link (quando não há conversão)" },
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
  tipoDeLead: string
): number {
  if (!actions?.length) return 0;
  return actions
    .filter((a) => a.action_type === tipoDeLead)
    .reduce((soma, a) => soma + inteiro(a.value), 0);
}

/** A ação configurada apareceu nesta resposta? Serve pra avisar na tela. */
export function temOTipoDeLead(linhas: LinhaCrua[], tipoDeLead: string): boolean {
  return linhas.some((l) => l.actions?.some((a) => a.action_type === tipoDeLead));
}

/**
 * Limpa uma resposta de /insights.
 *
 * Linha sem adset_id ou sem data é descartada: sem os dois não dá pra gravar
 * (é a chave da tabela) e inventar um valor ali seria pior que perder a linha.
 */
export function limparLinhas(linhas: LinhaCrua[], tipoDeLead: string): LinhaLimpa[] {
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

export function limparVidaInteira(linhas: LinhaCrua[], tipoDeLead: string): VidaInteira[] {
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
  clicks: number;
  linkClicks: number;
  leads: number;
}

export const ZERO: Numeros = {
  spendCents: 0,
  impressions: 0,
  clicks: 0,
  linkClicks: 0,
  leads: 0,
};

export function somar(linhas: Numeros[]): Numeros {
  return linhas.reduce(
    (t, l) => ({
      spendCents: t.spendCents + l.spendCents,
      impressions: t.impressions + l.impressions,
      clicks: t.clicks + l.clicks,
      linkClicks: t.linkClicks + l.linkClicks,
      leads: t.leads + l.leads,
    }),
    { ...ZERO }
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

/** Centavos → "R$ 1.142,78". */
export function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Número grande com ponto de milhar: 12345 → "12.345". */
export function numero(n: number): string {
  return n.toLocaleString("pt-BR");
}

/** O primeiro dia do período, às 12h UTC (mesma âncora das datas gravadas). */
export function desdeQuando(dias: number, hoje = new Date()): Date {
  const d = new Date(
    Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), 12)
  );
  d.setUTCDate(d.getUTCDate() - (dias - 1));
  return d;
}

/** "2026-11-12" — o formato de data que a Graph API aceita. */
export function comoDataDaMeta(d: Date): string {
  return d.toISOString().slice(0, 10);
}
