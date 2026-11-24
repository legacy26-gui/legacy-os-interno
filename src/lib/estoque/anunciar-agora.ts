import "server-only";

import { prisma } from "@/lib/prisma";
import { clienteEDaCarteira, type PessoaDaCasa } from "@/lib/carteira";
import { escritaLiberada } from "@/lib/meta/escrever-na-graph";
import { lerBaseDoAnuncio, subirFotoDoRascunho, subirRascunho, type AvisoDoConjunto } from "@/lib/meta/rascunho-anuncio";
import { gerarLegendaDoCarro } from "@/lib/meta/legenda-do-rascunho";
import { baixarFotosDoCarro } from "./fotos";

// "Anunciar agora": do carro do estoque até o RASCUNHO PAUSADO na Meta, num passo só.
//
// ── O que faz, na ordem ─────────────────────────────────────────────────
//   1. confere que o carro está no site e que a loja é da carteira de quem pede;
//   2. usa o "mesmo de sempre" da loja (conjunto + anúncio-base, ver PadraoDeRascunho) — sem isso não há de onde copiar
//      configuração, e o robô manda subir o primeiro anúncio pela tela ou pelo WhatsApp;
//   3. baixa as fotos da página do carro (até 5, ver fotos.ts) e sobe pra conta da loja;
//   4. a IA escreve a legenda na voz da loja, com os dados do carro (a mesma regra e a mesma conferência da tela);
//   5. cria o anúncio PAUSADO (duplicando o base) pelo MESMO caminho seguro da tela e do WhatsApp (subirRascunho).
//
// ── As travas ───────────────────────────────────────────────────────────
//   • NUNCA liga nada: tudo nasce pausado, e a pessoa confere e publica no Gerenciador.
//   • Um rascunho por carro: o carro guarda `rascunhoAdId`, e um segundo clique/"sim" devolve o que já existe.
//   • Tudo que dá errado no meio vira frase (nada de erro técnico pra tela), e libera o carro pra tentar de novo.

const reais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

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

export async function anunciarCarroDoEstoque(p: { carroId: string; pessoa: PessoaDaCasa & { name: string }; origem: "tela" | "whatsapp" }): Promise<ResultadoDoAnunciarAgora> {
  const carro = await prisma.estoqueCarro.findUnique({
    where: { id: p.carroId },
    select: { id: true, clientId: true, titulo: true, anoModelo: true, km: true, cor: true, precoCents: true, url: true, sumiuEm: true, rascunhoAdId: true, client: { select: { companyName: true } } },
  });
  if (!carro) return { ok: false, erro: "Não achei esse carro no estoque." };
  if (!(await clienteEDaCarteira(p.pessoa, carro.clientId))) return { ok: false, erro: "Esta loja não está na sua carteira." };
  const loja = carro.client.companyName;
  if (carro.sumiuEm) return { ok: false, erro: `O ${carro.titulo} já saiu do site da ${loja}. Não subi nada.` };
  if (carro.rascunhoAdId && carro.rascunhoAdId !== "pendente") {
    return { ok: true, jaTinha: true, carro: carro.titulo, loja, adId: carro.rascunhoAdId };
  }
  if (!escritaLiberada()) return { ok: false, erro: "O acesso de escrita na Meta ainda não está configurado no sistema." };

  const padrao = await prisma.padraoDeRascunho.findUnique({ where: { clientId: carro.clientId } });
  if (!padrao) {
    return {
      ok: false,
      erro: `A ${loja} ainda não tem o "mesmo de sempre" (conjunto e anúncio-base). Sobe o primeiro anúncio dela pela tela (Meta Ads → Subir anúncio) ou mandando as fotos pro robô; depois os próximos saem num clique.`,
    };
  }

  // Pega o carro pra si: o clique duplo (ou o "sim" repetido) não sobe dois rascunhos.
  const tomou = await prisma.estoqueCarro.updateMany({ where: { id: carro.id, rascunhoAdId: null }, data: { rascunhoAdId: "pendente" } });
  if (tomou.count !== 1) return { ok: false, erro: "Esse carro já está sendo subido agora. Espera um minuto e confere no Gerenciador." };
  const soltar = () => prisma.estoqueCarro.updateMany({ where: { id: carro.id, rascunhoAdId: "pendente" }, data: { rascunhoAdId: null } });

  try {
    const base = await lerBaseDoAnuncio(carro.clientId, padrao.baseAdId);
    if (!base.ok) {
      await soltar();
      return { ok: false, erro: `O anúncio-base da ${loja} não serve mais: ${base.erro}` };
    }

    const baixadas = await baixarFotosDoCarro(carro.url);
    if (!baixadas.ok) {
      await soltar();
      return { ok: false, erro: `Não consegui pegar as fotos do ${carro.titulo} no site: ${baixadas.erro}. Sobe pela tela mandando as fotos.` };
    }

    const hashes: string[] = [];
    for (let i = 0; i < baixadas.fotos.length; i++) {
      const f = await subirFotoDoRascunho({ clientId: carro.clientId, adsetId: padrao.adsetId, nome: `${carro.id.slice(-6)}-${i + 1}.jpg`, bytes: baixadas.fotos[i].bytes });
      if (!f.ok) {
        await soltar();
        return { ok: false, erro: `Não consegui enviar a foto ${i + 1} pra Meta: ${f.erro}` };
      }
      hashes.push(f.hash);
    }

    const leg = await gerarLegendaDoCarro({ clientId: carro.clientId, dadosDoCarro: dadosDoCarroEmTexto(carro), legendaDoBase: base.base.legenda });
    if (!leg.ok) {
      await soltar();
      return { ok: false, erro: leg.erro };
    }

    const nome = carro.titulo.slice(0, 120);
    const r = await subirRascunho({
      clientId: carro.clientId,
      baseAdId: padrao.baseAdId,
      adsetId: padrao.adsetId,
      conjuntoNovo: padrao.duplicarConjunto ? { nome, orcamentoCents: padrao.orcamentoCents } : null,
      nome,
      legenda: leg.dados.legenda,
      titulo: base.base.titulo ? base.base.titulo : null,
      link: base.base.link,
      hashes,
      pedidoPor: `${p.pessoa.name} (${p.origem === "whatsapp" ? "WhatsApp" : "anunciar agora"})`,
      quemId: p.pessoa.id,
    });
    if (!r.ok || !r.adId) {
      await soltar();
      return {
        ok: false,
        erro:
          `A Meta não aceitou o rascunho: ${r.erro ?? "sem detalhe"}` +
          (r.adsetCriado ? `\nO conjunto "${r.adsetCriado.nome}" chegou a ser criado (pausado): apaga ele no Gerenciador antes de tentar de novo.` : ""),
      };
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
      legenda: leg.dados.legenda,
      avisos: [...leg.dados.avisos, ...r.avisos.map((a: AvisoDoConjunto) => a.texto)],
      conjuntoNovo: r.adsetCriado?.nome ?? null,
    };
  } catch (e) {
    await soltar();
    console.error("[anunciar-agora] falhou", e);
    return { ok: false, erro: `Deu erro aqui e eu não terminei: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}` };
  }
}
