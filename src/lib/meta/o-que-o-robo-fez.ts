import "server-only";

import { prisma } from "@/lib/prisma";
import { hojeUTC } from "./insights";
import { donosDosAnuncios, nomeEhGenerico, nomeIdentificavel } from "@/lib/whatsapp/nome-do-anuncio";

// O que o robô do WhatsApp andou fazendo — pra aparecer no Meu Dia.
//
// ── Por que isto existe ──────────────────────────────────────────────────
//
// Porque o robô fala no grupo da loja, não com a gente. Ele responde "tirei
// o Compass do ar" pra quem pediu, e o gestor só descobre entrando no grupo
// — ou não descobre. Ação automática que ninguém revê deixa de ser
// automação e vira aposta.
//
// ── Por que o que FALHOU não some à meia-noite ───────────────────────────
//
// Esta é a parte que importa mais que a lista de sucessos.
//
// Quando o robô tenta desligar e a Meta recusa, três coisas acontecem ao
// mesmo tempo: a loja acha que o anúncio saiu do ar (o robô avisou que não
// conseguiu, mas isso rola pra cima no grupo em dez minutos), o anúncio
// continua rodando, e a verba continua saindo num carro que já foi vendido.
//
// Um sucesso é notícia de ontem: some no dia seguinte e tudo bem. Uma falha
// é dinheiro saindo agora, e fica na tela até alguém resolver.

/** Quantos dias uma falha continua aparecendo. */
const DIAS_DE_FALHA = 7;

export interface AcaoDoRobo {
  id: string;
  clientId: string;
  loja: string;
  /** O nome do anúncio como estava na hora. */
  anuncio: string;
  /** Quem escreveu no grupo: "Marcos · 5554999887766". */
  pedidoPor: string | null;
  /** A frase, pra conferir se o robô entendeu o que o cliente quis dizer. */
  frase: string | null;
  quando: Date;
  ok: boolean;
  erro: string | null;
  /** Pra religar pela tela. */
  nivel: string;
  objetoId: string;
  /** Alguém já religou depois (pela tela ou no Gerenciador, quando a leitura viu). */
  religado: boolean;
}

export interface OQueORoboFez {
  /** Desligados nos últimos 2 dias (hoje e ontem), com o botão de religar. */
  feitos: AcaoDoRobo[];
  /** Tentou e não conseguiu, nos últimos dias. Fica até alguém resolver. */
  falhas: AcaoDoRobo[];
}

export async function oQueORoboFez(
  clientIds: string[],
  agora = new Date(),
): Promise<OQueORoboFez> {
  if (clientIds.length === 0) return { feitos: [], falhas: [] };

  const inicioDeHoje = hojeUTC(agora);
  const limiteDasFalhas = new Date(
    inicioDeHoje.getTime() - DIAS_DE_FALHA * 24 * 60 * 60 * 1000,
  );

  const linhas = await prisma.metaAcao.findMany({
    where: {
      clientId: { in: clientIds },
      origem: "whatsapp",
      criadoEm: { gte: limiteDasFalhas },
    },
    orderBy: { criadoEm: "desc" },
    select: {
      id: true,
      clientId: true,
      nivel: true,
      objetoId: true,
      nome: true,
      pedidoPor: true,
      pedidoTexto: true,
      criadoEm: true,
      ok: true,
      erro: true,
      client: { select: { companyName: true } },
    },
  });

  // Religado depois? Uma ação de LIGAR com sucesso no mesmo objeto, mais nova que a pausa.
  const ligados = await prisma.metaAcao.findMany({
    where: { objetoId: { in: [...new Set(linhas.map((l) => l.objetoId))] }, statusPedido: "ACTIVE", ok: true, criadoEm: { gte: limiteDasFalhas } },
    select: { objetoId: true, criadoEm: true },
  });
  const religadoDepois = (l: (typeof linhas)[number]) => ligados.some((x) => x.objetoId === l.objetoId && x.criadoEm > l.criadoEm);

  // Anúncio de nome só de formato ("Stories", "Video"): mostra com o conjunto na frente, pra saber de QUAL carro era — inclusive
  // nas pausas gravadas antes de o robô passar a guardar o nome completo.
  const genericos = linhas.filter((l) => l.nivel === "anuncio" && nomeEhGenerico(l.nome));
  const criativos = genericos.length
    ? await prisma.metaAdCreative.findMany({ where: { adId: { in: [...new Set(genericos.map((l) => l.objetoId))] } }, select: { adId: true, adsetId: true, campaignId: true } })
    : [];
  const donoDe = await donosDosAnuncios(criativos);
  const porAd = new Map(criativos.map((c) => [c.adId, c]));
  const nomeMostrado = (l: (typeof linhas)[number]) => {
    const c = l.nivel === "anuncio" && nomeEhGenerico(l.nome) ? porAd.get(l.objetoId) : undefined;
    return c ? nomeIdentificavel(l.nome, donoDe(c).conjunto, donoDe(c).campanha).nome : l.nome;
  };

  const comoAcao = (l: (typeof linhas)[number]): AcaoDoRobo => ({
    nivel: l.nivel,
    objetoId: l.objetoId,
    religado: religadoDepois(l),
    id: l.id,
    clientId: l.clientId,
    loja: l.client.companyName,
    anuncio: nomeMostrado(l),
    pedidoPor: l.pedidoPor,
    frase: l.pedidoTexto,
    quando: l.criadoEm,
    ok: l.ok,
    erro: l.erro,
  });

  return {
    // Hoje em Brasília, e não "últimas 24 horas": quem abre o Meu Dia às
    // nove da manhã pergunta "o que aconteceu hoje", não "o que aconteceu
    // desde ontem às nove".
    feitos: linhas
      // Hoje E ontem: um erro do robô de ontem (ex.: pausou o carro errado) tem que continuar à vista pra ser desfeito.
      .filter((l) => l.ok && l.criadoEm >= meiaNoiteDeOntemEmBrasilia(agora))
      .map(comoAcao),
    falhas: linhas.filter((l) => !l.ok).map(comoAcao),
  };
}

/**
 * 00:00 de ONTEM no horário de Brasília. (O `hojeUTC` das leituras da Meta é o MEIO-DIA do dia, um marcador de data — usado
 * como "início de hoje", ele escondia o que o robô fez antes das 9h.)
 */
function meiaNoiteDeOntemEmBrasilia(agora: Date): Date {
  const [a, m, d] = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-").map(Number);
  // Brasília é UTC−3 o ano todo (sem horário de verão desde 2019): 00:00 lá = 03:00 UTC.
  return new Date(Date.UTC(a, m - 1, d - 1, 3, 0, 0));
}
