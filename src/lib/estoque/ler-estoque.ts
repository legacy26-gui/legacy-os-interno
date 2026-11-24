import "server-only";

import { prisma } from "@/lib/prisma";
import { lerCarro, lerLista, type CarroLido } from "./autocerto";
import { lerCatalogo, pareceCatalogo } from "./site-catalogo";
import { lerApiDeVeiculos, pareceApiDeVeiculos } from "./site-api";

// A leitura do estoque de uma loja: lê o site, atualiza o banco.
//
// ── O que isto NÃO faz ───────────────────────────────────────────────────
//
// Não avisa ninguém de carro que sumiu (decisão do Guilherme: muito carro sai do site por
// motivo que não é venda, e muito carro nem está nos anúncios). O sumiço só é ANOTADO
// (`sumiuEm`), pra a inteligência comercial usar depois.
//
// ── As travas contra uma leitura ruim ────────────────────────────────────
//
// Um site fora do ar, uma página de erro com status 200 ou uma lista cortada pela
// metade pareceriam "a loja vendeu tudo". Marcar tudo como sumido por isso destruiria
// a data de entrada de cada carro — que é justamente o que se quer guardar. Então:
//
//   - lista vazia, ou que não parece AutoCerto: erro, e nada é marcado;
//   - página que anuncia mais carros do que trouxe: lista incompleta, nada é marcado;
//   - lista que de repente tem menos da metade do que se conhecia (com 10+ carros):
//     suspeito, nada é marcado — a leitura seguinte decide.
//
// ── Educação com o site da loja ──────────────────────────────────────────
//
// O site é de terceiros (e a hospedagem do AutoCerto, de mais um). Uma requisição por vez,
// com pausa entre elas, identificando o sistema, e a página de cada carro só é lida quando o
// carro é NOVO, ou em rodízio (os mais antigos primeiro) pra renovar o preço.

const USER_AGENT = "LegacyOS-estoque/1.0 (leitura do estoque pela agência da loja)";
const PRAZO_MS = 20_000;
const PAUSA_MS = 350;
/** Páginas de carro lidas por loja a cada passada, no máximo (novos + rodízio). */
const DETALHES_POR_PASSADA = 70;
/** Dessas, quantas são do rodízio de renovação (o resto é de carro novo). */
const RODIZIO = 12;

export interface ResultadoDaLeitura {
  ok: boolean;
  erro: string | null;
  total: number;
  novos: number;
  sairam: number;
  voltaram: number;
  detalhesLidos: number;
  /** A leitura foi boa mas, por cautela, não marcou carros como sumidos. */
  semMarcarSaidas: string | null;
}

const VAZIO: ResultadoDaLeitura = { ok: false, erro: null, total: 0, novos: 0, sairam: 0, voltaram: 0, detalhesLidos: 0, semMarcarSaidas: null };
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** O endereço é seguro pra ler? (Em teste, ESTOQUE_PERMITE_LOCAL=1 libera o http local.) */
export function urlDeSiteSegura(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (process.env.ESTOQUE_PERMITE_LOCAL === "1" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return true;
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":") || h.startsWith("[")) return false;
  return h.includes(".");
}

/** Só a origem (https://site.com.br), sem caminho nem barra no fim. */
export function origemDoSite(url: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.origin;
  } catch {
    return null;
  }
}

async function baixar(url: string): Promise<{ ok: true; html: string } | { ok: false; erro: string }> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: AbortSignal.timeout(PRAZO_MS),
      cache: "no-store",
    });
    if (!r.ok) return { ok: false, erro: `o site respondeu ${r.status}` };
    const html = await r.text();
    if (html.length > 3_000_000) return { ok: false, erro: "a página veio grande demais" };
    return { ok: true, html };
  } catch {
    return { ok: false, erro: "o site não respondeu" };
  }
}

async function gravarCarro(clientId: string, codigo: string, url: string, c: CarroLido, agora: Date, ehNovo: boolean) {
  const dados = {
    titulo: c.titulo.slice(0, 200),
    marca: c.marca,
    modelo: c.modelo,
    versao: c.versao,
    anoModelo: c.anoModelo,
    anoFabricacao: c.anoFabricacao,
    cor: c.cor,
    km: c.km,
    precoCents: c.precoCents,
    foto: c.foto,
    url,
    detalheEm: agora,
  };
  const antes = ehNovo ? null : await prisma.estoqueCarro.findUnique({ where: { clientId_codigo: { clientId, codigo } }, select: { id: true, precoCents: true } });
  const carro = await prisma.estoqueCarro.upsert({
    where: { clientId_codigo: { clientId, codigo } },
    create: { clientId, codigo, ...dados, primeiraVezEm: agora, ultimaVezEm: agora },
    update: { ...dados, ultimaVezEm: agora, sumiuEm: null },
    select: { id: true },
  });
  // Histórico de preço: uma linha na primeira vez e a cada mudança.
  if (c.precoCents !== null && (!antes || antes.precoCents !== c.precoCents)) {
    await prisma.estoquePreco.create({ data: { carroId: carro.id, precoCents: c.precoCents, vistoEm: agora } });
  }
}

export async function lerEstoqueDaLoja(clientId: string, agora: Date = new Date()): Promise<ResultadoDaLeitura> {
  const loja = await prisma.estoqueDaLoja.findUnique({ where: { clientId } });
  if (!loja) return { ...VAZIO, erro: "esta loja não tem site de estoque ligado" };
  const origem = origemDoSite(loja.siteUrl);
  const fim = async (r: ResultadoDaLeitura) => {
    await prisma.estoqueDaLoja.update({
      where: { clientId },
      data: { ultimaLeituraEm: agora, ultimoErro: r.erro, ...(r.ok ? { ultimoTotal: r.total } : {}) },
    });
    return r;
  };
  if (!origem || !urlDeSiteSegura(origem)) return fim({ ...VAZIO, erro: "o endereço do site não é válido" });
  if (loja.sistema === "catalogo") return fim(await lerSiteDeCatalogo(clientId, origem, agora));
  if (loja.sistema === "api") return fim(await lerSiteComApi(clientId, origem, agora));

  // ── 1. A lista ───────────────────────────────────────────────────────
  const paginaLista = await baixar(`${origem}/Veiculos`);
  if (!paginaLista.ok) return fim({ ...VAZIO, erro: paginaLista.erro });
  const lista = lerLista(paginaLista.html);
  if (!lista.ehAutoCerto) return fim({ ...VAZIO, erro: "este site não parece ser do AutoCerto" });
  if (lista.itens.length === 0) return fim({ ...VAZIO, erro: "a lista de veículos veio vazia" });

  const noAr = new Set(lista.itens.map((i) => i.codigo));
  const conhecidos = await prisma.estoqueCarro.findMany({
    where: { clientId },
    select: { codigo: true, sumiuEm: true, detalheEm: true },
  });
  const porCodigo = new Map(conhecidos.map((c) => [c.codigo, c]));

  // ── 2. Quem precisa da página do carro: os novos, e um rodízio dos mais antigos ──
  const novos = lista.itens.filter((i) => !porCodigo.has(i.codigo));
  const rodizio = lista.itens
    .filter((i) => porCodigo.has(i.codigo))
    .sort((a, b) => (porCodigo.get(a.codigo)!.detalheEm?.getTime() ?? 0) - (porCodigo.get(b.codigo)!.detalheEm?.getTime() ?? 0))
    .slice(0, RODIZIO);
  const aLer = [...novos, ...rodizio].slice(0, DETALHES_POR_PASSADA);

  let detalhesLidos = 0;
  let criados = 0;
  for (const item of aLer) {
    await dormir(PAUSA_MS);
    const pagina = await baixar(`${origem}${item.caminho}`);
    if (!pagina.ok) continue; // um carro que não carregou fica pra próxima
    const carro = lerCarro(pagina.html);
    if (!carro) continue;
    detalhesLidos++;
    const eraNovo = !porCodigo.has(item.codigo);
    await gravarCarro(clientId, item.codigo, `${origem}${item.caminho}`, carro, agora, eraNovo);
    if (eraNovo) criados++;
  }

  // Quem está na lista mas não teve a página lida agora (o resto da loja): só "visto hoje".
  const lidos = new Set(aLer.map((i) => i.codigo));
  const restantes = lista.itens.filter((i) => porCodigo.has(i.codigo) && !lidos.has(i.codigo)).map((i) => i.codigo);
  const voltaram = conhecidos.filter((c) => noAr.has(c.codigo) && c.sumiuEm !== null).length;
  if (restantes.length) {
    await prisma.estoqueCarro.updateMany({ where: { clientId, codigo: { in: restantes } }, data: { ultimaVezEm: agora, sumiuEm: null } });
  }

  // ── 3. Quem saiu da lista (só se a leitura merece confiança) ──────────
  let semMarcarSaidas: string | null = null;
  const ativosAntes = conhecidos.filter((c) => c.sumiuEm === null);
  const candidatos = ativosAntes.filter((c) => !noAr.has(c.codigo));
  if (lista.totalDito !== null && lista.totalDito > lista.itens.length) {
    semMarcarSaidas = `a página anuncia ${lista.totalDito} carros e trouxe ${lista.itens.length}`;
  } else if (ativosAntes.length >= 10 && lista.itens.length < ativosAntes.length / 2) {
    semMarcarSaidas = `a lista encolheu de ${ativosAntes.length} para ${lista.itens.length} de uma vez`;
  }
  let sairam = 0;
  if (!semMarcarSaidas && candidatos.length > 0) {
    await prisma.estoqueCarro.updateMany({ where: { clientId, codigo: { in: candidatos.map((c) => c.codigo) } }, data: { sumiuEm: agora } });
    sairam = candidatos.length;
  }

  return fim({
    ok: true,
    erro: semMarcarSaidas ? `lista suspeita (${semMarcarSaidas}): não marquei saídas` : null,
    total: lista.itens.length,
    novos: criados,
    sairam,
    voltaram,
    detalhesLidos,
    semMarcarSaidas,
  });
}

/**
 * Site de catálogo (ex.: 7pointmotors.com): UMA página (/estoque) traz todos os carros com todos os dados, então cada carro é
 * gravado a cada leitura (preço sempre fresco) sem abrir página nenhuma de carro. As mesmas travas do AutoCerto valem pra
 * marcar saída: lista vazia ou que encolheu pela metade de uma vez não marca ninguém como saído.
 */
async function lerSiteDeCatalogo(clientId: string, origem: string, agora: Date): Promise<ResultadoDaLeitura> {
  const pagina = await baixar(`${origem}/estoque`);
  if (!pagina.ok) return { ...VAZIO, erro: pagina.erro };
  if (!pareceCatalogo(pagina.html)) return { ...VAZIO, erro: "a página /estoque não trouxe a lista de carros no formato esperado" };
  return gravarListaInteira(clientId, origem, lerCatalogo(pagina.html), agora);
}

/** Site com API JSON pública de veículos (ex.: bomjesusautomoveis.com): GET /api/vehicles traz a lista inteira. */
async function lerSiteComApi(clientId: string, origem: string, agora: Date): Promise<ResultadoDaLeitura> {
  const resposta = await baixar(`${origem}/api/vehicles`);
  if (!resposta.ok) return { ...VAZIO, erro: resposta.erro };
  let dados: unknown;
  try {
    dados = JSON.parse(resposta.html);
  } catch {
    return { ...VAZIO, erro: "a lista de veículos do site não veio em JSON" };
  }
  if (!pareceApiDeVeiculos(dados)) return { ...VAZIO, erro: "a lista de veículos do site não veio no formato esperado" };
  return gravarListaInteira(clientId, origem, lerApiDeVeiculos(dados), agora);
}

/**
 * Grava uma lista que já veio INTEIRA e com todos os dados (catálogo e API): cada carro a cada leitura, sem abrir página de carro.
 * As mesmas travas do AutoCerto valem pra marcar saída.
 */
async function gravarListaInteira(clientId: string, origem: string, carros: (CarroLido & { codigo: string; caminho: string })[], agora: Date): Promise<ResultadoDaLeitura> {
  if (carros.length === 0) return { ...VAZIO, erro: "a lista de veículos veio vazia" };

  const conhecidos = await prisma.estoqueCarro.findMany({ where: { clientId }, select: { codigo: true, sumiuEm: true } });
  const porCodigo = new Map(conhecidos.map((c) => [c.codigo, c]));
  const noAr = new Set(carros.map((c) => c.codigo));
  let novos = 0;
  for (const c of carros) {
    const eraNovo = !porCodigo.has(c.codigo);
    await gravarCarro(clientId, c.codigo, `${origem}${c.caminho}`, c, agora, eraNovo);
    if (eraNovo) novos++;
  }
  const voltaram = conhecidos.filter((c) => noAr.has(c.codigo) && c.sumiuEm !== null).length;

  let semMarcarSaidas: string | null = null;
  const ativosAntes = conhecidos.filter((c) => c.sumiuEm === null);
  const candidatos = ativosAntes.filter((c) => !noAr.has(c.codigo));
  if (ativosAntes.length >= 10 && carros.length < ativosAntes.length / 2) {
    semMarcarSaidas = `a lista encolheu de ${ativosAntes.length} para ${carros.length} de uma vez`;
  }
  let sairam = 0;
  if (!semMarcarSaidas && candidatos.length > 0) {
    await prisma.estoqueCarro.updateMany({ where: { clientId, codigo: { in: candidatos.map((c) => c.codigo) } }, data: { sumiuEm: agora } });
    sairam = candidatos.length;
  }
  return {
    ok: true,
    erro: semMarcarSaidas ? `lista suspeita (${semMarcarSaidas}): não marquei saídas` : null,
    total: carros.length,
    novos,
    sairam,
    voltaram,
    detalhesLidos: 0,
    semMarcarSaidas,
  };
}

/**
 * Lê as lojas que têm site ligado, a que está há mais tempo sem leitura primeiro, até o tempo
 * acabar. O que não deu tempo fica pra próxima passada (e é o primeiro dela).
 */
export async function lerTodasAsLojas(limiteMs: number): Promise<{ lojas: number; ok: number; falhas: number; paradaPorTempo: boolean }> {
  const inicio = Date.now();
  const lojas = await prisma.estoqueDaLoja.findMany({
    orderBy: [{ ultimaLeituraEm: { sort: "asc", nulls: "first" } }],
    select: { clientId: true },
  });
  let ok = 0;
  let falhas = 0;
  let lidas = 0;
  for (const l of lojas) {
    if (Date.now() - inicio > limiteMs) return { lojas: lidas, ok, falhas, paradaPorTempo: true };
    const r = await lerEstoqueDaLoja(l.clientId).catch(() => ({ ...VAZIO, erro: "erro inesperado" }));
    lidas++;
    if (r.ok) ok++;
    else falhas++;
  }
  return { lojas: lidas, ok, falhas, paradaPorTempo: false };
}
