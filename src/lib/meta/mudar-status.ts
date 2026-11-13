import "server-only";

import { prisma } from "@/lib/prisma";
import { escreverNaGraph, escritaLiberada } from "./escrever-na-graph";

// Ligar e desligar campanha, conjunto e anúncio.
//
// ── A trava que mais importa ──────────────────────────────────────────────
//
// O id do objeto vem do NAVEGADOR. Se este arquivo simplesmente repassasse o
// que recebe, bastaria trocar o número no pedido pra pausar a campanha de
// outro anunciante qualquer que estivesse na mesma BM — inclusive de cliente
// de outra agência.
//
// Por isso nada é mandado pra Meta antes de o objeto ser encontrado NO NOSSO
// CADASTRO, dentro de uma conta vinculada àquela loja. Quem não está na nossa
// tabela não existe pra este arquivo, por mais real que seja na Meta.
//
// ── O que a Meta faz com "PAUSED", e por que a tela avisa ────────────────
//
// É a mesma regra do Gerenciador, e ela surpreende quem não sabe:
//
//   campanha pausada  → NADA dentro dela entrega, por mais ativo que esteja
//   conjunto pausado  → só aquele conjunto para
//   anúncio pausado   → só aquele anúncio para
//
// Desligar uma campanha é, na prática, desligar a loja. Quem clica precisa
// saber disso ANTES, não depois — e é por isso que a confirmação na tela diz
// quantos conjuntos e anúncios vão junto.
//
// ── Por que o cadastro local é atualizado na hora ─────────────────────────
//
// Porque a próxima varredura pode levar horas, e uma chave que volta sozinha
// pro estado antigo faz a pessoa clicar de novo. Gravamos o que PEDIMOS e a
// Meta confirmou; o `effectiveStatus` — que depende do pai e do saldo — fica
// pra ela dizer na próxima leitura, porque esse a gente não tem como deduzir.

export type NivelDoObjeto = "campanha" | "conjunto" | "anuncio";

export const ROTULO_DO_NIVEL: Record<NivelDoObjeto, string> = {
  campanha: "campanha",
  conjunto: "conjunto",
  anuncio: "anúncio",
};

export interface ObjetoEncontrado {
  objetoId: string;
  nome: string;
  statusAntes: string | null;
  /** Quantos conjuntos/anúncios param junto se isto for pausado. */
  levaJunto: number;
}

/**
 * Acha o objeto no NOSSO cadastro, dentro das contas desta loja.
 *
 * Devolve `null` quando não existe ali — e aí nada é mandado pra Meta. É esta
 * função que impede que um id trocado no navegador vire uma campanha de
 * outra pessoa pausada.
 */
export async function acharObjetoDaLoja(
  clientId: string,
  nivel: NivelDoObjeto,
  objetoId: string
): Promise<ObjetoEncontrado | null> {
  const contas = await prisma.metaAdAccount.findMany({
    where: { clientId, active: true },
    select: { id: true },
  });
  if (contas.length === 0) return null;
  const ids = contas.map((c) => c.id);

  if (nivel === "campanha") {
    const c = await prisma.metaCampaign.findFirst({
      where: { campaignId: objetoId, adAccountId: { in: ids } },
      select: { campaignId: true, name: true, status: true },
    });
    if (!c) return null;
    // Quantos conjuntos vão parar junto. Conta só os que não estão pausados:
    // avisar "leva 6 conjuntos" quando 5 já estavam parados assusta à toa.
    const levaJunto = await prisma.metaAdset.count({
      where: { campaignId: objetoId, adAccountId: { in: ids }, status: { not: "PAUSED" } },
    });
    return { objetoId: c.campaignId, nome: c.name, statusAntes: c.status, levaJunto };
  }

  if (nivel === "conjunto") {
    const s = await prisma.metaAdset.findFirst({
      where: { adsetId: objetoId, adAccountId: { in: ids } },
      select: { adsetId: true, name: true, status: true },
    });
    if (!s) return null;
    const levaJunto = await prisma.metaAdCreative.count({
      where: { adsetId: objetoId, adAccountId: { in: ids }, status: { not: "PAUSED" } },
    });
    return { objetoId: s.adsetId, nome: s.name, statusAntes: s.status, levaJunto };
  }

  const a = await prisma.metaAdCreative.findFirst({
    where: { adId: objetoId, adAccountId: { in: ids } },
    select: { adId: true, adName: true, status: true },
  });
  if (!a) return null;
  return { objetoId: a.adId, nome: a.adName, statusAntes: a.status, levaJunto: 0 };
}

export type ResultadoDaMudanca =
  | { ok: true; nome: string; ligado: boolean }
  | { ok: false; erro: string };

/**
 * Manda a Meta ligar ou desligar, e registra a tentativa.
 *
 * O registro é gravado DOS DOIS JEITOS — deu certo e deu errado. A chamada
 * que falhou é justamente a que interessa depois, porque é ela que explica a
 * campanha que "não desligou".
 */
export async function mudarStatus(opts: {
  clientId: string;
  quemId: string;
  nivel: NivelDoObjeto;
  objeto: ObjetoEncontrado;
  ligar: boolean;
}): Promise<ResultadoDaMudanca> {
  const { clientId, quemId, nivel, objeto, ligar } = opts;
  const statusPedido = ligar ? "ACTIVE" : "PAUSED";

  if (!escritaLiberada()) {
    return {
      ok: false,
      erro: "O acesso de escrita na Meta ainda não está configurado no sistema.",
    };
  }

  const r = await escreverNaGraph(objeto.objetoId, { status: statusPedido });

  await prisma.metaAcao.create({
    data: {
      clientId,
      quemId,
      nivel,
      objetoId: objeto.objetoId,
      nome: objeto.nome,
      statusPedido,
      statusAntes: objeto.statusAntes,
      ok: r.ok,
      erro: r.ok ? null : r.erro.slice(0, 500),
    },
  });

  if (!r.ok) return { ok: false, erro: r.erro };

  // ── O cadastro local acompanha na hora ──────────────────────────────
  //
  // Porque a próxima varredura pode levar horas, e chave que volta sozinha
  // pro estado antigo faz a pessoa clicar de novo.
  //
  // O `effectiveStatus` é o status DE VERDADE — já considerando o pai e o
  // saldo da conta — e é ele que manda na tela (ver estaLigado). Por isso os
  // dois lados NÃO são iguais:
  //
  //   PAUSAR  é certo. Nada "despausa" um objeto pausado: nem pai ativo, nem
  //           conta cheia. Então o efetivo também vira PAUSED, e a tela
  //           mostra pausado na hora.
  //
  //   LIGAR   não é certo. Campanha ativa dentro de conta zerada não entrega
  //           nada; conjunto ativo em campanha pausada também não. Escrever
  //           ACTIVE no efetivo seria prometer entrega que pode não existir,
  //           então ele é apagado e a tela cai no `status` até a Meta dizer
  //           como ficou de fato.
  //
  // Foi exatamente isto que o teste pegou: pausei a campanha, recarreguei, e
  // a chave voltou ligada porque só o `status` tinha mudado.
  const dados = {
    status: statusPedido,
    effectiveStatus: ligar ? null : "PAUSED",
  };
  const onde = { adAccount: { clientId } };
  if (nivel === "campanha") {
    await prisma.metaCampaign.updateMany({
      where: { campaignId: objeto.objetoId, ...onde },
      data: dados,
    });
    // Pausar a campanha para tudo que está dentro — a Meta faz isso sozinha,
    // e o cadastro tem que contar a mesma história. Só o EFETIVO muda: o
    // conjunto continua ACTIVE nele mesmo, e volta a entregar sozinho se a
    // campanha for religada. Escrever PAUSED no status dele seria inventar
    // uma pausa que ninguém pediu.
    if (!ligar) {
      await prisma.metaAdset.updateMany({
        where: { campaignId: objeto.objetoId, ...onde },
        data: { effectiveStatus: "PAUSED" },
      });
      const conjuntos = await prisma.metaAdset.findMany({
        where: { campaignId: objeto.objetoId, ...onde },
        select: { adsetId: true },
      });
      await prisma.metaAdCreative.updateMany({
        where: { adsetId: { in: conjuntos.map((s) => s.adsetId) }, ...onde },
        data: { effectiveStatus: "PAUSED" },
      });
    }
  } else if (nivel === "conjunto") {
    await prisma.metaAdset.updateMany({
      where: { adsetId: objeto.objetoId, ...onde },
      data: dados,
    });
    if (!ligar) {
      await prisma.metaAdCreative.updateMany({
        where: { adsetId: objeto.objetoId, ...onde },
        data: { effectiveStatus: "PAUSED" },
      });
    }
  } else {
    await prisma.metaAdCreative.updateMany({
      where: { adId: objeto.objetoId, ...onde },
      data: dados,
    });
  }

  return { ok: true, nome: objeto.nome, ligado: ligar };
}
