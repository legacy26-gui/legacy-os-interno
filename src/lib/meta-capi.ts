import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Conversions API da Meta: o servidor conta pra Meta o que aconteceu com o
// lead depois que ele saiu do site. Sem isso a Meta só sabe que alguém
// preencheu um formulário, e otimiza o anúncio por volume de formulário em vez
// de por venda.
//
// O token nunca sai daqui: fica em variável de ambiente, nunca na landing.

const VERSAO = process.env.META_API_VERSION?.trim() || "v21.0";
// Endereço da API. Só muda em teste, pra conferir o que sai daqui sem mandar
// evento de mentira pra conta de verdade.
const BASE = process.env.META_GRAPH_BASE?.trim() || "https://graph.facebook.com";

export type EventoMeta = "Lead" | "QualifiedLead" | "Purchase";

// Pixel da Legacy Automotivo (conjunto de dados "Serviços profissionais"). Não
// é segredo — ele já aparece no código da landing. Fica aqui como padrão pra
// que só o token, que é segredo de verdade, precise ser configurado.
// META_PIXEL_ID sobrepõe, se um dia o Pixel mudar.
const PIXEL_PADRAO = "1795537647563349";

export function pixelId() {
  return process.env.META_PIXEL_ID?.trim() || PIXEL_PADRAO;
}

export function metaConfigurada() {
  return !!(pixelId() && process.env.META_CAPI_TOKEN?.trim());
}

/** SHA-256 em minúsculo, que é o formato que a Meta espera. */
function hash(valor: string) {
  return createHash("sha256").update(valor, "utf8").digest("hex");
}

/**
 * Telefone no padrão E.164 sem o "+": só dígitos, com código do país.
 * É assim que a Meta casa a pessoa — 5542999016794.
 */
export function telefoneParaMeta(bruto: string | null): string | null {
  if (!bruto) return null;
  let d = bruto.replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return null;
  // Número brasileiro chega sem país (DDD + número = 10 ou 11 dígitos).
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  // Com país já na frente, deixa como está. Qualquer outro tamanho é lixo.
  if (d.length < 12 || d.length > 15) return null;
  return d;
}

/** Texto normalizado antes do hash: minúsculo, sem acento e sem pontuação. */
function normaliza(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpo = valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return limpo || null;
}

export interface DadosDoLead {
  id: string;
  contactName: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  fbc: string | null;
  fbp: string | null;
  fbclid: string | null;
  landingUrl: string | null;
  clientIp: string | null;
  clientUserAgent: string | null;
  pixelEventId: string | null;
}

function montarUserData(lead: DadosDoLead) {
  const telefone = telefoneParaMeta(lead.phone);
  const [primeiro, ...resto] = lead.contactName.trim().split(/\s+/);

  // Hash no que identifica a pessoa; fbc, fbp, IP e navegador vão em claro —
  // é o que a Meta manda e o que ela consegue usar.
  const user: Record<string, unknown> = {};
  if (telefone) user.ph = [hash(telefone)];
  if (normaliza(primeiro)) user.fn = [hash(normaliza(primeiro)!)];
  if (resto.length && normaliza(resto.join(""))) user.ln = [hash(normaliza(resto.join(""))!)];
  if (normaliza(lead.city)) user.ct = [hash(normaliza(lead.city)!)];
  if (normaliza(lead.state)) user.st = [hash(normaliza(lead.state)!)];
  if (telefone) user.country = [hash("br")];

  // fbc é o que liga o lead ao clique no anúncio. Se a landing não mandou mas
  // veio o fbclid, dá pra remontar no formato que a Meta espera.
  const fbc =
    lead.fbc ||
    (lead.fbclid ? `fb.1.${Date.now()}.${lead.fbclid}` : null);
  if (fbc) user.fbc = fbc;
  if (lead.fbp) user.fbp = lead.fbp;
  if (lead.clientIp && lead.clientIp !== "desconhecido") user.client_ip_address = lead.clientIp;
  if (lead.clientUserAgent) user.client_user_agent = lead.clientUserAgent;

  return user;
}

/**
 * O id que a Meta usa pra saber que o evento do navegador e o nosso são o
 * mesmo. No Lead do formulário é o id que o Pixel já usou — por isso a landing
 * precisa mandá-lo junto. Nos eventos que nascem no CRM, é um id fixo por lead:
 * assim, se o cartão for e voltar de coluna, a Meta não conta duas vezes.
 */
function idDoEvento(lead: DadosDoLead, evento: EventoMeta) {
  if (evento === "Lead" && lead.pixelEventId) return lead.pixelEventId;
  return `${evento.toLowerCase()}-${lead.id}`;
}

export interface ResultadoEnvio {
  enviado: boolean;
  motivo?: string;
}

/**
 * Manda um evento pra Meta. Nunca lança: falar com a Meta não pode derrubar o
 * CRM. O resultado fica gravado em meta_capi_events pra dar pra conferir depois.
 *
 * Evento já enviado com sucesso não vai de novo.
 */
export async function enviarEventoMeta(
  lead: DadosDoLead,
  evento: EventoMeta,
  opcoes: { valor?: number; moeda?: string } = {}
): Promise<ResultadoEnvio> {
  if (!metaConfigurada()) {
    console.warn(`[meta] sem META_PIXEL_ID/META_CAPI_TOKEN — ${evento} não enviado`);
    return { enviado: false, motivo: "não configurado" };
  }

  const jaFoi = await prisma.metaCapiEvent.findUnique({
    where: { leadId_eventName: { leadId: lead.id, eventName: evento } },
    select: { sucesso: true },
  });
  if (jaFoi?.sucesso) return { enviado: false, motivo: "já enviado" };

  const eventId = idDoEvento(lead, evento);
  const naWeb = evento === "Lead";

  const dados: Record<string, unknown> = {
    event_name: evento,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    // O Lead aconteceu no site; qualificação e venda acontecem aqui dentro.
    action_source: naWeb ? "website" : "system_generated",
    user_data: montarUserData(lead),
  };

  if (lead.landingUrl) dados.event_source_url = lead.landingUrl;
  if (opcoes.valor && opcoes.valor > 0) {
    dados.custom_data = { value: Number(opcoes.valor.toFixed(2)), currency: opcoes.moeda ?? "BRL" };
  }

  const corpo: Record<string, unknown> = { data: [dados] };
  // Só em teste: faz o evento aparecer na aba "Eventos de teste" do Gerenciador.
  const codigoDeTeste = process.env.META_TEST_EVENT_CODE?.trim();
  if (codigoDeTeste) corpo.test_event_code = codigoDeTeste;

  let sucesso = false;
  let resposta = "";

  try {
    const r = await fetch(
      `${BASE}/${VERSAO}/${pixelId()}/events?access_token=${encodeURIComponent(
        process.env.META_CAPI_TOKEN!.trim()
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(8000),
      }
    );
    resposta = (await r.text()).slice(0, 2000);
    sucesso = r.ok;
    if (!sucesso) console.error(`[meta] ${evento} recusado (${r.status}): ${resposta}`);
  } catch (e) {
    resposta = e instanceof Error ? e.message : String(e);
    console.error(`[meta] ${evento} falhou: ${resposta}`);
  }

  // O registro sobrescreve a tentativa anterior: o que importa é o estado atual
  // de cada evento, não o histórico de tentativas.
  await prisma.metaCapiEvent
    .upsert({
      where: { leadId_eventName: { leadId: lead.id, eventName: evento } },
      create: { leadId: lead.id, eventName: evento, eventId, sucesso, resposta },
      update: { eventId, sucesso, resposta, createdAt: new Date() },
    })
    .catch((e) => console.error("[meta] não consegui registrar o envio", e));

  return { enviado: sucesso, motivo: sucesso ? undefined : resposta.slice(0, 200) };
}

/**
 * Avisa a Meta do que mudou no lead, se for o caso. Chamada depois de cada
 * movimento de cartão. Não espera resposta de propósito em quem chama: o CRM
 * não pode ficar lento por causa de anúncio.
 */
export async function avisarMetaDaEtapa(leadId: string) {
  if (!metaConfigurada()) return;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true, contactName: true, phone: true, city: true, state: true,
      fbc: true, fbp: true, fbclid: true, landingUrl: true,
      clientIp: true, clientUserAgent: true, pixelEventId: true,
      qualifiedAt: true, wonAt: true, monthlyValue: true, setupValue: true, contractMonths: true,
    },
  });
  if (!lead) return;

  // Só faz sentido avisar quem veio de anúncio: lead de indicação não tem
  // clique pra casar, e evento sem par só suja a conta.
  if (!lead.fbc && !lead.fbp && !lead.fbclid) return;

  if (lead.qualifiedAt) await enviarEventoMeta(lead, "QualifiedLead");

  if (lead.wonAt) {
    // Valor do contrato: o que entra por mês durante o contrato, mais a
    // entrada. É esse número que a Meta usa pra otimizar por retorno.
    const valor =
      Number(lead.monthlyValue) * lead.contractMonths + Number(lead.setupValue);
    await enviarEventoMeta(lead, "Purchase", { valor });
  }
}
