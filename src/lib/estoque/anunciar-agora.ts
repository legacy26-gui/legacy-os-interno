import "server-only";

import { prisma } from "@/lib/prisma";
import { clienteEDaCarteira, type PessoaDaCasa } from "@/lib/carteira";
import { escritaLiberada } from "@/lib/meta/escrever-na-graph";
import {
  lerBaseDoAnuncio,
  ORCAMENTO_MAXIMO_CENTS,
  ORCAMENTO_MINIMO_CENTS,
  subirFotoDoRascunho,
  subirRascunho,
  type AvisoDoConjunto,
} from "@/lib/meta/rascunho-anuncio";
import { conferirLegenda, gerarLegendaDoCarro } from "@/lib/meta/legenda-do-rascunho";
import { baixarFotosDoCarro, enderecosDasFotos } from "./fotos";
import type { EscolhaDoAnuncio, PlanoDoAnuncio } from "./anunciar-tipos";

// "Anunciar agora": do carro do estoque até o RASCUNHO PAUSADO na Meta.
//
// ── Pela tela (ficha da loja → Estoque → Anunciar agora) ─────────────────
//   1. `prepararAnuncio` lê o que a pessoa precisa decidir: as fotos do carro no site (até 6), as campanhas, os conjuntos e
//      os anúncios da loja, o "mesmo de sempre" (já vem escolhido) e uma legenda da IA (editável).
//   2. A pessoa escolhe: campanha (existente ou NOVA), conjunto (existente ou NOVO), as fotos que ficam e a legenda.
//   3. `anunciarCarroDoEstoque` (com a escolha) cria tudo PAUSADO pelo mesmo caminho seguro da tela de Subir anúncio.
//
// ── Pelo WhatsApp ("anunciar o Compass") ────────────────────────────────
//   Sem escolha: usa o "mesmo de sempre" da loja, até 6 fotos do site e a legenda da IA.
//
// ── As travas ───────────────────────────────────────────────────────────
//   • NUNCA liga nada: campanha, conjunto e anúncio nascem PAUSADOS. A pessoa confere e publica no Gerenciador.
//   • A loja é da carteira de quem pede; campanha/conjunto/anúncio escolhidos têm que ser desta loja (conferido no servidor,
//     o id vem do navegador).
//   • As fotos só valem se estiverem mesmo na página do carro (ver fotos.ts) — endereço de foto vindo do navegador não basta.
//   • Um rascunho por carro (`rascunhoAdId`; "pendente" enquanto sobe): clique duplo não duplica.
//   • Tudo que dá errado no meio vira frase, e libera o carro pra tentar de novo.

const reais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
const FORA = ["ARCHIVED", "DELETED"];

export interface ResultadoDoAnunciarAgora {
  ok: boolean;
  erro?: string;
  /** O carro já tinha rascunho (um clique repetido não cria outro). */
  jaTinha?: boolean;
  carro?: string;
  loja?: string;
  adId?: string;
  linkDoGerenciador?: string;
  formato?: "foto" | "carrossel";
  fotos?: number;
  puladas?: number;
  legenda?: string;
  avisos?: string[];
  conjuntoNovo?: string | null;
  campanhaNova?: string | null;
}

/** A ficha do carro em texto, pra legenda da IA (a mesma da tela de subir anúncio). */
export function dadosDoCarroEmTexto(c: { titulo: string; anoModelo: number | null; km: number | null; cor: string | null; precoCents: number | null }): string {
  return [c.titulo, c.anoModelo ? `ano ${c.anoModelo}` : null, c.km !== null ? `${c.km.toLocaleString("pt-BR")} km` : null, c.cor ? `cor ${c.cor}` : null, c.precoCents ? `preço ${reais(c.precoCents)}` : null]
    .filter(Boolean)
    .join(", ");
}

/** A loja já tem o "mesmo de sempre" pra subir sem perguntar nada? */
export async function lojaPodeAnunciarAgora(clientId: string): Promise<boolean> {
  return !!(await prisma.padraoDeRascunho.findUnique({ where: { clientId }, select: { id: true } }));
}

const CARRO = { id: true, clientId: true, titulo: true, anoModelo: true, km: true, cor: true, precoCents: true, url: true, sumiuEm: true, rascunhoAdId: true, client: { select: { companyName: true } } } as const;

// ───────────────────────────── 1. Preparar (a tela) ─────────────────────────────

export async function prepararAnuncio(p: { carroId: string; pessoa: PessoaDaCasa }): Promise<PlanoDoAnuncio> {
  const carro = await prisma.estoqueCarro.findUnique({ where: { id: p.carroId }, select: CARRO });
  if (!carro) return { ok: false, erro: "Não achei esse carro no estoque." };
  if (!(await clienteEDaCarteira(p.pessoa, carro.clientId))) return { ok: false, erro: "Esta loja não está na sua carteira." };
  const loja = carro.client.companyName;
  if (carro.sumiuEm) return { ok: false, erro: `O ${carro.titulo} já saiu do site da ${loja}.` };
  if (carro.rascunhoAdId && carro.rascunhoAdId !== "pendente") return { ok: false, erro: `Esse carro já tem um rascunho criado (anúncio ${carro.rascunhoAdId}). Procura no Gerenciador.` };

  const contas = (await prisma.metaAdAccount.findMany({ where: { clientId: carro.clientId, active: true }, select: { id: true } })).map((c) => c.id);
  if (contas.length === 0) return { ok: false, erro: `A ${loja} não tem conta de anúncio ligada.` };

  const [campanhas, conjuntos, anuncios, padrao, fotos] = await Promise.all([
    prisma.metaCampaign.findMany({ where: { adAccountId: { in: contas }, NOT: { status: { in: FORA } } }, orderBy: { name: "asc" }, select: { campaignId: true, name: true, status: true } }),
    prisma.metaAdset.findMany({ where: { adAccountId: { in: contas }, NOT: { status: { in: FORA } } }, orderBy: { name: "asc" }, select: { adsetId: true, name: true, campaignId: true, status: true, dailyBudgetCents: true } }),
    prisma.metaAdCreative.findMany({ where: { adAccountId: { in: contas }, adsetId: { not: null }, NOT: { status: { in: FORA } } }, orderBy: { adName: "asc" }, select: { adId: true, adName: true, adsetId: true, status: true } }),
    prisma.padraoDeRascunho.findUnique({ where: { clientId: carro.clientId } }),
    enderecosDasFotos(carro.url),
  ]);
  if (!fotos.ok) return { ok: false, erro: `Não consegui pegar as fotos do ${carro.titulo} no site: ${fotos.erro}.` };

  const plano: PlanoDoAnuncio = {
    ok: true,
    loja,
    carro: { id: carro.id, titulo: carro.titulo, ano: carro.anoModelo, km: carro.km, cor: carro.cor, precoCents: carro.precoCents },
    fotos: fotos.urls.slice(0, 6),
    campanhas: campanhas.map((c) => ({ id: c.campaignId, nome: c.name, status: c.status })),
    conjuntos: conjuntos.map((c) => ({ id: c.adsetId, nome: c.name, campaignId: c.campaignId, status: c.status, orcamentoCents: c.dailyBudgetCents })),
    anuncios: anuncios.map((a) => ({ id: a.adId, nome: a.adName, adsetId: a.adsetId, status: a.status })),
    padrao: padrao
      ? { adsetId: padrao.adsetId, baseAdId: padrao.baseAdId, duplicarConjunto: padrao.duplicarConjunto, orcamentoCents: padrao.orcamentoCents, campaignId: conjuntos.find((c) => c.adsetId === padrao.adsetId)?.campaignId ?? null }
      : null,
    legenda: "",
    avisosDaLegenda: [],
    erroDaLegenda: null,
    podeEscrever: escritaLiberada(),
  };

  // A legenda da IA: usa a legenda do anúncio-base (a voz da loja) como primeiro exemplo.
  const baseId = padrao?.baseAdId ?? anuncios[0]?.adId ?? null;
  const base = baseId ? await lerBaseDoAnuncio(carro.clientId, baseId) : null;
  const leg = await gerarLegendaDoCarro({ clientId: carro.clientId, dadosDoCarro: dadosDoCarroEmTexto(carro), legendaDoBase: base && base.ok ? base.base.legenda : "" });
  if (leg.ok) {
    plano.legenda = leg.dados.legenda;
    plano.avisosDaLegenda = leg.dados.avisos;
  } else {
    plano.erroDaLegenda = leg.erro;
  }
  return plano;
}

// ───────────────────────────── 2. Anunciar ─────────────────────────────

export async function anunciarCarroDoEstoque(p: {
  carroId: string;
  pessoa: PessoaDaCasa & { name: string };
  origem: "tela" | "whatsapp";
  /** Sem escolha (WhatsApp): usa o "mesmo de sempre" da loja. */
  escolha?: EscolhaDoAnuncio | null;
}): Promise<ResultadoDoAnunciarAgora> {
  const carro = await prisma.estoqueCarro.findUnique({ where: { id: p.carroId }, select: CARRO });
  if (!carro) return { ok: false, erro: "Não achei esse carro no estoque." };
  if (!(await clienteEDaCarteira(p.pessoa, carro.clientId))) return { ok: false, erro: "Esta loja não está na sua carteira." };
  const loja = carro.client.companyName;
  if (carro.sumiuEm) return { ok: false, erro: `O ${carro.titulo} já saiu do site da ${loja}. Não subi nada.` };
  if (carro.rascunhoAdId && carro.rascunhoAdId !== "pendente") return { ok: true, jaTinha: true, carro: carro.titulo, loja, adId: carro.rascunhoAdId };
  if (!escritaLiberada()) return { ok: false, erro: "O acesso de escrita na Meta ainda não está configurado no sistema." };

  // ── O que vai ser criado: a escolha da tela, ou o "mesmo de sempre" ──
  let escolha = p.escolha ?? null;
  if (!escolha) {
    const padrao = await prisma.padraoDeRascunho.findUnique({ where: { clientId: carro.clientId } });
    if (!padrao) {
      return {
        ok: false,
        erro: `A ${loja} ainda não tem o "mesmo de sempre" (conjunto e anúncio-base). Escolhe campanha e conjunto pela ficha da loja (Estoque → Anunciar agora), ou sobe o primeiro anúncio dela mandando as fotos pro robô.`,
      };
    }
    const doPadrao = await prisma.metaAdset.findFirst({ where: { adsetId: padrao.adsetId, adAccount: { clientId: carro.clientId } }, select: { campaignId: true } });
    escolha = {
      campanha: { tipo: "existente", id: doPadrao?.campaignId ?? "" },
      conjunto: padrao.duplicarConjunto ? { tipo: "novo", nome: carro.titulo.slice(0, 120), orcamentoReais: padrao.orcamentoCents ? padrao.orcamentoCents / 100 : null } : { tipo: "existente", id: padrao.adsetId },
      moldeAdsetId: padrao.adsetId,
      baseAdId: padrao.baseAdId,
      fotos: [],
      legenda: "",
    };
  }

  // ── Conferir a escolha (o que veio do navegador nunca é confiado) ──
  const e = escolha;
  const invalido = (erro: string): ResultadoDoAnunciarAgora => ({ ok: false, erro });
  if (!e.baseAdId) return invalido("Escolhe o anúncio-base (de onde o novo herda a página e o botão).");

  let campanhaNovaNome: string | null = null;
  let campanhaDestinoId: string | null = null;
  if (e.campanha.tipo === "nova") {
    campanhaNovaNome = e.campanha.nome.trim().slice(0, 200);
    if (campanhaNovaNome.length < 2) return invalido("Dá um nome pra campanha nova.");
    if (e.conjunto.tipo !== "novo") return invalido("Campanha nova pede conjunto novo.");
  } else {
    const c = await prisma.metaCampaign.findFirst({ where: { campaignId: e.campanha.id, adAccount: { clientId: carro.clientId } }, select: { campaignId: true } });
    if (!c) return invalido("Essa campanha não é de uma conta desta loja.");
    campanhaDestinoId = c.campaignId;
  }

  let adsetId: string;
  let conjuntoNovo: { nome: string; orcamentoCents: number | null } | null = null;
  if (e.conjunto.tipo === "existente") {
    const a = await prisma.metaAdset.findFirst({ where: { adsetId: e.conjunto.id, adAccount: { clientId: carro.clientId } }, select: { campaignId: true } });
    if (!a) return invalido("Esse conjunto não é de uma conta desta loja.");
    if (campanhaDestinoId && a.campaignId && a.campaignId !== campanhaDestinoId) return invalido("Esse conjunto não está na campanha escolhida.");
    adsetId = e.conjunto.id;
    campanhaDestinoId = null;
  } else {
    if (!e.moldeAdsetId) return invalido("Escolhe de qual conjunto eu copio as configurações (público, localização, otimização).");
    const molde = await prisma.metaAdset.findFirst({ where: { adsetId: e.moldeAdsetId, adAccount: { clientId: carro.clientId } }, select: { campaignId: true } });
    if (!molde) return invalido("O conjunto de onde copiar não é de uma conta desta loja.");
    const nome = e.conjunto.nome.trim().slice(0, 200);
    if (nome.length < 2) return invalido("Dá um nome pro conjunto novo.");
    const orc = e.conjunto.orcamentoReais === null ? null : Math.round(e.conjunto.orcamentoReais * 100);
    if (orc !== null && (!Number.isFinite(orc) || orc < ORCAMENTO_MINIMO_CENTS || orc > ORCAMENTO_MAXIMO_CENTS)) return invalido("O orçamento diário precisa ficar entre R$ 1 e R$ 1.000.");
    adsetId = e.moldeAdsetId;
    conjuntoNovo = { nome, orcamentoCents: orc };
    // Campanha existente diferente da do molde: o conjunto novo vai pra ela.
    if (campanhaDestinoId && molde.campaignId === campanhaDestinoId) campanhaDestinoId = null;
  }

  // Pega o carro pra si: o clique duplo (ou o "sim" repetido) não sobe dois rascunhos.
  const tomou = await prisma.estoqueCarro.updateMany({ where: { id: carro.id, rascunhoAdId: null }, data: { rascunhoAdId: "pendente" } });
  if (tomou.count !== 1) return invalido("Esse carro já está sendo subido agora. Espera um minuto e confere no Gerenciador.");
  const soltar = () => prisma.estoqueCarro.updateMany({ where: { id: carro.id, rascunhoAdId: "pendente" }, data: { rascunhoAdId: null } });

  try {
    const base = await lerBaseDoAnuncio(carro.clientId, e.baseAdId);
    if (!base.ok) {
      await soltar();
      return invalido(`O anúncio-base não serve: ${base.erro}`);
    }

    const baixadas = await baixarFotosDoCarro(carro.url, e.fotos.length > 0 ? e.fotos.slice(0, 6) : undefined);
    if (!baixadas.ok) {
      await soltar();
      return invalido(`Não consegui pegar as fotos do ${carro.titulo} no site: ${baixadas.erro}. Sobe pela tela mandando as fotos.`);
    }

    const hashes: string[] = [];
    for (let i = 0; i < baixadas.fotos.length; i++) {
      const f = await subirFotoDoRascunho({ clientId: carro.clientId, adsetId, nome: `${carro.id.slice(-6)}-${i + 1}.jpg`, bytes: baixadas.fotos[i].bytes });
      if (!f.ok) {
        await soltar();
        return invalido(`Não consegui enviar a foto ${i + 1} pra Meta: ${f.erro}`);
      }
      hashes.push(f.hash);
    }

    // A legenda: a que a pessoa editou na tela; sem ela (WhatsApp), a IA escreve agora.
    let legenda = e.legenda.trim().slice(0, 2200);
    const avisosDaLegenda: string[] = [];
    if (legenda.length < 10) {
      const leg = await gerarLegendaDoCarro({ clientId: carro.clientId, dadosDoCarro: dadosDoCarroEmTexto(carro), legendaDoBase: base.base.legenda });
      if (!leg.ok) {
        await soltar();
        return invalido(leg.erro);
      }
      legenda = leg.dados.legenda;
      avisosDaLegenda.push(...leg.dados.avisos);
    } else {
      avisosDaLegenda.push(...conferirLegenda(legenda, dadosDoCarroEmTexto(carro)));
    }

    const nome = carro.titulo.slice(0, 120);
    const r = await subirRascunho({
      clientId: carro.clientId,
      baseAdId: e.baseAdId,
      adsetId,
      conjuntoNovo,
      campanhaNova: campanhaNovaNome ? { nome: campanhaNovaNome } : null,
      campanhaDestinoId,
      nome,
      legenda,
      titulo: base.base.titulo ? base.base.titulo : null,
      link: base.base.link,
      hashes,
      pedidoPor: `${p.pessoa.name} (${p.origem === "whatsapp" ? "WhatsApp" : "anunciar agora"})`,
      quemId: p.pessoa.id,
    });
    if (!r.ok || !r.adId) {
      await soltar();
      return invalido(
        `A Meta não aceitou o rascunho: ${r.erro ?? "sem detalhe"}` +
          (r.campanhaCriada ? `\nA campanha "${r.campanhaCriada.nome}" chegou a ser criada (pausada): apaga ela no Gerenciador antes de tentar de novo.` : "") +
          (r.adsetCriado ? `\nO conjunto "${r.adsetCriado.nome}" chegou a ser criado (pausado): apaga ele no Gerenciador antes de tentar de novo.` : ""),
      );
    }

    await prisma.estoqueCarro.update({ where: { id: carro.id }, data: { rascunhoAdId: r.adId, rascunhoEm: new Date() } });
    return {
      ok: true,
      carro: carro.titulo,
      loja,
      adId: r.adId,
      linkDoGerenciador: r.linkDoGerenciador,
      formato: r.formato,
      fotos: hashes.length,
      puladas: baixadas.puladas,
      legenda,
      avisos: [...avisosDaLegenda, ...r.avisos.map((a: AvisoDoConjunto) => a.texto)],
      conjuntoNovo: r.adsetCriado?.nome ?? null,
      campanhaNova: r.campanhaCriada?.nome ?? null,
    };
  } catch (erro) {
    await soltar();
    console.error("[anunciar-agora] falhou", erro);
    return invalido(`Deu erro aqui e eu não terminei: ${(erro instanceof Error ? erro.message : String(erro)).slice(0, 200)}`);
  }
}
