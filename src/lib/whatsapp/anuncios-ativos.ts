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
// Um carro por linha, em ordem alfabética, no estilo que a casa usa na mão: "Carros patrocinados." e a lista numerada só com
// nome e ano ("1. Etios X 2017"). O mesmo carro costuma ter mais de um anúncio ("C3 foto" e "C3 foto vídeo — Cópia"): viram
// uma linha só. Sem lead, sem gasto, sem rodapé — a lista é pra bater o olho nos carros que estão rodando.
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
  // Quem pergunta de GASTO, de pausado, de vendido… não quer esta lista (a lista é só dos que estão no ar, sem valor).
  if (/\b(gast\w*|custo\w*|invest\w*|valor\w*|quanto|verba|saldo|pausad\w*|desligad\w*|parad\w*|inativ\w*|vendid\w*|encerrad\w*|arquivad\w*|recusad\w*|reprovad\w*|estoque|preco\w*|fipe|leads?|resultado\w*|relatorio\w*)\b/.test(t)) return false;
  // O jeito mais largo, que pega a maioria das frases ("manda os carros que estão ativos", "carros ativos aí", "quais carros
  // estamos patrocinando", "tem quais anúncios no ar"): fala de carro/anúncio E de estar no ar. Só chega aqui quem não pediu
  // gasto, nem pausar/ligar/mudar nada (travas acima). Melhor responder a lista que mandar a pergunta pra IA, que não tem o inventário.
  if (
    /\b(carros?|anuncios?|veiculos?|campanhas?|automoveis?|seminovos?)\b/.test(t) &&
    /\b(ativ\w*|no ar|rodand\w*|veiculand\w*|anunciand\w*|patrocin\w*|na rua|em veiculacao|impulsionad\w*|impulsionand\w*)\b/.test(t)
  ) {
    return true;
  }
  const itens = "(anuncios?|carros?|veiculos?|campanhas?)";
  const noAr = "(ativos?|ativas?|rodando|no ar|ligados?|ligadas?|veiculando|anunciando|na rua|em veiculacao)";
  return (
    new RegExp(`^${itens} ${noAr}$`).test(t) ||
    new RegExp(`\\b(quais|qual|lista|listar|lista dos|lista de|mostra|mostrar|me mostra|manda|me manda|mande|ver|quero ver)\\b.*\\b${itens}\\b.*\\b${noAr}\\b`).test(t) ||
    (new RegExp(`\\b${itens} ${noAr}\\b`).test(t) && /\b(quais|qual|lista|mostra|manda|mande|ver|quero)\b/.test(t)) ||
    new RegExp(`\\bo que (esta|ta|tem|estao|tao) ${noAr}\\b`).test(t) ||
    new RegExp(`\\bquais? ${itens} (estao|tao|tem) ${noAr}\\b`).test(t) ||
    // "listar os anúncios", "lista dos carros", "me manda os anúncios": pedir a lista já é pedir os que estão no ar.
    new RegExp(`^(por favor |pf |pfv |me |pode |consegue )*(listar|lista|listagem|mostra|mostrar|manda|mandar|mande|ver|quero ver)( de| dos| das| os| as| o| a| todos| todas)* ?${itens}( da loja| da| do)?( [a-z0-9 ]{2,40})?$`).test(t)
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

/**
 * A lista no estilo que a casa usa na mão: o título e os carros numerados, só o nome e o ano. Sem lead, sem contagem de anúncio,
 * sem rodapé. Quebra em mais de uma mensagem só se passar do limite do WhatsApp, sem cortar um carro no meio. Pura.
 */
export function montarMensagens(opcoes: {
  loja: string;
  carros: CarroNoAr[];
  anunciosNoAr: number;
  atualizadoEm: Date | null;
  limite?: number;
}): string[] {
  const { loja, carros } = opcoes;
  const limite = opcoes.limite ?? 3000;
  if (carros.length === 0) return [`Não tem nenhum anúncio ativo agora na *${loja}*.`];

  const titulo = "Carros patrocinados.";
  const mensagens: string[] = [];
  let atual = titulo;
  carros.forEach((c, i) => {
    const linha = `${i + 1}. ${c.nome}`;
    if ((atual + "\n" + linha).length > limite) {
      mensagens.push(atual);
      atual = `${titulo} (continuação)`;
    }
    atual += `\n${linha}`;
  });
  mensagens.push(atual);
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
