import "server-only";

// "Ativa o Sandero 2015 azul" no grupo: liga de volta o que O ROBÔ pausou (nos últimos 14 dias). Ele promete "se não era
// esse, me avisa que a gente liga de volta" — e respondia "este sistema só lê dados". Só religa o que ele mesmo tirou pelo
// WhatsApp: ligar anúncio que alguém pausou de propósito no Gerenciador seria o robô ligando anúncio sozinho.

import { prisma } from "@/lib/prisma";
import { acharObjetoDaLoja, mudarStatus } from "@/lib/meta/mudar-status";
import { entenderPedidoComVarios, type AnuncioConhecido } from "./entender-pedido";
import { pedeParaReligar, semVerboDeReligar } from "./religar-puro";

export { pedeParaReligar };

type Pausado = AnuncioConhecido & { nivel: "anuncio" | "conjunto"; conjunto: string | null };

async function pausadosPeloRobo(clientId: string): Promise<Pausado[]> {
  const desde = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const acoes = await prisma.metaAcao.findMany({
    where: { clientId, tipo: "status", origem: "whatsapp", criadoEm: { gte: desde }, ok: true, nivel: { in: ["anuncio", "conjunto"] } },
    orderBy: { criadoEm: "desc" },
    select: { objetoId: true, nivel: true, nome: true, statusPedido: true },
  });
  // A última ação de cada objeto: se foi "ligar", já voltou.
  const ultima = new Map<string, (typeof acoes)[number]>();
  for (const a of acoes) if (!ultima.has(a.objetoId)) ultima.set(a.objetoId, a);
  const pausados = [...ultima.values()].filter((a) => a.statusPedido === "PAUSED");
  const ids = pausados.map((a) => a.objetoId);
  const criativos = ids.length
    ? await prisma.metaAdCreative.findMany({ where: { OR: [{ adId: { in: ids } }, { adsetId: { in: ids } }] }, select: { adId: true, adName: true, adsetId: true, titulo: true, legenda: true } })
    : [];
  const nomeConj = new Map(pausados.filter((a) => a.nivel === "conjunto").map((a) => [a.objetoId, a.nome]));
  return pausados.map((a) => {
    if (a.nivel === "conjunto") {
      const dentro = criativos.filter((c) => c.adsetId === a.objetoId);
      return { adId: a.objetoId, nome: a.nome, textos: dentro.flatMap((c) => [c.adName, c.titulo, c.legenda]).filter((t): t is string => !!t), nivel: "conjunto", conjunto: null };
    }
    const c = criativos.find((x) => x.adId === a.objetoId);
    const conj = c?.adsetId ?? null;
    return {
      adId: a.objetoId,
      nome: [a.nome, conj && nomeConj.get(conj)].filter(Boolean).join(" "),
      textos: [c?.titulo, c?.legenda].filter((t): t is string => !!t),
      nivel: "anuncio",
      conjunto: conj,
    };
  });
}

/** Devolve a resposta pro grupo (ou null se a frase não pede religar). */
export async function religarNoGrupo(opts: { clientId: string; texto: string; quem: string | null }): Promise<string | null> {
  if (!pedeParaReligar(opts.texto)) return null;
  const pausados = await pausadosPeloRobo(opts.clientId);
  if (pausados.length === 0) {
    return "Não pausei nada dessa loja nos últimos dias, então não tenho o que ligar de volta. Pra ligar outro anúncio, peça pra equipe Legacy.";
  }
  // A mesma busca do pausar (mesmo sentido pra "Sandero 2015 azul"), só que na lista do que o robô pausou.
  const pedido = entenderPedidoComVarios(`desativa ${semVerboDeReligar(opts.texto)}`, pausados);
  const escolhidos = new Map<string, Pausado>();
  for (const alvo of pedido.alvos) {
    const lista = alvo.semDuvida ? alvo.mesmoCarro : (alvo.empatados ?? []);
    for (const a of lista) escolhidos.set(a.adId, a as Pausado);
  }
  if (escolhidos.size === 0) {
    const nomes = pausados.slice(0, 8).map((p) => `• ${p.nome}`).join("\n");
    return `Não achei esse carro no que eu pausei. O que eu pausei nos últimos dias:\n${nomes}\n\nMe diz qual ligar de volta.`;
  }
  // Ligou um anúncio cujo conjunto o robô também pausou: o conjunto volta junto, senão o anúncio "ligado" não roda.
  for (const a of [...escolhidos.values()]) {
    if (a.nivel === "anuncio" && a.conjunto) {
      const conj = pausados.find((p) => p.nivel === "conjunto" && p.adId === a.conjunto);
      if (conj) escolhidos.set(conj.adId, conj);
    }
  }
  const ligados: string[] = [];
  const falhas: string[] = [];
  for (const a of escolhidos.values()) {
    const objeto = await acharObjetoDaLoja(opts.clientId, a.nivel, a.adId);
    if (!objeto) {
      falhas.push(a.nome);
      continue;
    }
    const r = await mudarStatus({ clientId: opts.clientId, quemId: null, nivel: a.nivel, objeto, ligar: true, origem: "whatsapp", pedidoPor: opts.quem, pedidoTexto: opts.texto });
    if (r.ok) ligados.push(a.nivel === "conjunto" ? `${r.nome} (conjunto)` : r.nome);
    else falhas.push(a.nome);
  }
  const partes: string[] = [];
  if (ligados.length) partes.push(`Pronto, liguei de volta:\n${ligados.map((n) => `• ${n}`).join("\n")}`);
  if (falhas.length) partes.push(`Não consegui ligar:\n${falhas.map((n) => `• ${n}`).join("\n")}\nA equipe Legacy vai ver.`);
  return partes.join("\n\n");
}
