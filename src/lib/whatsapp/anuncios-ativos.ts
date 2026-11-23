import "server-only";

import { prisma } from "@/lib/prisma";

// "Quais anúncios ativos?" no grupo da loja: a lista dos carros que estão no ar, organizada.
//
// ── O que entra ─────────────────────────────────────────────────────────
//
// Só ANÚNCIO que está no ar de verdade (effectiveStatus ACTIVE: o anúncio, o conjunto e a campanha estão
// ligados), de TODOS os conjuntos e campanhas da loja. O que está pausado, em análise ou recusado fica de fora.
//
// ── Como fica organizado ────────────────────────────────────────────────
//
// Um carro por linha, em ordem alfabética. O mesmo carro costuma ter mais de um anúncio ("C3 foto" e
// "C3 foto vídeo — Cópia"): eles viram uma linha só, com os leads somados. Cada linha diz quantos anúncios o
// carro tem no ar e quantos leads trouxe.
//
// Só LEADS, sem gasto nem custo por lead: o gasto já vai em outras mensagens do robô, e esta lista é pra bater o
// olho nos carros que estão rodando. Os leads são o ACUMULADO do carro (o mesmo número que o robô usa ao registrar
// uma venda), e a lista diz até quando a Meta foi lida, porque não é tempo real.
//
// ── O que NÃO faz ───────────────────────────────────────────────────────
//
// Só lê. Não pausa, não liga, não muda nada. Por isso pode responder mesmo na loja que não autorizou o robô a
// desligar anúncio sozinho.

const SEM_ACENTO = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A frase pede a lista dos anúncios/carros que estão no ar? Pura. */
export function pedeListaDeAnuncios(texto: string): boolean {
  const t = SEM_ACENTO(texto).replace(/[?!.,;:]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return false;
  // Quem pede pra MEXER (pausar, desligar, vender, subir…) não está pedindo uma lista.
  if (/\b(paus\w*|desl\w*|tir[ae]\w*|vend\w*|ativ(a|e|ar|em)|lig(a|ue|ar)|sub(a|e|ir)|aument\w*|dimin\w*|mud\w*|troc\w*|cri(a|e|ar)|exclu\w*|apag\w*)\b/.test(t)) return false;
  const itens = "(anuncios?|carros?|veiculos?|campanhas?)";
  const noAr = "(ativos?|ativas?|rodando|no ar|ligados?|ligadas?|veiculando|anunciando|na rua|em veiculacao)";
  return (
    new RegExp(`^${itens} ${noAr}$`).test(t) ||
    new RegExp(`\\b(quais|qual|lista|listar|lista dos|lista de|mostra|mostrar|me mostra|manda|me manda|mande|ver|quero ver)\\b.*\\b${itens}\\b.*\\b${noAr}\\b`).test(t) ||
    (new RegExp(`\\b${itens} ${noAr}\\b`).test(t) && /\b(quais|qual|lista|mostra|manda|mande|ver|quero)\b/.test(t)) ||
    new RegExp(`\\bo que (esta|ta|tem|estao|tao) ${noAr}\\b`).test(t) ||
    new RegExp(`\\bquais? ${itens} (estao|tao|tem) ${noAr}\\b`).test(t)
  );
}

const ORDEM_DOS_FORMATOS = ["foto", "vídeo", "carrossel"];

const PALAVRAS_DE_FORMATO = /\b(foto|fotos|v[ií]deo|v[ií]deos|carrossel|reels?|stories|story)\b/gi;

/** O nome do carro tirado do nome do anúncio: sem foto/vídeo/cópia/(pausado). Pura. */
export function nomeDoCarro(nomeDoAnuncio: string): string {
  const limpo = nomeDoAnuncio
    .replace(/\(pausado\)/gi, " ")
    .replace(/\bc[oó]pia\b/gi, " ")
    .replace(PALAVRAS_DE_FORMATO, " ")
    .replace(/[—–]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-\s]+|[-\s]+$/g, "");
  return limpo || nomeDoAnuncio.trim();
}

/** Os formatos que aparecem no nome do anúncio ("foto", "vídeo", "carrossel"). Pura. */
export function formatosNoNome(nomeDoAnuncio: string): string[] {
  const t = SEM_ACENTO(nomeDoAnuncio);
  const r: string[] = [];
  if (/\bcarrossel\b/.test(t)) r.push("carrossel");
  if (/\bvideos?\b/.test(t)) r.push("vídeo");
  if (/\bfotos?\b/.test(t)) r.push("foto");
  return r;
}

export interface AnuncioNoAr {
  adId: string;
  nome: string;
  spendCents: number;
  leads: number;
  desde: Date | null;
  atualizadoEm: Date | null;
  temNumeros: boolean;
}

export interface CarroNoAr {
  nome: string;
  anuncios: number;
  formatos: string[];
  spendCents: number;
  leads: number;
  desde: Date | null;
  temNumeros: boolean;
}

/** Junta os anúncios do mesmo carro e põe os carros em ordem alfabética. Pura. */
export function agruparPorCarro(anuncios: AnuncioNoAr[]): CarroNoAr[] {
  const mapa = new Map<string, CarroNoAr>();
  for (const a of anuncios) {
    const nome = nomeDoCarro(a.nome);
    const chave = SEM_ACENTO(nome).replace(/[^a-z0-9]+/g, " ").trim();
    const c =
      mapa.get(chave) ??
      ({ nome, anuncios: 0, formatos: [], spendCents: 0, leads: 0, desde: null, temNumeros: false } satisfies CarroNoAr);
    c.anuncios += 1;
    for (const f of formatosNoNome(a.nome)) if (!c.formatos.includes(f)) c.formatos.push(f);
    // Sempre na mesma ordem, não na que o banco devolveu.
    c.formatos.sort((x, y) => ORDEM_DOS_FORMATOS.indexOf(x) - ORDEM_DOS_FORMATOS.indexOf(y));
    c.spendCents += a.spendCents;
    c.leads += a.leads;
    if (a.desde && (!c.desde || a.desde < c.desde)) c.desde = a.desde;
    c.temNumeros = c.temNumeros || a.temNumeros;
    mapa.set(chave, c);
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base", numeric: true }));
}

const quando = (d: Date) =>
  `${d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}`;

function linhaDoCarro(c: CarroNoAr, n: number): string {
  const formatos = c.formatos.length ? ` (${c.formatos.join(", ")})` : "";
  const topo = `${n}. *${c.nome}* — ${c.anuncios} ${c.anuncios === 1 ? "anúncio" : "anúncios"}${formatos}`;
  if (!c.temNumeros) return `${topo} · ainda sem número da Meta`;
  return `${topo} · ${c.leads} ${c.leads === 1 ? "lead" : "leads"}`;
}

/** Quebra a lista em mensagens que cabem no WhatsApp, sem cortar um carro no meio. Pura. */
export function montarMensagens(opcoes: {
  loja: string;
  carros: CarroNoAr[];
  anunciosNoAr: number;
  atualizadoEm: Date | null;
  limite?: number;
}): string[] {
  const { loja, carros, anunciosNoAr } = opcoes;
  const limite = opcoes.limite ?? 3000;
  if (carros.length === 0) return [`Não tem nenhum anúncio ativo agora na *${loja}*.`];

  const topo = `📋 *Anúncios no ar — ${loja}*\n${carros.length} ${carros.length === 1 ? "carro" : "carros"} · ${anunciosNoAr} ${anunciosNoAr === 1 ? "anúncio ativo" : "anúncios ativos"}`;
  const totalLeads = carros.reduce((s, c) => s + c.leads, 0);
  const rodape =
    `*Total:* ${totalLeads} ${totalLeads === 1 ? "lead" : "leads"} nesses carros` +
    (opcoes.atualizadoEm ? `\n_Leads acumulados de cada carro, lidos da Meta em ${quando(opcoes.atualizadoEm)}._` : "");

  const blocos = carros.map((c, i) => linhaDoCarro(c, i + 1));
  const mensagens: string[] = [];
  let atual = `${topo}\n`;
  for (const b of blocos) {
    if ((atual + "\n" + b).length > limite) {
      mensagens.push(atual.trimEnd());
      atual = `📋 *${loja}* (continuação)\n`;
    }
    atual += `\n${b}`;
  }
  // O total vai na última mensagem; se não couber, numa só dele.
  if ((atual + "\n\n" + rodape).length <= limite) mensagens.push(`${atual}\n\n${rodape}`);
  else mensagens.push(atual, rodape);
  return mensagens;
}

/** Os anúncios no ar da loja (todos os conjuntos), já organizados em mensagens prontas. */
export async function listaDosAnunciosAtivos(loja: { nome: string; contas: string[] }): Promise<{ mensagens: string[]; carros: number; anuncios: number }> {
  if (loja.contas.length === 0) {
    return { mensagens: [`A *${loja.nome}* não tem conta de anúncio ligada, então não tenho anúncios pra listar.`], carros: 0, anuncios: 0 };
  }
  const ativos = await prisma.metaAdCreative.findMany({
    where: { adAccountId: { in: loja.contas }, effectiveStatus: "ACTIVE" },
    select: { adId: true, adName: true },
  });
  const vida = ativos.length
    ? await prisma.metaLifetime.findMany({
        where: { adAccountId: { in: loja.contas }, adId: { in: ativos.map((a) => a.adId) } },
        select: { adId: true, spendCents: true, leads: true, desde: true, atualizadoEm: true },
      })
    : [];
  const dosNumeros = new Map(vida.map((v) => [v.adId, v]));
  const anuncios: AnuncioNoAr[] = ativos.map((a) => {
    const v = dosNumeros.get(a.adId);
    return {
      adId: a.adId,
      nome: a.adName,
      spendCents: v?.spendCents ?? 0,
      leads: v?.leads ?? 0,
      desde: v?.desde ?? null,
      atualizadoEm: v?.atualizadoEm ?? null,
      temNumeros: !!v,
    };
  });
  const carros = agruparPorCarro(anuncios);
  const lido = anuncios.reduce<Date | null>((m, a) => (a.atualizadoEm && (!m || a.atualizadoEm > m) ? a.atualizadoEm : m), null);
  return {
    mensagens: montarMensagens({ loja: loja.nome, carros, anunciosNoAr: anuncios.length, atualizadoEm: lido }),
    carros: carros.length,
    anuncios: anuncios.length,
  };
}
