import "server-only";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { CARTEIRA_NO_META, escopoDaCarteira, type PessoaDaCasa } from "@/lib/carteira";
import { escritaLiberada } from "@/lib/meta/escrever-na-graph";
import { acharObjetoDaLoja } from "@/lib/meta/mudar-status";
import { subirVideo } from "@/lib/meta/video";
import { anunciosDoConjuntoNaMeta, contaDoConjunto, lerBaseDoAnuncio, ORCAMENTO_MAXIMO_CENTS, ORCAMENTO_MINIMO_CENTS, subirFotoDoRascunho, subirRascunho } from "@/lib/meta/rascunho-anuncio";
import { gerarLegendaDoCarro } from "@/lib/meta/legenda-do-rascunho";
import { achatar, acharCarro } from "./entender-pedido";
import { acharLojaNoTexto, descartarPendente, respostaDeConfirmacao } from "./pausar-no-privado";
import { anotar } from "./trilha";

// Subir anúncio pelo WhatsApp: a pessoa manda as fotos pro robô no privado, e o robô monta o rascunho.
//
// ── O que a pessoa vê ────────────────────────────────────────────────────
//
//   1. manda a(s) foto(s) do carro (uma = foto única, várias = carrossel);
//   2. escreve a loja e o carro ("virtus 2021 r2") — ou o robô pergunta o que faltar;
//   3. o robô propõe o conjunto e o anúncio a duplicar (o "mesmo de sempre" da loja), escreve a legenda
//      com a IA e mostra TUDO num resumo;
//   4. a pessoa responde "sim" (ou troca legenda, título, carro, conjunto, base) e o anúncio sobe PAUSADO.
//      Quem publica é ela, no Gerenciador.
//
// ── As travas (as mesmas do resto, e mais) ───────────────────────────────
//
//   - Só pessoa da casa com número cadastrado (quem chama confere), e só as lojas da CARTEIRA dela.
//   - O robô diz loja, conjunto, anúncio e carro ANTES de agir, e só age com um "sim".
//   - O anúncio sempre nasce PAUSADO. Quem executa é o mesmo núcleo da tela (criarRascunhoDeAnuncio),
//     com as mesmas travas de cadastro; este arquivo não tem caminho próprio pra Meta.
//   - A conversa vence sozinha (30 min sem resposta) e some quando o anúncio sobe ou a pessoa cancela.
//   - Mensagem que não é da conversa não é engolida pra sempre: "cancela" sai a qualquer hora.

const VALE_MS = 30 * 60 * 1000;
const MAX_FOTOS = 10;
const MAX_NA_LISTA = 15;
const MIN_DADOS = 8;

type Pessoa = PessoaDaCasa & { name: string };

interface Opcao {
  id: string;
  rotulo: string;
}

interface BaseSalva {
  formato: "foto" | "carrossel";
  legenda: string;
  titulo: string;
  link: string;
}

/** A conversa, como está no banco, com os campos Json já tipados. */
interface Conversa {
  userId: string;
  etapa: string;
  clientId: string | null;
  lojaNome: string | null;
  adsetId: string | null;
  adsetNome: string | null;
  campanhaNome: string | null;
  baseAdId: string | null;
  baseNome: string | null;
  base: BaseSalva | null;
  carro: string | null;
  nome: string | null;
  titulo: string | null;
  legenda: string | null;
  avisosDaLegenda: string[];
  opcoes: Opcao[];
  /** "Um carro por conjunto": o conjunto escolhido é o molde, e o anúncio ganha um conjunto novo (duplicado). */
  duplicarConjunto: boolean;
  /** Orçamento diário do conjunto novo (centavos). Null = o do molde. */
  orcamentoCents: number | null;
  /** Conjunto criado numa tentativa anterior que falhou depois: a próxima sobe nele. */
  conjuntoCriadoId: string | null;
}

const negrito = (s: string) => `*${s}*`;
const reais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────── Ler e gravar a conversa ──────────────────────

function ler(linha: Awaited<ReturnType<typeof prisma.rascunhoWhatsapp.findUnique>>): Conversa | null {
  if (!linha) return null;
  const b = linha.base as Partial<BaseSalva> | null;
  const base: BaseSalva | null =
    b && (b.formato === "foto" || b.formato === "carrossel")
      ? { formato: b.formato, legenda: String(b.legenda ?? ""), titulo: String(b.titulo ?? ""), link: String(b.link ?? "") }
      : null;
  const opcoes = Array.isArray(linha.opcoes)
    ? (linha.opcoes as unknown[]).filter((o): o is Opcao => !!o && typeof (o as Opcao).id === "string" && typeof (o as Opcao).rotulo === "string")
    : [];
  const avisos = Array.isArray(linha.avisosDaLegenda) ? (linha.avisosDaLegenda as unknown[]).map(String) : [];
  return {
    userId: linha.userId,
    etapa: linha.etapa,
    clientId: linha.clientId,
    lojaNome: linha.lojaNome,
    adsetId: linha.adsetId,
    adsetNome: linha.adsetNome,
    campanhaNome: linha.campanhaNome,
    baseAdId: linha.baseAdId,
    baseNome: linha.baseNome,
    base,
    carro: linha.carro,
    nome: linha.nome,
    titulo: linha.titulo,
    legenda: linha.legenda,
    avisosDaLegenda: avisos,
    opcoes,
    duplicarConjunto: linha.duplicarConjunto,
    orcamentoCents: linha.orcamentoCents,
    conjuntoCriadoId: linha.conjuntoCriadoId,
  };
}

type Mudanca = Partial<Omit<Conversa, "userId">>;

/** Grava a mudança no banco e na cópia em memória, e renova o prazo. */
async function salvar(c: Conversa, m: Mudanca, agora: Date): Promise<void> {
  Object.assign(c, m);
  const dados: Prisma.RascunhoWhatsappUpdateInput = { venceEm: new Date(agora.getTime() + VALE_MS) };
  for (const [k, v] of Object.entries(m)) {
    if (k === "base" || k === "opcoes" || k === "avisosDaLegenda") {
      (dados as Record<string, unknown>)[k] = v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);
    } else {
      (dados as Record<string, unknown>)[k] = v;
    }
  }
  await prisma.rascunhoWhatsapp.update({ where: { userId: c.userId }, data: dados });
}

async function apagarTudo(userId: string) {
  await prisma.rascunhoFoto.deleteMany({ where: { userId } });
  await prisma.rascunhoWhatsapp.deleteMany({ where: { userId } });
}

/** Rascunhos que ninguém terminou: a conversa vencida e as fotos órfãs. Roda na varredura de 15 em 15 minutos. */
export async function limparRascunhosVencidos(agora: Date = new Date()): Promise<{ conversas: number; fotos: number }> {
  const vencidas = await prisma.rascunhoWhatsapp.findMany({ where: { venceEm: { lte: agora } }, select: { userId: true } });
  for (const v of vencidas) await apagarTudo(v.userId);
  // Foto de quem não tem mais conversa e passou de 3 horas.
  const comConversa = (await prisma.rascunhoWhatsapp.findMany({ select: { userId: true } })).map((x) => x.userId);
  const f = await prisma.rascunhoFoto.deleteMany({
    where: { criadoEm: { lte: new Date(agora.getTime() - 3 * 60 * 60 * 1000) }, userId: { notIn: comConversa } },
  });
  return { conversas: vencidas.length, fotos: f.count };
}

// ───────────────────────────── Receber foto ───────────────────────────────

export interface FotoRecebida {
  messageId: string;
  mime: string;
  bytes: Buffer;
  /** Quando a pessoa mandou (da Z-API): é o que mantém a ordem do carrossel mesmo se as fotos chegarem fora de ordem. */
  quando: Date;
}

/**
 * Guarda a foto e abre (ou continua) a conversa.
 * `avisar` é verdadeiro só pra UMA foto de cada lote: o robô não responde cada foto de um álbum.
 */
export async function registrarFoto(
  pessoa: Pessoa,
  foto: FotoRecebida,
  agora: Date = new Date(),
): Promise<{ avisar: boolean; total: number; cheio: boolean; repetida: boolean }> {
  // Vídeo: fica UM (o último que chegou). O anúncio vai ser de vídeo.
  if (foto.mime.startsWith("video/")) await prisma.rascunhoFoto.deleteMany({ where: { userId: pessoa.id, mime: { startsWith: "video/" } } });
  const total = await prisma.rascunhoFoto.count({ where: { userId: pessoa.id } });
  if (total >= MAX_FOTOS) return { avisar: false, total, cheio: true, repetida: false };

  try {
    await prisma.rascunhoFoto.create({
      data: { userId: pessoa.id, messageId: foto.messageId, mime: foto.mime, bytes: new Uint8Array(foto.bytes), criadoEm: foto.quando },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { avisar: false, total, cheio: false, repetida: true };
    throw e;
  }

  const venceEm = new Date(agora.getTime() + VALE_MS);
  let avisar = false;
  const existente = await prisma.rascunhoWhatsapp.findUnique({ where: { userId: pessoa.id }, select: { etapa: true, venceEm: true } });
  if (existente && existente.venceEm <= agora) {
    // A conversa antiga venceu: só esta foto (a nova) fica.
    await prisma.rascunhoWhatsapp.deleteMany({ where: { userId: pessoa.id } });
  }
  if (!existente || existente.venceEm <= agora) {
    await descartarPendente(pessoa.id);
    try {
      await prisma.rascunhoWhatsapp.create({ data: { userId: pessoa.id, etapa: "coletando", venceEm } });
      avisar = true;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  } else if (existente.etapa === "aguardando-fotos") {
    // A pessoa tinha pedido pra subir e ainda não tinha mandado foto: a primeira foto avisa (e só ela).
    const r = await prisma.rascunhoWhatsapp.updateMany({ where: { userId: pessoa.id, etapa: "aguardando-fotos" }, data: { etapa: "coletando", venceEm } });
    avisar = r.count === 1;
  } else {
    await prisma.rascunhoWhatsapp.updateMany({ where: { userId: pessoa.id }, data: { venceEm } });
  }
  return { avisar, total: total + 1, cheio: false, repetida: false };
}

export const TEXTO_VIDEO_RECEBIDO =
  "🎬 Recebi o vídeo. O anúncio vai ser de *vídeo* (com o mesmo botão e página do anúncio-base). Agora me diz a " +
  `${negrito("loja")} e o ${negrito("carro")}, por exemplo: ${negrito("virtus 2021 r2")}.\nPra desistir, escreve ${negrito("cancela")}.`;

export const TEXTO_FOTO_RECEBIDA =
  "📷 Recebi a foto. Manda as outras (até 10: uma foto = anúncio de foto, várias = carrossel) e depois me diz a " +
  `${negrito("loja")} e o ${negrito("carro")}, por exemplo: ${negrito("virtus 2021 r2")}.\nPra desistir, escreve ${negrito("cancela")}.`;

// ───────────────────────────── Entender o texto ───────────────────────────

const PALAVRAS_DE_COMANDO = new Set([
  "subir", "sobe", "subo", "suba", "postar", "publicar", "anuncio", "anuncios", "novo", "nova", "pronto", "carro", "carros",
  "foto", "fotos", "o", "a", "os", "as", "um", "uma", "do", "da", "de", "no", "na", "pra", "para", "quero", "queria", "por", "favor",
  "ai", "ta", "isso", "e", "ok", "ja", "mandei",
]);

const CANCELA = /^(cancela|cancelar|cancelado|desisto|esquece|deixa pra la|deixa|para|parar|sair)$/;

/** A mensagem pede pra subir um anúncio? ("subir anúncio do virtus", "sobe esse carro"). Verba e orçamento não contam. */
export function pedeSubirAnuncio(texto: string): boolean {
  const t = achatar(texto);
  if (/(^|\s)(verba|orcamento|saldo|valor|investimento|budget|pausa|pausar|desativa|desativar)(\s|$)/.test(t)) return false;
  const verbo = /(^|\s)(subir|sobe|subo|suba|postar|publicar)(\s|$)/.test(t);
  const objeto = /(^|\s)(anuncio|anuncios|carro|carros|foto|fotos)(\s|$)/.test(t);
  return (verbo && objeto) || /(^|\s)(novo|nova)\s+anuncio(\s|$)/.test(t);
}

/** O texto sem as palavras de comando e sem as que identificaram a loja: sobra o carro. */
function soOCarro(texto: string, restanteDaLoja: string | null): string {
  const t = achatar(texto).split(" ").filter(Boolean);
  const sobra = restanteDaLoja !== null ? achatar(restanteDaLoja).split(" ").filter(Boolean) : t;
  // Palavras que o nome da loja consumiu = as que estavam no texto e não estão no restante.
  const consumidas = new Map<string, number>();
  for (const p of t) consumidas.set(p, (consumidas.get(p) ?? 0) + 1);
  for (const p of sobra) consumidas.set(p, (consumidas.get(p) ?? 0) - 1);
  const daLoja = new Set([...consumidas].filter(([, n]) => n > 0).map(([p]) => p));
  return texto
    .split(/\s+/)
    .filter((tok) => {
      const a = achatar(tok);
      if (!a) return true; // "R$", "-" etc.: mantém, a pontuação é parte do preço
      return !a.split(" ").every((p) => PALAVRAS_DE_COMANDO.has(p) || daLoja.has(p));
    })
    .join(" ")
    .trim();
}

/** "2", "2)" ou "2." → 2. */
/**
 * O nome do carro pro conjunto e pro título, a partir do que a pessoa escreveu.
 * Tira preço ("R$37.900,00", "37.900") e "completo", e corta na primeira vírgula/linha — NUNCA no ponto, porque o ponto
 * de "37.900" não é fim de frase (já saiu "Renault Sandero 2012 R$37" no nome de um conjunto por isso).
 */
export function nomeCurtoDoCarro(texto: string): string {
  const primeiro = texto.split(/[,\n;]/)[0] ?? texto;
  return primeiro
    .replace(/R\$\s*[\d.,]+/gi, " ")
    .replace(/\b\d{1,3}(?:\.\d{3})+\b/g, " ")
    .replace(/\b(completo|completa|oportunidade|baixou)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

/** A pessoa pediu pra IA escrever ("crie uma legenda usando o carro…") em vez de mandar a legenda pronta? */
export function ehPedidoDeLegenda(texto: string): boolean {
  return /^\s*(cri[ae]r?|ger[ae]r?|gera|escrev[ae]r?|faz|fazer|mont[ae]r?|elabor[ae]r?|me\s+(d[aá]|faz|cria))\b[^.!?\n]{0,40}\blegenda\b/i.test(texto);
}

function numeroEscolhido(texto: string): number | null {
  // "2", "2)", "2." e também "2 conjunto novo" / "12. conjunto novo": o número vem primeiro. "2021 virtus" não é o 2.
  const m = /^\s*(\d{1,2})(?:[).:-]|\s|$)/.exec(texto);
  return m ? Number(m[1]) : null;
}

/** Acha, numa lista, o item que a pessoa escolheu: pelo número ou pelas palavras. */
function escolherDaLista(texto: string, opcoes: Opcao[]): { item: Opcao | null; filtradas: Opcao[] } {
  const n = numeroEscolhido(texto);
  if (n !== null) return { item: opcoes[n - 1] ?? null, filtradas: opcoes };
  const palavras = achatar(texto).split(" ").filter((p) => p.length >= 2 && !PALAVRAS_DE_COMANDO.has(p));
  if (palavras.length === 0) return { item: null, filtradas: opcoes };
  const filtradas = opcoes.filter((o) => {
    const r = achatar(o.rotulo);
    return palavras.every((p) => r.includes(p));
  });
  return { item: filtradas.length === 1 ? filtradas[0] : null, filtradas: filtradas.length > 0 ? filtradas : opcoes };
}

function listaNumerada(opcoes: Opcao[]): string {
  return opcoes.map((o, i) => `${i + 1}) ${o.rotulo}`).join("\n");
}

// ───────────────────────────── Dados da loja ──────────────────────────────

async function lojasDaPessoa(pessoa: Pessoa) {
  return prisma.client.findMany({
    where: { ...CARTEIRA_NO_META, ...escopoDaCarteira(pessoa), metaAdAccounts: { some: { active: true } } },
    select: { id: true, companyName: true, metaAdAccounts: { where: { active: true }, select: { id: true } } },
    orderBy: { companyName: "asc" },
  });
}

async function conjuntosDaLoja(clientId: string): Promise<Opcao[]> {
  const contas = (await prisma.metaAdAccount.findMany({ where: { clientId, active: true }, select: { id: true } })).map((c) => c.id);
  const [conjuntos, campanhas] = await Promise.all([
    prisma.metaAdset.findMany({
      where: { adAccountId: { in: contas }, NOT: { status: { in: ["ARCHIVED", "DELETED"] } } },
      select: { adsetId: true, name: true, status: true, campaignId: true },
    }),
    prisma.metaCampaign.findMany({ where: { adAccountId: { in: contas } }, select: { campaignId: true, name: true } }),
  ]);
  const nomeDaCampanha = new Map(campanhas.map((c) => [c.campaignId, c.name]));
  return conjuntos
    .sort((a, b) => (a.status === "ACTIVE" ? 0 : 1) - (b.status === "ACTIVE" ? 0 : 1) || a.name.localeCompare(b.name))
    .map((s) => ({
      id: s.adsetId,
      rotulo: `${s.campaignId ? (nomeDaCampanha.get(s.campaignId) ?? "—") + " › " : ""}${s.name}${s.status === "ACTIVE" ? "" : " (pausado)"}`,
    }));
}

/** Os anúncios do conjunto escolhido (só dele), ativos primeiro: são os que servem de anúncio-base. */
async function anunciosDoConjunto(clientId: string, adsetId: string | null): Promise<Opcao[]> {
  if (!adsetId) return [];
  const contas = (await prisma.metaAdAccount.findMany({ where: { clientId, active: true }, select: { id: true } })).map((c) => c.id);
  const ads = await prisma.metaAdCreative.findMany({
    where: { adAccountId: { in: contas }, adsetId, NOT: { status: { in: ["ARCHIVED", "DELETED"] } } },
    select: { adId: true, adName: true, status: true, adsetId: true },
  });
  const ordem = (a: { status: string | null }) => (a.status === "ACTIVE" ? 0 : 1);
  return ads
    .sort((a, b) => ordem(a) - ordem(b) || a.adName.localeCompare(b.adName))
    .map((a) => ({ id: a.adId, rotulo: `${a.adName}${a.status === "ACTIVE" ? "" : " (pausado)"}` }));
}

/** O estoque do site, quando a loja tem, pra completar os dados do carro. */
async function carroDoEstoque(clientId: string, textoDoCarro: string) {
  const estoque = await prisma.estoqueCarro.findMany({
    where: { clientId, sumiuEm: null },
    select: { id: true, titulo: true, anoModelo: true, km: true, cor: true, precoCents: true },
  });
  if (estoque.length === 0) return null;
  const achado = acharCarro(textoDoCarro, estoque.map((c) => ({ adId: c.id, nome: c.titulo, textos: [] })));
  if (!achado.semDuvida || achado.mesmoCarro.length !== 1) return null;
  const c = estoque.find((x) => x.id === achado.mesmoCarro[0].adId);
  if (!c) return null;
  const dados = [
    c.titulo,
    c.anoModelo ? `ano ${c.anoModelo}` : null,
    c.km !== null ? `${c.km.toLocaleString("pt-BR")} km` : null,
    c.cor ? `cor ${c.cor}` : null,
    c.precoCents ? `preço ${reais(c.precoCents)}` : null,
  ].filter(Boolean).join(", ");
  return { titulo: c.titulo, dados };
}

// ───────────────────────────── A conversa ─────────────────────────────────

/**
 * Trata uma mensagem de texto no privado sob a ótica de "subir anúncio".
 * Devolve o que responder, ou `null` quando a mensagem não é desta conversa (e segue o atendimento normal).
 */
export async function tratarSubirAnuncio(pessoa: Pessoa, texto: string, agora: Date = new Date()): Promise<string | null> {
  let c = ler(await prisma.rascunhoWhatsapp.findUnique({ where: { userId: pessoa.id } }));
  const dono = await prisma.rascunhoWhatsapp.findUnique({ where: { userId: pessoa.id }, select: { venceEm: true } });

  if (c && dono && dono.venceEm <= agora) {
    await apagarTudo(pessoa.id);
    c = null;
    if (respostaDeConfirmacao(texto) === "sim") {
      return "Esse rascunho venceu (passou de 30 minutos sem resposta) e eu não subi nada. Manda as fotos de novo.";
    }
  }

  if (!c) {
    if (!pedeSubirAnuncio(texto)) return null;
    if (!escritaLiberada()) return "Ainda não consigo subir anúncio: o acesso de escrita na Meta não está configurado no sistema.";
    await descartarPendente(pessoa.id);
    try {
      await prisma.rascunhoWhatsapp.create({ data: { userId: pessoa.id, etapa: "aguardando-fotos", venceEm: new Date(agora.getTime() + VALE_MS) } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
    c = ler(await prisma.rascunhoWhatsapp.findUnique({ where: { userId: pessoa.id } }));
    if (!c) return null;
    await anotar(null, `privado ${pessoa.id}`, "subir-anuncio-comecou", "pelo texto");
    return conduzir(pessoa, c, texto, agora, true);
  }

  if (CANCELA.test(achatar(texto))) {
    await apagarTudo(pessoa.id);
    await anotar(null, `privado ${pessoa.id}`, "subir-anuncio-cancelou");
    return "Tudo bem, cancelei. Não subi nada e apaguei as fotos.";
  }
  if (c.etapa === "enviando") return "Ainda estou subindo o anúncio, só um instante. 🙏";
  return conduzir(pessoa, c, texto, agora, false);
}

/** Uma foto chegou com legenda escrita: a legenda é a mensagem de texto da pessoa. */
export async function tratarLegendaDaFoto(pessoa: Pessoa, texto: string, agora: Date = new Date()): Promise<string | null> {
  // O álbum chega em várias mensagens, quase juntas: espera um pouco pras outras fotos entrarem.
  await dormir(Number(process.env.RASCUNHO_ESPERA_ALBUM_MS ?? 6000));
  return tratarSubirAnuncio(pessoa, texto, agora);
}

/** Aplica o que a pessoa escreveu à etapa em que a conversa está, e depois decide a próxima pergunta. */
async function conduzir(pessoa: Pessoa, c: Conversa, texto: string, agora: Date, inicio: boolean): Promise<string> {
  const lojas = await lojasDaPessoa(pessoa);
  let aviso = "";

  if (lojas.length === 0) {
    await apagarTudo(pessoa.id);
    return "Não achei lojas com anúncios na sua carteira, então não tenho onde subir. Fala com o Guilherme.";
  }

  const lojaDoTexto = () => {
    const citada = acharLojaNoTexto(texto, lojas.map((l) => ({ id: l.id, nome: l.companyName })));
    return citada;
  };

  switch (c.etapa) {
    case "aguardando-fotos":
    case "coletando": {
      const citada = lojaDoTexto();
      if (citada.ambiguas.length > 0) {
        aviso = `Você citou mais de uma loja (${citada.ambiguas.map((l) => negrito(l.nome)).join(", ")}). Eu subo um anúncio por vez: me diz de qual loja é este.\n\n`;
      } else if (citada.loja && !c.clientId) {
        await salvar(c, { clientId: citada.loja.id, lojaNome: citada.loja.nome }, agora);
      }
      const carro = soOCarro(texto, citada.loja ? citada.restante : null);
      if (carro.length >= MIN_DADOS && !c.carro) await salvar(c, { carro }, agora);
      break;
    }
    case "loja": {
      const { item, filtradas } = escolherDaLista(texto, c.opcoes);
      if (!item) {
        return `Não entendi qual loja. Responde com o número:\n${listaNumerada(filtradas)}\n\nPra desistir, escreve *cancela*.`;
      }
      await salvar(c, { clientId: item.id, lojaNome: item.rotulo, adsetId: null, adsetNome: null, campanhaNome: null, baseAdId: null, baseNome: null, base: null, opcoes: [] }, agora);
      break;
    }
    case "conjunto": {
      // "12. conjunto novo": escolhe o molde E pede o conjunto novo (um carro por conjunto), numa mensagem só.
      const pediuNovo = /\bconjunto novo\b/.test(achatar(texto));
      const soEscolha = texto.replace(/conjunto novo/gi, "").trim();
      const { item, filtradas } = escolherDaLista(soEscolha, c.opcoes);
      if (!item) {
        if (pediuNovo) {
          await salvar(c, { duplicarConjunto: true }, agora);
          return `Certo, conjunto novo. Agora escolhe qual conjunto é o molde (responde com o número):\n${listaNumerada(filtradas.slice(0, MAX_NA_LISTA))}`;
        }
        return `Não entendi qual conjunto. Responde com o número (ou parte do nome):\n${listaNumerada(filtradas.slice(0, MAX_NA_LISTA))}\n\nPra desistir, escreve *cancela*.`;
      }
      const [camp, nome] = item.rotulo.includes(" › ") ? item.rotulo.split(" › ") : [null, item.rotulo];
      await salvar(
        c,
        { adsetId: item.id, adsetNome: nome.replace(/ \(pausado\)$/, ""), campanhaNome: camp, baseAdId: null, baseNome: null, base: null, opcoes: [], duplicarConjunto: pediuNovo ? true : c.duplicarConjunto },
        agora,
      );
      break;
    }
    case "base": {
      const { item, filtradas } = escolherDaLista(texto, c.opcoes);
      if (!item) {
        return `Não entendi qual anúncio. Responde com o número (ou parte do nome):\n${listaNumerada(filtradas.slice(0, MAX_NA_LISTA))}\n\nPra desistir, escreve *cancela*.`;
      }
      const r = await lerBaseDoAnuncio(c.clientId ?? "", item.id);
      if (!r.ok) {
        return `${r.erro}\n\nEscolhe outro:\n${listaNumerada(c.opcoes.slice(0, MAX_NA_LISTA))}`;
      }
      await salvar(c, { baseAdId: item.id, baseNome: r.base.nome, base: { formato: r.base.formato, legenda: r.base.legenda, titulo: r.base.titulo, link: r.base.link }, opcoes: [] }, agora);
      break;
    }
    case "dados": {
      const dados = texto.trim();
      if (dados.length < MIN_DADOS) return "Preciso de um pouco mais: modelo, ano, km, preço… O que você souber do carro. (Pra desistir, escreve *cancela*.)";
      await salvar(c, { carro: dados, nome: null, titulo: null, legenda: null, avisosDaLegenda: [] }, agora);
      break;
    }
    case "legenda": {
      // "crie uma legenda usando o carro renault sandero 2012…" é um PEDIDO, não a legenda: usa o que veio como dados do carro
      // e tenta a IA de novo. (Antes o robô aceitava a frase inteira como legenda do anúncio.)
      if (ehPedidoDeLegenda(texto)) {
        const dados = texto.replace(/^[^]*?\b(?:carro|ve[ií]culo)\b\s*/i, "").trim() || texto.trim();
        await salvar(c, { carro: dados.length >= MIN_DADOS ? dados : c.carro, nome: null, titulo: null, legenda: null, avisosDaLegenda: [] }, agora);
        break;
      }
      const legenda = texto.replace(/^\s*legenda\s*[:\-]?\s*/i, "").trim();
      if (legenda.length < 10) return "Me manda a legenda do anúncio (pode escrever *legenda: …*). Pra desistir, escreve *cancela*.";
      await salvar(c, { legenda, avisosDaLegenda: [] }, agora);
      break;
    }
    case "confirmando": {
      const r = await comandoDeConfirmacao(pessoa, c, texto, agora);
      if (r !== null) return r;
      break;
    }
  }

  return avancar(pessoa, c, agora, aviso, inicio);
}

/** O que a pessoa pode dizer no resumo final: sim, trocar legenda/título/carro, mudar conjunto/base/loja. `null` = não entendi. */
async function comandoDeConfirmacao(pessoa: Pessoa, c: Conversa, texto: string, agora: Date): Promise<string | null> {
  const t = achatar(texto);
  const resp = respostaDeConfirmacao(texto);

  if (resp === "sim") return executar(pessoa, c, agora);
  if (resp === "nao") {
    await apagarTudo(pessoa.id);
    await anotar(null, `privado ${pessoa.id}`, "subir-anuncio-cancelou", "não no resumo");
    return "Tudo bem, cancelei. Não subi nada e apaguei as fotos.";
  }

  const depois = (rotulo: RegExp) => {
    const m = rotulo.exec(texto);
    return m ? texto.slice(m[0].length).trim() : null;
  };

  const novaLegenda = depois(/^\s*legenda\s*[:\-]?\s*/i);
  if (novaLegenda !== null) {
    if (novaLegenda.length < 10) return "Escreve a legenda inteira depois de *legenda:*";
    await salvar(c, { legenda: novaLegenda, avisosDaLegenda: [] }, agora);
    return null;
  }
  const novoTitulo = depois(/^\s*t[ií]tulo\s*[:\-]?\s*/i);
  if (novoTitulo !== null) {
    if (!novoTitulo) return "Escreve o título depois de *título:*";
    await salvar(c, { titulo: novoTitulo.slice(0, 255), nome: c.nome ?? novoTitulo.slice(0, 120) }, agora);
    return null;
  }
  const novoCarro = depois(/^\s*(carro|dados)\s*[:\-]?\s*/i);
  if (novoCarro !== null) {
    if (novoCarro.length < MIN_DADOS) return "Escreve os dados do carro depois de *carro:* (modelo, ano, km, preço…)";
    await salvar(c, { carro: novoCarro, nome: null, titulo: null, legenda: null, avisosDaLegenda: [] }, agora);
    return null;
  }
  if (/^(outra legenda|de novo|refaz|refazer|nova legenda|gera de novo)/.test(t)) {
    await salvar(c, { legenda: null, avisosDaLegenda: [] }, agora);
    return null;
  }
  // "conjunto" e "base" pedem a LISTA: a etapa fica marcada pra o robô não voltar sozinho ao "mesmo de sempre".
  // "Um carro por conjunto": o conjunto do resumo vira o molde de um conjunto novo.
  if (/^(conjunto novo|novo conjunto|duplicar conjunto|duplica o conjunto|duplica conjunto|um carro por conjunto|criar conjunto)$/.test(t)) {
    await salvar(c, { duplicarConjunto: true }, agora);
    return null;
  }
  if (/^(mesmo conjunto|conjunto existente|dentro do conjunto|no mesmo conjunto|sem conjunto novo)$/.test(t)) {
    await salvar(c, { duplicarConjunto: false, orcamentoCents: null }, agora);
    return null;
  }
  const novoOrcamento = depois(/^\s*or[cç]amento\s*[:\-]?\s*/i);
  if (novoOrcamento !== null) {
    const m = /(\d+(?:[.,]\d{1,2})?)/.exec(novoOrcamento.replace(/\.(?=\d{3}\b)/g, ""));
    const cents = m ? Math.round(Number(m[1].replace(",", ".")) * 100) : NaN;
    if (!Number.isFinite(cents) || cents < ORCAMENTO_MINIMO_CENTS || cents > ORCAMENTO_MAXIMO_CENTS) {
      return "Escreve o orçamento diário em reais, de 1 a 1.000. Ex.: *orçamento: 12*";
    }
    if (!c.duplicarConjunto) {
      return "Orçamento eu só defino em conjunto NOVO (o de um conjunto que já existe eu não mexo). Escreve *conjunto novo* antes, se a loja usa um carro por conjunto.";
    }
    if (c.adsetId && !(await orcamentoDoMolde(c.adsetId))) {
      return "Nessa campanha o orçamento fica na CAMPANHA, não no conjunto: não dá pra definir por conjunto. Se quiser mudar, é no Gerenciador.";
    }
    await salvar(c, { orcamentoCents: cents }, agora);
    return null;
  }
  if (t === "conjunto") {
    await salvar(c, { etapa: "conjunto", adsetId: null, adsetNome: null, campanhaNome: null, baseAdId: null, baseNome: null, base: null, legenda: null }, agora);
    return null;
  }
  if (t === "base" || t === "anuncio base") {
    await salvar(c, { etapa: "base", baseAdId: null, baseNome: null, base: null, legenda: null }, agora);
    return null;
  }
  if (t === "loja") {
    await salvar(c, { clientId: null, lojaNome: null, adsetId: null, adsetNome: null, campanhaNome: null, baseAdId: null, baseNome: null, base: null, legenda: null }, agora);
    return null;
  }
  return "Não entendi. " + AJUDA_DO_RESUMO;
}

/** O orçamento diário do conjunto (no cadastro). `null` = orçamento na campanha (ou total), não dá pra definir por conjunto. */
async function orcamentoDoMolde(adsetId: string): Promise<number | null> {
  const a = await prisma.metaAdset.findFirst({ where: { adsetId }, select: { dailyBudgetCents: true } });
  return a?.dailyBudgetCents ?? null;
}

const AJUDA_DO_RESUMO =
  "Responde *sim* pra subir pausado, ou troca: *legenda: …*, *título: …*, *carro: …*, *conjunto*, *base*, *loja*, " +
  "*conjunto novo* (um carro por conjunto) / *mesmo conjunto*, *orçamento: 12*. Pra desistir, *cancela*.";

/**
 * Descobre o que ainda falta e pergunta, na ordem: fotos → loja → conjunto → anúncio-base → carro → legenda → resumo.
 * Cada passo só pergunta se não conseguiu resolver sozinho (loja única, "mesmo de sempre", estoque do site, IA).
 */
async function avancar(pessoa: Pessoa, c: Conversa, agora: Date, aviso: string, inicio: boolean): Promise<string> {
  // ── 1. Fotos ──────────────────────────────────────────────────────────
  const fotos = await prisma.rascunhoFoto.count({ where: { userId: pessoa.id } });
  if (fotos === 0) {
    if (c.etapa !== "aguardando-fotos") await salvar(c, { etapa: "aguardando-fotos" }, agora);
    return (
      aviso +
      (inicio ? "Bora! " : "") +
      `Manda as ${negrito("fotos")} do carro (uma foto = anúncio de foto, várias = carrossel, até ${MAX_FOTOS}) ou um ${negrito("vídeo")}. ` +
      `Depois me diz a loja e o carro, ou escreve ${negrito("pronto")}. Pra desistir, ${negrito("cancela")}.`
    );
  }

  // ── 2. Loja ───────────────────────────────────────────────────────────
  const lojas = await lojasDaPessoa(pessoa);
  if (!c.clientId) {
    if (lojas.length === 1) {
      await salvar(c, { clientId: lojas[0].id, lojaNome: lojas[0].companyName }, agora);
    } else {
      const opcoes = lojas.map((l) => ({ id: l.id, rotulo: l.companyName }));
      await salvar(c, { etapa: "loja", opcoes }, agora);
      const comVideo = (await prisma.rascunhoFoto.count({ where: { userId: pessoa.id, mime: { startsWith: "video/" } } })) > 0;
      return `${aviso}Recebi ${comVideo ? "o vídeo" : `${fotos} ${fotos === 1 ? "foto" : "fotos"}`}. De qual loja é? Responde com o número:\n${listaNumerada(opcoes)}`;
    }
  }
  const loja = lojas.find((l) => l.id === c.clientId);
  if (!loja) {
    await salvar(c, { clientId: null, lojaNome: null, etapa: "coletando" }, agora);
    return `${aviso}Essa loja não está na sua carteira. Me diz de qual loja é o carro.`;
  }

  // ── 3. Conjunto: o "mesmo de sempre" da loja, ou escolhe numa lista ──
  if (!c.adsetId) {
    const padrao = c.etapa === "conjunto" ? null : await prisma.padraoDeRascunho.findUnique({ where: { clientId: loja.id } });
    if (padrao) {
      const conjuntos = await conjuntosDaLoja(loja.id);
      const achado = conjuntos.find((o) => o.id === padrao.adsetId);
      const conjunto = achado ? await acharObjetoDaLoja(loja.id, "conjunto", padrao.adsetId) : null;
      if (achado && conjunto) {
        const [camp, nome] = achado.rotulo.includes(" › ") ? achado.rotulo.split(" › ") : [null, achado.rotulo];
        await salvar(
          c,
          { adsetId: padrao.adsetId, adsetNome: nome.replace(/ \(pausado\)$/, ""), campanhaNome: camp, duplicarConjunto: padrao.duplicarConjunto, orcamentoCents: padrao.orcamentoCents },
          agora,
        );
        // O anúncio-base de sempre, se ainda serve.
        const b = await lerBaseDoAnuncio(loja.id, padrao.baseAdId);
        if (b.ok) {
          await salvar(c, { baseAdId: padrao.baseAdId, baseNome: b.base.nome, base: { formato: b.base.formato, legenda: b.base.legenda, titulo: b.base.titulo, link: b.base.link } }, agora);
        }
      }
    }
  }
  if (!c.adsetId) {
    const conjuntos = await conjuntosDaLoja(loja.id);
    if (conjuntos.length === 0) {
      await apagarTudo(pessoa.id);
      return `A ${negrito(loja.companyName)} não tem conjunto de anúncios lido da Meta. Atualiza a loja no Legacy OS (Meta Ads) e me manda as fotos de novo.`;
    }
    const mostradas = conjuntos.slice(0, MAX_NA_LISTA);
    await salvar(c, { etapa: "conjunto", opcoes: conjuntos }, agora);
    return (
      `${aviso}Em qual conjunto da ${negrito(loja.companyName)} eu subo? Responde com o número` +
      `${conjuntos.length > MAX_NA_LISTA ? " ou parte do nome" : ""}:\n${listaNumerada(mostradas)}` +
      `\n\nSe a loja usa *um carro por conjunto*, escolhe o conjunto que serve de molde: no resumo é só escrever *conjunto novo*.`
    );
  }

  // ── 4. Anúncio-base: o primeiro do conjunto que dá pra duplicar ──────
  if (!c.baseAdId || !c.base) {
    const candidatos = await anunciosDoConjunto(loja.id, c.adsetId);
    const motivos: string[] = [];
    // Quando a pessoa pediu pra trocar o anúncio-base, mostra a lista em vez de escolher sozinho.
    for (const cand of c.etapa === "base" ? [] : candidatos.slice(0, 4)) {
      const r = await lerBaseDoAnuncio(loja.id, cand.id);
      if (r.ok) {
        await salvar(c, { baseAdId: cand.id, baseNome: r.base.nome, base: { formato: r.base.formato, legenda: r.base.legenda, titulo: r.base.titulo, link: r.base.link }, opcoes: [] }, agora);
        break;
      }
      motivos.push(`${cand.rotulo}: ${r.erro}`);
    }
    if (!c.baseAdId || !c.base) {
      if (candidatos.length === 0) {
        const vazio = c.adsetNome ?? "";
        const conjuntos = await conjuntosDaLoja(loja.id);
        await salvar(c, { etapa: "conjunto", opcoes: conjuntos, adsetId: null, adsetNome: null, campanhaNome: null }, agora);
        return (
          `${aviso}O conjunto ${negrito(vazio)} não tem anúncio pra eu duplicar (o anúncio-base tem que ser de dentro do conjunto). ` +
          `Escolhe outro, responde com o número:\n${listaNumerada(conjuntos.slice(0, MAX_NA_LISTA))}`
        );
      }
      const pediuTroca = c.etapa === "base";
      await salvar(c, { etapa: "base", opcoes: candidatos }, agora);
      return (
        `${aviso}${pediuTroca ? "" : `Não achei sozinho um anúncio bom pra duplicar${motivos[0] ? ` (${motivos[0]})` : ""}. `}` +
        `Qual anúncio do conjunto ${negrito(c.adsetNome ?? "")} eu uso como molde? Só serve anúncio de foto ou carrossel. Responde com o número:\n` +
        listaNumerada(candidatos.slice(0, MAX_NA_LISTA))
      );
    }
  }

  // ── 5. Dados do carro (+ estoque do site) ─────────────────────────────
  if (!c.carro || c.carro.length < MIN_DADOS) {
    await salvar(c, { etapa: "dados" }, agora);
    return `${aviso}Me conta do carro: modelo, ano, km, preço… O que você souber (a legenda só usa isso). Ex.: ${negrito("Virtus 1.6 2021 automático, 45 mil km, R$ 68.900")}`;
  }
  let estoqueUsado = "";
  if (!c.titulo || !c.nome) {
    const doEstoque = await carroDoEstoque(loja.id, c.carro);
    if (doEstoque) {
      estoqueUsado = doEstoque.titulo;
      // Quem escreveu bastante (km, preço…) manda: o estoque só dá o nome. Quem escreveu pouco ("virtus 2021") ganha a ficha do site.
      const dados = c.carro.length >= 25 ? c.carro : doEstoque.dados;
      await salvar(c, { carro: dados, nome: c.nome ?? doEstoque.titulo.slice(0, 120), titulo: c.titulo ?? doEstoque.titulo.slice(0, 120) }, agora);
    } else {
      const curto = nomeCurtoDoCarro(c.carro);
      await salvar(c, { nome: c.nome ?? curto, titulo: c.titulo ?? curto }, agora);
    }
  }

  // ── 6. Legenda: a IA escreve, a pessoa confere ────────────────────────
  if (!c.legenda) {
    const g = await gerarLegendaDoCarro({ clientId: loja.id, dadosDoCarro: c.carro, legendaDoBase: c.base.legenda });
    if (!g.ok) {
      await salvar(c, { etapa: "legenda" }, agora);
      return `${aviso}${g.erro}\n\nMe manda a legenda do anúncio (pode escrever *legenda: …*).`;
    }
    await salvar(c, { legenda: g.dados.legenda, avisosDaLegenda: g.dados.avisos }, agora);
  }

  // ── 7. O resumo ───────────────────────────────────────────────────────
  await salvar(c, { etapa: "confirmando", opcoes: [] }, agora);
  const dup = c.duplicarConjunto && c.adsetId;
  const [orcamentoMolde, doMolde] = dup ? await Promise.all([orcamentoDoMolde(c.adsetId!), anunciosDoConjuntoNaMeta(c.adsetId!)]) : [null, null];
  const temVideo = (await prisma.rascunhoFoto.count({ where: { userId: pessoa.id, mime: { startsWith: "video/" } } })) > 0;
  return aviso + resumo(c, fotos, estoqueUsado, orcamentoMolde, doMolde?.length ?? 0, temVideo);
}

function resumo(c: Conversa, fotos: number, estoqueUsado: string, orcamentoMolde: number | null, anunciosNoMolde: number, temVideo = false): string {
  const base = c.base as BaseSalva;
  const linhas = [
    "📋 *Confere antes de subir* (o anúncio vai PAUSADO)",
    `• Loja: ${negrito(c.lojaNome ?? "")}`,
    c.duplicarConjunto
      ? `• Conjunto: *NOVO*, ${negrito(c.nome ?? "")}, duplicando ${negrito(`${c.campanhaNome ? c.campanhaNome + " › " : ""}${c.adsetNome ?? ""}`)}` +
        ` · orçamento ${
          orcamentoMolde === null
            ? "definido na campanha"
            : c.orcamentoCents
              ? `${reais(c.orcamentoCents)}/dia`
              : `${reais(orcamentoMolde)}/dia (o do molde)`
        } (nasce pausado)`
      : `• Conjunto: ${negrito(`${c.campanhaNome ? c.campanhaNome + " › " : ""}${c.adsetNome ?? ""}`)}`,
    `• Duplicando: ${negrito(c.baseNome ?? "")} (${base.formato})`,
    temVideo ? `• Mídia: 🎬 vídeo → anúncio de vídeo${fotos > 1 ? " (as fotos ficam de fora)" : ""}` : `• Fotos: ${fotos} → ${fotos === 1 ? "foto única" : "carrossel"}`,
    `• Carro: ${c.carro}${estoqueUsado ? " (do estoque do site)" : ""}`,
    base.titulo ? `• Título: ${c.titulo}` : null,
    `• Link: ${base.link ? "o mesmo do anúncio base" : "(sem link)"}`,
  ].filter((x): x is string => x !== null);
  const avisos = [
    ...(c.duplicarConjunto && anunciosNoMolde > 1
      ? [`O conjunto molde tem ${anunciosNoMolde} anúncios. O conjunto novo fica só com o anúncio deste carro (os outros não vão junto). O conjunto original não é mexido.`]
      : []),
    ...c.avisosDaLegenda,
  ].map((a) => `⚠️ ${a}`).join("\n");
  return `${linhas.join("\n")}\n\n*Legenda:*\n${c.legenda}\n${avisos ? `\n${avisos}\n` : ""}\n${AJUDA_DO_RESUMO}`;
}

// ───────────────────────────── Subir de verdade ───────────────────────────

/** Faz o que foi confirmado: sobe as fotos, duplica o anúncio-base PAUSADO e lembra o "mesmo de sempre". */
async function executar(pessoa: Pessoa, c: Conversa, agora: Date): Promise<string> {
  // Pega a conversa pra si: o "sim" duplicado (dedo duplo, reenvio) não sobe duas vezes.
  const tomou = await prisma.rascunhoWhatsapp.updateMany({ where: { userId: pessoa.id, etapa: "confirmando" }, data: { etapa: "enviando" } });
  if (tomou.count !== 1) return "Esse pedido já foi tratado.";
  const desfazer = () => prisma.rascunhoWhatsapp.updateMany({ where: { userId: pessoa.id, etapa: "enviando" }, data: { etapa: "confirmando", venceEm: new Date(agora.getTime() + VALE_MS) } });

  try {
    if (!c.clientId || !c.adsetId || !c.baseAdId || !c.base || !c.legenda || !c.nome) {
      await desfazer();
      return "Faltou alguma coisa no resumo. Manda *conjunto* ou *base* pra refazer.";
    }
    // A loja ainda é da carteira? (A conversa pode ter 30 minutos.)
    const loja = await prisma.client.findFirst({ where: { id: c.clientId, ...CARTEIRA_NO_META, ...escopoDaCarteira(pessoa) }, select: { id: true } });
    if (!loja) {
      await apagarTudo(pessoa.id);
      return "Essa loja não está mais na sua carteira. Não subi nada.";
    }

    const midias = await prisma.rascunhoFoto.findMany({ where: { userId: pessoa.id }, orderBy: { criadoEm: "asc" }, select: { bytes: true, mime: true } });
    if (midias.length === 0) {
      await desfazer();
      return "Não tenho mais as fotos. Manda de novo.";
    }
    const doVideo = midias.find((m) => m.mime.startsWith("video/")) ?? null;
    const fotos = doVideo ? [] : midias;

    // Vídeo: sobe pra conta do conjunto (em pedaços) e o anúncio sai de vídeo (capa = miniatura da Meta).
    let video: { videoId: string } | null = null;
    if (doVideo) {
      const conta = await contaDoConjunto(c.clientId, c.adsetId);
      if (!conta) {
        await desfazer();
        return "Não achei a conta desse conjunto. Manda *conjunto* pra escolher de novo.";
      }
      const v = await subirVideo(conta.contaMeta, new Uint8Array(doVideo.bytes), `${c.nome}.mp4`);
      if (!v.ok) {
        await desfazer();
        await anotar(null, `privado ${pessoa.id}`, "subir-anuncio-video-falhou", v.erro);
        return `Não consegui enviar o vídeo pra Meta: ${v.erro}\n\nResponde *sim* pra tentar de novo, ou *cancela*.`;
      }
      video = { videoId: v.videoId };
    }

    const hashes: string[] = [];
    for (let i = 0; i < fotos.length; i++) {
      const r = await subirFotoDoRascunho({ clientId: c.clientId, adsetId: c.adsetId, nome: `foto${i + 1}.jpg`, bytes: Buffer.from(fotos[i].bytes) });
      if (!r.ok) {
        await desfazer();
        await anotar(null, `privado ${pessoa.id}`, "subir-anuncio-foto-falhou", r.erro);
        return `Não consegui enviar a foto ${i + 1}: ${r.erro}\n\nResponde *sim* pra tentar de novo, ou *cancela*.`;
      }
      hashes.push(r.hash);
    }

    const r = await subirRascunho({
      clientId: c.clientId,
      baseAdId: c.baseAdId,
      adsetId: c.adsetId,
      conjuntoNovo: c.duplicarConjunto ? { nome: c.nome, orcamentoCents: c.orcamentoCents, jaCriadoId: c.conjuntoCriadoId } : null,
      nome: c.nome,
      legenda: c.legenda,
      titulo: c.base.titulo ? (c.titulo ?? "") : null,
      link: c.base.link,
      hashes,
      video,
      pedidoPor: `${pessoa.name} (WhatsApp)`,
      quemId: pessoa.id,
    });
    if (!r.ok) {
      await desfazer();
      if (r.adsetCriado) await prisma.rascunhoWhatsapp.updateMany({ where: { userId: pessoa.id }, data: { conjuntoCriadoId: r.adsetCriado.adsetId } });
      await anotar(null, `privado ${pessoa.id}`, "subir-anuncio-recusado", r.erro ?? "");
      return `Não consegui criar o anúncio: ${r.erro}\n\nResponde *sim* pra tentar de novo, ou ajusta (*conjunto*, *base*…), ou *cancela*.`;
    }

    await apagarTudo(pessoa.id);
    await anotar(null, `privado ${pessoa.id}`, "subir-anuncio-criou", `${r.formato} · ${video ? "vídeo" : `${hashes.length} foto(s)`}`);
    try {
      revalidatePath(`/meta-ads/${c.clientId}/subir-anuncio`);
    } catch {
      // Fora de um pedido do Next (num teste) não há o que atualizar.
    }

    const avisos = r.avisos.map((a) => `⚠️ ${a.texto}`).join("\n");
    return (
      `✅ Subi o anúncio ${negrito(c.nome)} na ${negrito(c.lojaNome ?? "")} — PAUSADO (${r.formato === "video" ? "vídeo" : r.formato === "carrossel" ? "carrossel" : "foto única"})` +
      (r.adsetCriado ? `, num conjunto NOVO (${negrito(r.adsetCriado.nome)}), também pausado` : "") +
      `.\nEle ainda *não está no ar* e não gasta nada. Confere e publica no Gerenciador${r.adsetCriado ? " (ligue o conjunto e o anúncio)" : ""}:\n${r.linkDoGerenciador}` +
      (avisos ? `\n\n${avisos}` : "") +
      `\n\nPróximo carro da ${c.lojaNome}? É só mandar as fotos ou o vídeo: ${c.duplicarConjunto ? "eu duplico o mesmo conjunto molde" : "eu uso o mesmo conjunto"}.`
    );
  } catch (e) {
    await desfazer();
    await anotar(null, `privado ${pessoa.id}`, "subir-anuncio-estourou", e instanceof Error ? e.message : String(e));
    return "Deu um erro aqui e eu não terminei de subir. Responde *sim* pra tentar de novo, ou *cancela*.";
  }
}
