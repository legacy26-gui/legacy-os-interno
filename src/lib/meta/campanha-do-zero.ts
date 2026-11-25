import "server-only";

import { prisma } from "@/lib/prisma";
import { buscarNaGraph } from "./cliente-graph";
import { escreverNaGraph, escritaLiberada, lerComTokenDeEscrita } from "./escrever-na-graph";
import { urlDeSiteSegura, USER_AGENT_DO_ESTOQUE } from "@/lib/estoque/ler-estoque";
import { conferirEdicao, montarTargeting, type EdicaoDoPublico } from "./publico-puro";
import { tipoDeImagem } from "./rascunho-anuncio";
import { fotosComArte } from "@/lib/estoque/artes";
import { baixarFotosDoCarro, MAX_FOTOS } from "@/lib/estoque/fotos";

// CAMPANHA DO ZERO pra loja nova (sem campanha nenhuma pra copiar): campanha → conjunto(s) → um anúncio por carro do estoque,
// tudo PAUSADO, com destino MENSAGEM NO WHATSAPP (decisão do Guilherme, 25/11/2026).
//
// ── O que é sempre igual ──────────────────────────────────────────────────
//   • Objetivo Engajamento, otimização "conversas", destino WhatsApp (o número é o ligado à página da loja).
//   • Público definido na hora (cidade + raio, idade, gênero) e o "alcançar mais pessoas" (Advantage+ público) DESLIGADO.
//   • Criativo SEM os aprimoramentos automáticos da Meta (retoque, variação de texto, música…) e sem "vários anunciantes".
//   • Nada liga sozinho: o gestor confere no Gerenciador e liga.
//
// ── Por que em passos ─────────────────────────────────────────────────────
// 15 carros × 6 fotos (baixar do site, subir na Meta) passa do tempo de uma chamada só. Então: (1) cria a campanha e os
// conjuntos; (2) a tela chama um carro por vez. Um carro que falhar não derruba os outros, e dá pra tentar ele de novo.
//
// ⚠️ Testado contra uma Meta FALSA. A primeira criação de verdade deve ser conferida no Gerenciador.

type Obj = Record<string, unknown>;

export type Estrutura = "por-carro" | "um-conjunto" | "montada";
/** O objetivo da campanha (decisão do Guilherme: escolher na hora; o padrão é Leads com destino único WhatsApp). */
export type Objetivo = "leads" | "engajamento";
export const OBJETIVO_NA_META: Record<Objetivo, string> = { leads: "OUTCOME_LEADS", engajamento: "OUTCOME_ENGAGEMENT" };
export interface Orcamento {
  /** "conjunto" = cada conjunto com o seu valor por dia; "campanha" = um valor pra campanha, a Meta divide. */
  onde: "conjunto" | "campanha";
  centavosPorDia: number;
}

export const ORCAMENTO_MINIMO_CENTS = 600; // R$ 6/dia: abaixo disso a Meta costuma recusar
const LINK_DO_WHATSAPP = "https://api.whatsapp.com/send";

/** Os aprimoramentos automáticos do criativo que ficam DESLIGADOS (opt-out explícito). */
export const APRIMORAMENTOS_DESLIGADOS = [
  "image_touchups",
  "image_brightness_and_contrast",
  "image_templates",
  "image_uncrop",
  "image_background_gen",
  "text_optimizations",
  "text_translation",
  "inline_comment",
  "enhance_cta",
  "adapt_to_placement",
  "add_text_overlay",
  "description_automation",
  "site_extensions",
  "music",
];

// ─────────────────────────── Montagem (puras) ───────────────────────────

export function camposDaCampanha(p: { nome: string; orcamento: Orcamento; objetivo?: Objetivo }): Record<string, string> {
  const c: Record<string, string> = {
    name: p.nome.slice(0, 200),
    objective: OBJETIVO_NA_META[p.objetivo ?? "leads"],
    status: "PAUSED",
    special_ad_categories: "[]",
    buying_type: "AUCTION",
  };
  if (p.orcamento.onde === "campanha") {
    c.daily_budget = String(p.orcamento.centavosPorDia);
    c.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  } else {
    // Orçamento nos conjuntos: a Meta exige dizer se um conjunto pode usar a sobra do outro. Não pode.
    c.is_adset_budget_sharing_enabled = "false";
  }
  return c;
}

export function camposDoConjunto(p: {
  nome: string;
  campanhaId: string;
  paginaId: string;
  publico: EdicaoDoPublico;
  orcamento: Orcamento;
  /** "CONVERSATIONS" (padrão) ou "LEAD_GENERATION" (a Meta pede este em algumas contas com objetivo Leads). */
  meta?: string;
  /** O número do WhatsApp que recebe as conversas deste conjunto (só dígitos, com DDI). Vazio = o número da página. */
  whatsapp?: string | null;
}): Record<string, string> {
  const c: Record<string, string> = {
    name: p.nome.slice(0, 200),
    campaign_id: p.campanhaId,
    status: "PAUSED",
    billing_event: "IMPRESSIONS",
    optimization_goal: p.meta ?? "CONVERSATIONS",
    destination_type: "WHATSAPP",
    // Sem página (o gestor completa no Gerenciador): vai sem o objeto promovido.
    ...(p.paginaId
      ? { promoted_object: JSON.stringify({ page_id: p.paginaId, ...(p.whatsapp ? { whatsapp_phone_number: p.whatsapp } : {}) }) }
      : {}),
    // Público do zero, com o Advantage+ público explicitamente desligado (montarTargeting).
    targeting: JSON.stringify(montarTargeting({}, p.publico)),
  };
  if (p.orcamento.onde === "conjunto") {
    c.daily_budget = String(p.orcamento.centavosPorDia);
    c.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  }
  return c;
}

/** A mensagem pronta com o carro: troca {carro} pelo nome do carro (ou põe o carro no fim, se não tiver {carro}). Pura. */
export function mensagemProntaDoCarro(modelo: string, carro: string): string {
  const m = modelo.trim();
  if (!m) return `Olá! Posso ter mais informações sobre o ${carro}?`;
  return (m.includes("{carro}") ? m.replaceAll("{carro}", carro) : `${m.replace(/[?.!]\s*$/, "")} — ${carro}?`).slice(0, 300);
}

/**
 * O modelo de conversa do WhatsApp (o que aparece no Gerenciador como "Mensagem de boas-vindas" + "Mensagem pronta"): a pessoa
 * clica e a conversa já abre com a pergunta sobre AQUELE carro escrita. Pura.
 */
export function modeloDeConversa(boasVindas: string, mensagemPronta: string): string {
  return JSON.stringify({
    type: "VISUAL_EDITOR",
    version: 2,
    landing_screen_type: "welcome_message",
    media_type: "text",
    text_format: {
      customer_action_type: "autofill_message",
      message: { text: (boasVindas.trim() || "Oi! Como podemos ajudar?").slice(0, 300), autofill_message: { content: mensagemPronta.slice(0, 300) } },
    },
  });
}

export function specDoCriativo(p: { paginaId: string; instagramId?: string | null; legenda: string; titulo: string; hashes: string[]; conversa?: string | null }): Obj {
  const botao = { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP", link: LINK_DO_WHATSAPP } };
  const ld: Obj = { message: p.legenda, link: LINK_DO_WHATSAPP, name: p.titulo.slice(0, 255), call_to_action: botao };
  if (p.conversa) ld.page_welcome_message = p.conversa;
  if (p.hashes.length === 1) ld.image_hash = p.hashes[0];
  else {
    ld.child_attachments = p.hashes.map((h) => ({ image_hash: h, link: LINK_DO_WHATSAPP, name: p.titulo.slice(0, 255), call_to_action: botao }));
    ld.multi_share_end_card = false;
    ld.multi_share_optimized = false;
  }
  return { page_id: p.paginaId, ...(p.instagramId ? { instagram_user_id: p.instagramId } : {}), link_data: ld };
}

export function grausDesligados(lista: string[] = APRIMORAMENTOS_DESLIGADOS): Obj {
  return { creative_features_spec: Object.fromEntries(lista.map((k) => [k, { enroll_status: "OPT_OUT" }])) };
}

/** Confere o pedido antes de mandar qualquer coisa pra Meta. Devolve o erro, ou null. Pura. */
/** O que fazer quando a Meta diz que a página/WhatsApp "não está ligado à sua conta". */
export const COMO_LIBERAR_O_WHATSAPP =
  "o acesso que o sistema usa pra criar campanhas (o usuário do sistema da Legacy no Gerenciador de Negócios) precisa ter a PÁGINA da loja " +
  "(e a conta do WhatsApp, se o número for de WhatsApp Business). No Gerenciador de Negócios: Configurações do negócio → Usuários → " +
  "Usuários do sistema → o da Legacy → Atribuir ativos → Páginas → a página da loja → Controle total (e, se tiver, Contas do WhatsApp → o número). " +
  "Se a página é do negócio do cliente, antes ele precisa dar acesso de parceiro à Legacy.";

export function conferirPedido(p: { nome: string; paginaId: string; publico: EdicaoDoPublico; orcamento: Orcamento; carros: number }): string | null {
  if (!p.nome.trim()) return "Dê um nome pra campanha.";
  // Página vazia vale ("sem página": o gestor completa no Gerenciador); preenchida, tem que ser um ID.
  if (p.paginaId && !/^\d{5,25}$/.test(p.paginaId)) return "O ID da página tem que ser só números (ex.: 102938475610293).";
  if (p.carros === 0) return "Escolha pelo menos um carro.";
  if (!Number.isInteger(p.orcamento.centavosPorDia) || p.orcamento.centavosPorDia < ORCAMENTO_MINIMO_CENTS) return "O orçamento mínimo é R$ 6 por dia.";
  if (p.orcamento.centavosPorDia > 500_000) return "Orçamento acima de R$ 5.000 por dia: confere o valor.";
  return conferirEdicao(p.publico);
}

// ─────────────────────────── Na Meta ───────────────────────────

async function contaDaLoja(clientId: string, contaId: string) {
  return prisma.metaAdAccount.findFirst({ where: { id: contaId, clientId, active: true }, select: { id: true, metaAccountId: true, name: true } });
}

/** O ID da página dentro de "PAGINA_POST" (o effective_object_story_id de um anúncio). Pura. */
export function paginaDoPost(postId: string | null | undefined): string | null {
  const m = (postId ?? "").match(/^(\d{5,25})_\d+$/);
  return m ? m[1] : null;
}

type Pagina = { id: string; nome: string };
type Lista = { data?: { id?: string; name?: string }[] };
const daLista = (d: Lista | undefined): Pagina[] => (d?.data ?? []).filter((p) => p.id).map((p) => ({ id: String(p.id), nome: String(p.name ?? `Página ${p.id}`) }));

/** Lê com os dois tokens (leitura e escrita): um pode enxergar o que o outro não enxerga. */
async function lerComOsDois<T>(caminho: string, params: Record<string, string>): Promise<{ dados: T[]; erros: string[] }> {
  const dados: T[] = [];
  const erros: string[] = [];
  for (const r of [await buscarNaGraph<T>(caminho, params), await lerComTokenDeEscrita<T>(caminho, params)]) {
    if (r.ok) dados.push(r.dados);
    else erros.push(r.erro);
  }
  return { dados, erros };
}

/** O endereço da página do Facebook no site da loja (facebook.com/<nome>). Pura. */
export function facebookDoSite(html: string): string | null {
  for (const m of html.matchAll(/https?:\/\/(?:www\.|m\.|pt-br\.)?facebook\.com\/(?:profile\.php\?id=(\d+)|([A-Za-z0-9.\-]{3,80}))\/?["'?#]/g)) {
    const nome = m[1] ?? m[2];
    if (nome && !/^(sharer|share|plugins|tr|dialog|login|watch|groups|events|pages|people|policies|help|privacy)/i.test(nome)) return nome;
  }
  return null;
}

/**
 * As páginas do Facebook pra campanha da loja (pedido do Guilherme: "puxar automático o que já souber; o que não souber,
 * aparecer todas as páginas do portfólio").
 *
 * `sugerida: true` — o sistema sabe que é desta loja: liberada pra conta (promote_pages), usada nos anúncios da conta, o
 *   Facebook do site da loja, ou página do portfólio com o nome da loja. A primeira já vem escolhida.
 * `sugerida: false` — as outras páginas do portfólio: do Gerenciador de Negócios dono da conta e dos negócios que o acesso do
 *   sistema enxerga (próprias e de clientes), e as páginas do próprio acesso. A pessoa escolhe.
 * Lê com os dois tokens (leitura e escrita). Não achou nada: diz o que a Meta respondeu.
 */
export async function paginasDaConta(
  clientId: string,
  contaId: string,
): Promise<{ ok: true; paginas: (Pagina & { sugerida: boolean })[]; aviso?: string } | { ok: false; erro: string }> {
  const conta = await contaDaLoja(clientId, contaId);
  if (!conta) return { ok: false, erro: "Essa conta não é desta loja." };
  const erros: string[] = [];
  const sugeridas = new Map<string, Pagina>();
  const portfolio = new Map<string, Pagina>();
  const por = (m: Map<string, Pagina>, l: Pagina[]) => {
    for (const p of l) if (!m.has(p.id) || m.get(p.id)!.nome.startsWith("Página ")) m.set(p.id, p);
  };

  // 1. Liberadas pra conta.
  const promo = await lerComOsDois<Lista>(`${conta.metaAccountId}/promote_pages`, { fields: "id,name", limit: "50" });
  erros.push(...promo.erros.map((e) => `páginas da conta: ${e}`));
  for (const d of promo.dados) por(sugeridas, daLista(d));

  // 2. Dos anúncios da conta (a mais usada primeiro).
  const ids = new Map<string, number>();
  const contar = (id: string | null) => id && ids.set(id, (ids.get(id) ?? 0) + 1);
  const salvos = await prisma.metaAdCreative.findMany({ where: { adAccountId: conta.id, postId: { not: null } }, select: { postId: true }, take: 300 });
  for (const c of salvos) contar(paginaDoPost(c.postId));
  if (ids.size === 0) {
    const cr = await buscarNaGraph<{ data?: { effective_object_story_id?: string; object_story_spec?: { page_id?: string } }[] }>(`${conta.metaAccountId}/adcreatives`, {
      fields: "effective_object_story_id,object_story_spec{page_id}",
      limit: "50",
    });
    if (cr.ok) for (const c of cr.dados.data ?? []) contar(c.object_story_spec?.page_id ? String(c.object_story_spec.page_id) : paginaDoPost(c.effective_object_story_id));
  }
  const dosAnuncios = [...ids.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 10);

  // 3. O portfólio: o negócio dono da conta + os negócios que o acesso enxerga, páginas próprias e de clientes.
  const dono = await lerComOsDois<{ business?: { id?: string } }>(conta.metaAccountId, { fields: "business{id,name}" });
  const negocios = await lerComOsDois<Lista>("me/businesses", { fields: "id,name", limit: "50" });
  const bms = [...new Set([...dono.dados.map((d) => d.business?.id), ...negocios.dados.flatMap((d) => daLista(d).map((x) => x.id))].filter((x): x is string => !!x))].slice(0, 10);
  for (const bm of bms) {
    for (const lado of ["owned_pages", "client_pages"]) {
      const r = await lerComOsDois<Lista>(`${bm}/${lado}`, { fields: "id,name", limit: "200" });
      for (const d of r.dados) por(portfolio, daLista(d));
    }
  }
  const minhas = await lerComOsDois<Lista>("me/accounts", { fields: "id,name", limit: "200" });
  for (const d of minhas.dados) por(portfolio, daLista(d));

  // Os nomes das páginas dos anúncios (as que o portfólio não trouxe).
  const semNome = dosAnuncios.filter((id) => !portfolio.has(id) && !sugeridas.has(id));
  const nomes = semNome.length ? await buscarNaGraph<Record<string, { name?: string }>>("", { ids: semNome.join(","), fields: "name" }) : null;
  por(sugeridas, dosAnuncios.map((id) => portfolio.get(id) ?? { id, nome: (nomes?.ok && nomes.dados[id]?.name) || `Página ${id}` }));

  // 4. O Facebook do site da loja (só se ainda não sabe).
  if (sugeridas.size === 0) {
    const site = await prisma.estoqueDaLoja.findUnique({ where: { clientId }, select: { siteUrl: true } });
    if (site?.siteUrl && urlDeSiteSegura(site.siteUrl)) {
      try {
        const r = await fetch(site.siteUrl, { headers: { "User-Agent": USER_AGENT_DO_ESTOQUE }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
        const fb = r.ok ? facebookDoSite(await r.text()) : null;
        if (fb) {
          const pg = await lerComOsDois<{ id?: string; name?: string }>(/^\d+$/.test(fb) ? fb : encodeURIComponent(fb), { fields: "id,name" });
          const achada = pg.dados.find((d) => d.id);
          if (achada?.id) por(sugeridas, [{ id: String(achada.id), nome: String(achada.name ?? fb) }]);
          else erros.push(`Facebook do site (${fb}): ${pg.erros[0] ?? "a Meta não devolveu a página"}`);
        }
      } catch {
        // site fora do ar
      }
    }
  }

  // 5. Página do portfólio com o nome da loja.
  const loja = await prisma.client.findUnique({ where: { id: clientId }, select: { companyName: true } });
  const palavrasDaLoja = (loja?.companyName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !["veiculos", "automoveis", "multimarcas", "motors", "auto", "carros", "ltda", "legacy"].includes(w));
  const parecida = (p: Pagina) => palavrasDaLoja.some((w) => p.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(w));
  if (sugeridas.size === 0) por(sugeridas, [...portfolio.values()].filter(parecida));

  const resto = [...portfolio.values()].filter((p) => !sugeridas.has(p.id)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const paginas = [...[...sugeridas.values()].map((p) => ({ ...p, sugerida: true })), ...resto.map((p) => ({ ...p, sugerida: false }))];
  if (paginas.length === 0) {
    const motivo = [...new Set(erros)].slice(0, 3).join(" · ");
    return {
      ok: false,
      erro: `Não achei página nenhuma: a conta não lista página liberada, não tem anúncio, e o acesso do sistema não enxerga páginas no portfólio. Cole o ID da página abaixo, ou ligue a página à conta no Gerenciador de Negócios.${motivo ? ` (Meta: ${motivo})` : ""}`,
    };
  }
  if (sugeridas.size === 0) return { ok: true, paginas, aviso: "Não sei qual é a página desta loja: escolha na lista do portfólio." };
  if (promo.dados.every((d) => daLista(d).length === 0)) return { ok: true, paginas, aviso: "A Meta não lista a página como liberada pra esta conta. Se der erro ao criar, ligue a página à conta no Gerenciador de Negócios." };
  return { ok: true, paginas };
}

export interface PedidoDaEstrutura {
  clientId: string;
  /** Padrão: leads. */
  objetivo?: Objetivo;
  contaId: string;
  paginaId: string;
  nome: string;
  estrutura: Estrutura;
  orcamento: Orcamento;
  publico: EdicaoDoPublico;
  /** Os carros (id do estoque + nome do conjunto quando é um por carro; `conjunto` = chave do conjunto quando é "montada"). */
  carros: { carroId: string; nome: string; conjunto?: string; whatsapp?: string | null }[];
  /** Só em "montada": os conjuntos que o gestor montou (quantos quiser), cada um com o seu orçamento opcional. */
  conjuntos?: { chave: string; nome: string; centavosPorDia?: number | null; whatsapp?: string | null }[];
  /** O número do WhatsApp padrão da campanha (só dígitos, com DDI). Cada conjunto pode ter o seu. Vazio = o da página. */
  whatsapp?: string | null;
}

export type ResultadoDaEstrutura =
  | { ok: true; campanhaId: string; contaMeta: string; conjuntos: { chave: string; carroId: string | null; adsetId: string; nome: string }[]; avisos: string[] }
  | { ok: false; erro: string; campanhaId?: string };

/** Passo 1: a campanha e o(s) conjunto(s), pausados. */
export async function criarEstrutura(p: PedidoDaEstrutura): Promise<ResultadoDaEstrutura> {
  if (!escritaLiberada()) return { ok: false, erro: "O acesso de escrita na Meta ainda não está configurado no sistema." };
  const erro = conferirPedido({ nome: p.nome, paginaId: p.paginaId, publico: p.publico, orcamento: p.orcamento, carros: p.carros.length }) ?? conferirMontagem(p);
  if (erro) return { ok: false, erro };
  const conta = await contaDaLoja(p.clientId, p.contaId);
  if (!conta) return { ok: false, erro: "Essa conta não é desta loja." };
  // Sem trava de página (decisão do Guilherme): página fora da lista da conta, ou nenhuma, segue com aviso.
  const avisosDaPagina: string[] = [];
  if (!p.paginaId) avisosDaPagina.push("Sem página: a Meta não cria anúncio sem página — as fotos ficaram na biblioteca da conta; escolha a página e crie os anúncios no Gerenciador.");
  else {
    const paginas = await paginasDaConta(p.clientId, p.contaId);
    if (!paginas.ok || !paginas.paginas.some((x) => x.id === p.paginaId)) avisosDaPagina.push("A página não aparece entre as liberadas pra esta conta; se a Meta recusar, ligue a página à conta no Gerenciador de Negócios.");
  }

  // Escolheu número de WhatsApp: confere ANTES de criar qualquer coisa que o acesso de criar campanhas enxerga a página.
  // Sem isto, a Meta recusa todos os conjuntos ("not linked to your account") e sobra uma campanha vazia.
  const algumNumero = !!p.paginaId && (!!p.whatsapp || p.carros.some((c) => c.whatsapp) || (p.conjuntos ?? []).some((c) => c.whatsapp));
  if (algumNumero) {
    const vista = await lerComTokenDeEscrita<{ id?: string; name?: string }>(p.paginaId, { fields: "id,name" });
    if (!vista.ok) return { ok: false, erro: `Não criei nada: o acesso do sistema não enxerga a página ${p.paginaId} (Meta: ${vista.erro}). Pra escolher o WhatsApp, ${COMO_LIBERAR_O_WHATSAPP}` };
  }

  const objetivo: Objetivo = p.objetivo === "engajamento" ? "engajamento" : "leads";
  const camp = await escreverNaGraph<{ id?: string }>(`${conta.metaAccountId}/campaigns`, camposDaCampanha({ nome: p.nome, orcamento: p.orcamento, objetivo }));
  if (!camp.ok || !camp.dados.id) return { ok: false, erro: `A Meta não criou a campanha: ${camp.ok ? "não devolveu o id" : camp.erro}` };
  const campanhaId = camp.dados.id;

  const aCriar = conjuntosACriar(p);
  const comoMandar = new Map<string, string | null>();
  let metaDoConjunto = "CONVERSATIONS";
  const conjuntos: { chave: string; carroId: string | null; adsetId: string; nome: string }[] = [];
  const avisos: string[] = [...avisosDaPagina];
  for (const c of aCriar) {
    const orc: Orcamento = p.orcamento.onde === "conjunto" && c.centavosPorDia ? { onde: "conjunto", centavosPorDia: c.centavosPorDia } : p.orcamento;
    // O número já resolvido antes (outro conjunto com o mesmo número): vai direto do jeito que a Meta aceitou.
    let numero: string | null = c.whatsapp ? (comoMandar.has(c.whatsapp) ? comoMandar.get(c.whatsapp)! : c.whatsapp) : null;
    const criar = (meta: string) =>
      escreverNaGraph<{ id?: string }>(`${conta.metaAccountId}/adsets`, camposDoConjunto({ nome: c.nome, campanhaId, paginaId: p.paginaId, publico: p.publico, orcamento: orc, meta, whatsapp: numero }));
    let r = await criar(metaDoConjunto);
    // "This WhatsApp phone number is not linked to your account": tenta uma vez com "+" na frente (formato). NÃO cria sem o
    // número: conjunto criado sem o WhatsApp não deixa escolher o número depois no Gerenciador (Guilherme, Auto PG 25/11).
    if (!r.ok && numero && c.whatsapp && /whatsapp|phone/i.test(r.erro)) {
      const original = c.whatsapp;
      numero = `+${original}`;
      r = await criar(metaDoConjunto);
      if (r.ok) comoMandar.set(original, numero);
      else if (/whatsapp|phone/i.test(r.erro)) {
        r = { ok: false, erro: `a Meta não deixou usar o WhatsApp ${original}: ${COMO_LIBERAR_O_WHATSAPP}` };
      }
    }
    // Objetivo Leads + WhatsApp: a meta "conversas" é a do Gerenciador, mas há contas em que a Meta só aceita "leads"
    // (LEAD_GENERATION). Recusou a meta: tenta a outra uma vez, e as próximas já vão com a que funcionou.
    if (!r.ok && objetivo === "leads" && /optimization_goal|otimiza/i.test(r.erro)) {
      const outra = metaDoConjunto === "CONVERSATIONS" ? "LEAD_GENERATION" : "CONVERSATIONS";
      const r2 = await criar(outra);
      if (r2.ok) {
        metaDoConjunto = outra;
        avisos.push(`A Meta pediu a meta de desempenho "${outra === "LEAD_GENERATION" ? "maximizar leads" : "maximizar conversas"}" nesta conta.`);
      }
      r = r2;
    }
    if (r.ok && r.dados.id) conjuntos.push({ chave: c.chave, carroId: c.carroId, adsetId: r.dados.id, nome: c.nome });
    else avisos.push(`Conjunto "${c.nome}" não foi criado: ${r.ok ? "a Meta não devolveu o id" : r.erro}`);
    // O WhatsApp não está liberado pro acesso: os outros conjuntos vão bater no mesmo erro. Para aqui.
    if (!r.ok && r.erro.includes(COMO_LIBERAR_O_WHATSAPP)) break;
  }
  if (conjuntos.length === 0) {
    // Campanha vazia não serve pra nada e só bagunça o Gerenciador: sai.
    const apagou = await escreverNaGraph(campanhaId, { status: "DELETED" });
    return { ok: false, erro: `Nenhum conjunto foi criado, ${apagou.ok ? "então apaguei a campanha vazia" : "e a campanha vazia ficou no Gerenciador (apague lá)"}: ${avisos.filter((a) => !a.startsWith("A página") && !a.startsWith("Sem página"))[0] ?? avisos[0] ?? ""}` };
  }
  return { ok: true, campanhaId, contaMeta: conta.metaAccountId, conjuntos, avisos };
}

/** Os conjuntos a criar, conforme a estrutura escolhida. Em "montada", só os que têm pelo menos um carro. Pura. */
export function conjuntosACriar(
  p: Pick<PedidoDaEstrutura, "estrutura" | "nome" | "carros" | "conjuntos" | "whatsapp">,
): { chave: string; carroId: string | null; nome: string; centavosPorDia: number | null; whatsapp: string | null }[] {
  const padrao = p.whatsapp || null;
  if (p.estrutura === "por-carro") return p.carros.map((c) => ({ chave: c.carroId, carroId: c.carroId, nome: c.nome, centavosPorDia: null, whatsapp: c.whatsapp || padrao }));
  if (p.estrutura === "um-conjunto") return [{ chave: "todos", carroId: null, nome: `${p.nome} — carros`, centavosPorDia: null, whatsapp: padrao }];
  const usados = new Set(p.carros.map((c) => c.conjunto));
  return (p.conjuntos ?? [])
    .filter((c) => usados.has(c.chave))
    .map((c) => ({ chave: c.chave, carroId: null, nome: c.nome.trim(), centavosPorDia: c.centavosPorDia ?? null, whatsapp: c.whatsapp || padrao }));
}

/** Número de WhatsApp válido pra Meta: só dígitos, com DDI (10 a 15). Põe o 55 se vier só DDD+número. Pura. */
export function numeroDoWhatsapp(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return null;
  const com = d.length === 10 || d.length === 11 ? `55${d}` : d;
  return com.length >= 12 && com.length <= 15 ? com : null;
}

/**
 * Os números de WhatsApp pra escolher em cada conjunto (pedido do Guilherme: "aparecer os números conectados"). A Meta não tem
 * uma lista pública dos números conectados à página; então junta tudo que dá pra ver com segurança, dizendo de onde veio:
 * 1. o número ligado à página (whatsapp_number);
 * 2. os números que os conjuntos da conta JÁ usam (promoted_object.whatsapp_phone_number) — são números que a Meta aceitou;
 * 3. os números das contas de WhatsApp Business do portfólio;
 * 4. o WhatsApp/telefone do cadastro da loja e o do site.
 * Lê com os dois tokens. A pessoa também pode digitar.
 */
export async function numerosDoWhatsapp(clientId: string, contaId: string, paginaId: string): Promise<{ numero: string; nome: string }[]> {
  const conta = await contaDaLoja(clientId, contaId);
  if (!conta) return [];
  const achados = new Map<string, string>();
  const por = (bruto: unknown, nome: string) => {
    const n = numeroDoWhatsapp(bruto);
    if (n && !achados.has(n)) achados.set(n, nome);
  };
  // 1.
  if (/^\d{5,25}$/.test(paginaId)) {
    const pg = await lerComOsDois<{ whatsapp_number?: string; name?: string }>(paginaId, { fields: "whatsapp_number,name" });
    for (const d of pg.dados) por(d.whatsapp_number, `conectado à página${d.name ? ` ${d.name}` : ""}`);
  }
  // 2.
  const conjuntos = await lerComOsDois<{ data?: { promoted_object?: { whatsapp_phone_number?: string; page_id?: string } }[] }>(`${conta.metaAccountId}/adsets`, {
    fields: "promoted_object",
    limit: "300",
  });
  const usados = new Map<string, number>();
  for (const d of conjuntos.dados)
    for (const c of d.data ?? []) {
      const n = numeroDoWhatsapp(c.promoted_object?.whatsapp_phone_number);
      if (n && (!paginaId || !c.promoted_object?.page_id || c.promoted_object.page_id === paginaId)) usados.set(n, (usados.get(n) ?? 0) + 1);
    }
  for (const [n] of [...usados.entries()].sort((a, b) => b[1] - a[1])) por(n, "já usado nos conjuntos desta conta");
  // 3.
  const dono = await lerComOsDois<{ business?: { id?: string } }>(conta.metaAccountId, { fields: "business{id}" });
  const negocios = await lerComOsDois<Lista>("me/businesses", { fields: "id,name", limit: "50" });
  const bms = [...new Set([...dono.dados.map((d) => d.business?.id), ...negocios.dados.flatMap((d) => daLista(d).map((x) => x.id))].filter((x): x is string => !!x))].slice(0, 10);
  type Wabas = { data?: { id: string; name?: string; phone_numbers?: { data?: { display_phone_number?: string; verified_name?: string }[] } }[] };
  for (const bm of bms) {
    for (const lado of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
      const r = await lerComOsDois<Wabas>(`${bm}/${lado}`, { fields: "id,name,phone_numbers{display_phone_number,verified_name}", limit: "50" });
      for (const d of r.dados) for (const w of d.data ?? []) for (const n of w.phone_numbers?.data ?? []) por(n.display_phone_number, `WhatsApp Business ${n.verified_name ?? w.name ?? ""}`.trim());
    }
  }
  // 4.
  const loja = await prisma.client.findUnique({ where: { id: clientId }, select: { whatsapp: true, phone: true } });
  por(loja?.whatsapp, "do cadastro da loja");
  const cel = numeroDoWhatsapp(loja?.phone);
  if (cel && /^55\d\d9/.test(cel)) por(cel, "telefone do cadastro da loja");
  const rodape = await prisma.estoqueDaLoja.findUnique({ where: { clientId }, select: { rodapeDaLegenda: true } });
  const doRodape = rodape?.rodapeDaLegenda?.match(/whats[^\n\d]*([\d()\s.+-]{10,20})/i)?.[1];
  por(doRodape, "do rodapé da legenda (site da loja)");
  return [...achados.entries()].map(([numero, nome]) => ({ numero, nome }));
}

/** Confere a estrutura "montada": cada carro num conjunto que existe, nomes preenchidos, orçamentos válidos. Pura. */
export function conferirMontagem(p: Pick<PedidoDaEstrutura, "estrutura" | "carros" | "conjuntos" | "orcamento">): string | null {
  if (p.estrutura !== "montada") return null;
  const conjuntos = p.conjuntos ?? [];
  if (conjuntos.length === 0) return "Crie pelo menos um conjunto.";
  if (conjuntos.length > 50) return "No máximo 50 conjuntos por campanha.";
  const chaves = new Set(conjuntos.map((c) => c.chave));
  if (chaves.size !== conjuntos.length) return "Dois conjuntos com a mesma chave.";
  const semConjunto = p.carros.filter((c) => !c.conjunto || !chaves.has(c.conjunto));
  if (semConjunto.length) return `Escolha o conjunto de ${semConjunto.length === 1 ? "um carro" : `${semConjunto.length} carros`}.`;
  const usados = new Set(p.carros.map((c) => c.conjunto));
  for (const c of conjuntos.filter((x) => usados.has(x.chave))) {
    if (!c.nome.trim()) return "Dê nome a todos os conjuntos.";
    if (p.orcamento.onde === "conjunto" && c.centavosPorDia != null && (!Number.isInteger(c.centavosPorDia) || c.centavosPorDia < ORCAMENTO_MINIMO_CENTS)) return `O orçamento do conjunto "${c.nome}" está abaixo de R$ 6 por dia.`;
  }
  return null;
}

async function subirFoto(contaMeta: string, bytes: Buffer, nome: string): Promise<string | null> {
  if (!tipoDeImagem(bytes)) return null;
  const r = await escreverNaGraph<{ images?: Record<string, { hash?: string }> }>(`${contaMeta}/adimages`, {
    bytes: bytes.toString("base64"),
    name: nome.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "foto",
  });
  return r.ok && r.dados.images ? (Object.values(r.dados.images)[0]?.hash ?? null) : null;
}

/** Cria o criativo com os aprimoramentos desligados; se a Meta recusar um nome de aprimoramento, tira só ele e tenta de novo. */
async function criarCriativo(contaMeta: string, nome: string, spec: Obj): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  let lista = [...APRIMORAMENTOS_DESLIGADOS];
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const r = await escreverNaGraph<{ id?: string }>(`${contaMeta}/adcreatives`, {
      name: nome.slice(0, 200),
      object_story_spec: JSON.stringify(spec),
      degrees_of_freedom_spec: JSON.stringify(grausDesligados(lista)),
      contextual_multi_ads: JSON.stringify({ enroll_status: "OPT_OUT" }),
    });
    if (r.ok && r.dados.id) return { ok: true, id: r.dados.id };
    const msg = r.ok ? "a Meta não devolveu o id" : r.erro;
    const recusado = lista.find((k) => msg.includes(k));
    if (!recusado) return { ok: false, erro: msg };
    lista = lista.filter((k) => k !== recusado);
  }
  return { ok: false, erro: "a Meta recusou os ajustes do criativo" };
}

export type ResultadoDoCarro = { ok: true; adId: string; fotos: number; avisos: string[] } | { ok: false; erro: string };

/** Passo 2: um carro — fotos do site, criativo, anúncio PAUSADO no conjunto. */
export async function criarAnuncioDoCarro(p: {
  clientId: string;
  contaMeta: string;
  paginaId: string;
  adsetId: string;
  carroId: string;
  nomeDoAnuncio: string;
  legenda: string;
  maxFotos: number;
  /** Modelo de conversa: boas-vindas e mensagem pronta ({carro} vira o nome do carro). */
  boasVindas?: string;
  mensagemPronta?: string;
}): Promise<ResultadoDoCarro> {
  if (!escritaLiberada()) return { ok: false, erro: "O acesso de escrita na Meta ainda não está configurado no sistema." };
  const conta = await prisma.metaAdAccount.findFirst({ where: { clientId: p.clientId, metaAccountId: p.contaMeta, active: true }, select: { id: true } });
  if (!conta) return { ok: false, erro: "Essa conta não é desta loja." };
  if (!p.paginaId) return subirSoAsFotos(p);
  const carro = await prisma.estoqueCarro.findFirst({ where: { id: p.carroId, clientId: p.clientId }, select: { id: true, titulo: true, url: true, rascunhoAdId: true } });
  if (!carro) return { ok: false, erro: "Esse carro não é do estoque desta loja." };
  const legenda = p.legenda.trim();
  if (legenda.length < 10) return { ok: false, erro: "A legenda ficou vazia." };

  // Carro que já tem anúncio PODE ganhar outro (decisão do Guilherme). A única trava é o clique duplo: enquanto um anúncio
  // dele está subindo ("pendente"), não sobe outro ao mesmo tempo. Se der errado, volta o anúncio que ele tinha antes.
  const anterior = carro.rascunhoAdId === "pendente" ? null : carro.rascunhoAdId;
  const trava = await prisma.estoqueCarro.updateMany({ where: { id: carro.id, rascunhoAdId: carro.rascunhoAdId }, data: { rascunhoAdId: "pendente" } });
  if (trava.count === 0) return { ok: false, erro: "Esse carro já está sendo anunciado agora." };
  const soltar = () => prisma.estoqueCarro.update({ where: { id: carro.id }, data: { rascunhoAdId: anterior } });

  // A arte do banco de artes (se tiver) vai na frente, e as fotos do site são cortadas na proporção dela.
  const temArte = (await prisma.arteDoCarro.count({ where: { carroId: carro.id } })) > 0;
  const fotos = await baixarFotosDoCarro(carro.url);
  if (!fotos.ok && !temArte) {
    await soltar();
    return { ok: false, erro: `Fotos do site: ${fotos.erro}` };
  }
  const limite = Math.max(1, Math.min(MAX_FOTOS, p.maxFotos));
  const doSite = fotos.ok ? fotos.fotos.slice(0, temArte ? limite - 1 : limite) : [];
  const montadas = await fotosComArte(carro.id, doSite);
  const hashes: string[] = [];
  for (const [i, bytes] of montadas.fotos.entries()) {
    const h = await subirFoto(p.contaMeta, bytes, `${carro.titulo} ${i + 1}`);
    if (h) hashes.push(h);
  }
  if (hashes.length === 0) {
    await soltar();
    return { ok: false, erro: "A Meta não aceitou nenhuma foto desse carro." };
  }

  const nome = p.nomeDoAnuncio.trim() || carro.titulo;
  const avisosDoCriativo: string[] = [];
  const conversa = modeloDeConversa(p.boasVindas ?? "", mensagemProntaDoCarro(p.mensagemPronta ?? "", carro.titulo));
  const nomeDoCriativo = `${nome} — ${new Date().toISOString().slice(0, 10)}`;
  let criativo = await criarCriativo(p.contaMeta, nomeDoCriativo, specDoCriativo({ paginaId: p.paginaId, legenda, titulo: carro.titulo, hashes, conversa }));
  // A Meta recusou o modelo de conversa (formato mudou, ou a conta não tem): cria sem ele e avisa — o anúncio sai, e a
  // mensagem pronta se põe no Gerenciador.
  // (Qualquer recusa: o texto do erro da Meta vem mascarado e nem sempre cita o campo.)
  if (!criativo.ok) {
    criativo = await criarCriativo(p.contaMeta, nomeDoCriativo, specDoCriativo({ paginaId: p.paginaId, legenda, titulo: carro.titulo, hashes }));
    if (criativo.ok) avisosDoCriativo.push("A Meta não aceitou a mensagem pronta: ponha no Gerenciador (modelo de conversa).");
  }
  if (!criativo.ok) {
    await soltar();
    return { ok: false, erro: `Criativo: ${criativo.erro}` };
  }
  const ad = await escreverNaGraph<{ id?: string }>(`${p.contaMeta}/ads`, {
    name: nome.slice(0, 200),
    adset_id: p.adsetId,
    creative: JSON.stringify({ creative_id: criativo.id }),
    status: "PAUSED",
  });
  if (!ad.ok || !ad.dados.id) {
    await soltar();
    return { ok: false, erro: `Anúncio: ${ad.ok ? "a Meta não devolveu o id" : ad.erro}. O criativo ficou solto na conta e não gasta nada.` };
  }
  await prisma.estoqueCarro.update({ where: { id: carro.id }, data: { rascunhoAdId: ad.dados.id } });
  const avisos: string[] = [...avisosDoCriativo];
  if (montadas.comArte) avisos.push("Arte do banco na 1ª foto; as fotos do site foram cortadas na proporção dela.");
  if (!fotos.ok) avisos.push(`Só a arte: as fotos do site não vieram (${fotos.erro}).`);
  const puladas = fotos.puladas + montadas.puladas;
  if (puladas > 0) avisos.push(`${puladas} foto(s) do site não puderam ser usadas.`);
  if (hashes.length < montadas.fotos.length) avisos.push("Alguma foto não subiu na Meta.");
  return { ok: true, adId: ad.dados.id, fotos: hashes.length, avisos };
}

/**
 * Sem página, a Meta não cria o anúncio (o criativo exige a página). O que dá pra adiantar: as fotos do carro (com a arte na
 * frente) sobem pra biblioteca de imagens da conta, com o nome do carro — no Gerenciador é só escolher a página e as fotos.
 */
async function subirSoAsFotos(p: { clientId: string; contaMeta: string; carroId: string; maxFotos: number }): Promise<ResultadoDoCarro> {
  const carro = await prisma.estoqueCarro.findFirst({ where: { id: p.carroId, clientId: p.clientId }, select: { id: true, titulo: true, url: true } });
  if (!carro) return { ok: false, erro: "Esse carro não é do estoque desta loja." };
  const temArte = (await prisma.arteDoCarro.count({ where: { carroId: carro.id } })) > 0;
  const fotos = await baixarFotosDoCarro(carro.url);
  const limite = Math.max(1, Math.min(MAX_FOTOS, p.maxFotos));
  const montadas = await fotosComArte(carro.id, fotos.ok ? fotos.fotos.slice(0, temArte ? limite - 1 : limite) : []);
  let subidas = 0;
  for (const [i, bytes] of montadas.fotos.entries()) if (await subirFoto(p.contaMeta, bytes, `${carro.titulo} ${i + 1}`)) subidas++;
  return { ok: false, erro: `Sem página: anúncio não criado (a Meta exige a página). ${subidas} foto(s) do carro já estão na biblioteca da conta.` };
}
