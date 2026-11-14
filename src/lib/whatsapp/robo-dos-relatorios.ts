import "server-only";

import { prisma } from "@/lib/prisma";
import { CARTEIRA } from "@/lib/carteira";
import { segundaDaSemana } from "@/lib/dia-da-casa";
import { mandarRelatorioNoGrupo } from "./mandar-relatorio";
import { zapiConfigurado } from "./zapi";

// O robô que manda os relatórios da semana, segunda de manhã.
//
// ── Por que ele manda POUCOS de cada vez ─────────────────────────────────
//
// Esta é a decisão que o arquivo inteiro protege. A Z-API não é oficial: ela
// conecta um número comum pelo mesmo caminho do WhatsApp Web, e quarenta
// mensagens em rajada de um número desses é o jeito mais rápido conhecido de
// a Meta bloqueá-lo. Bloqueado o número, para o envio automático da casa
// inteira — e o chip não volta.
//
// Então o robô acorda de cinco em cinco minutos na manhã de segunda e manda
// um punhado por vez, com uma pausa irregular entre uma mensagem e outra. A
// casa inteira sai em menos de uma hora, parecendo gente mandando.
//
// ── Por que a pausa é irregular ──────────────────────────────────────────
//
// Porque exatamente dez segundos entre quarenta mensagens é a assinatura de
// um robô. O intervalo sorteado custa nada e não deixa esse rastro.
//
// ── Por que existe teto de tentativa ─────────────────────────────────────
//
// Porque a loja que falha, falha sempre: sem leitura boa da Meta o relatório
// sairia zerado e a função recusa — corretamente. Sem teto, ela seria tentada
// a cada rodada por três horas, e cada tentativa DESENHA a imagem antes de
// descobrir que não vai dar. Três tentativas e ela vira pendência do Meu Dia,
// que é onde gente resolve.

/** Quantas lojas por rodada. */
export const POR_RODADA = 4;

/** A pausa entre uma mensagem e outra, em milissegundos. */
export const PAUSA_MIN_MS = 6_000;
export const PAUSA_MAX_MS = 14_000;

/** Depois disto a loja vira pendência de gente. */
export const TETO_DE_TENTATIVAS = 3;

export interface ResultadoDaRodada {
  /** O robô nem rodou, e por quê. */
  pulou?: "zapi-desligada" | "nao-e-segunda" | "nada-pendente";
  mandados: string[];
  falharam: { loja: string; erro: string }[];
  /** Quantas lojas ainda faltam depois desta rodada. */
  faltam: number;
}

function dorme(ms: number) {
  return new Promise((pronto) => setTimeout(pronto, ms));
}

function pausaSorteada() {
  return PAUSA_MIN_MS + Math.floor(Math.random() * (PAUSA_MAX_MS - PAUSA_MIN_MS));
}

/**
 * Manda o relatório pra algumas lojas que ainda não receberam esta semana.
 *
 * Chamada várias vezes na manhã de segunda. Cada rodada pega as próximas da
 * fila, então o trabalho se divide sozinho e uma rodada que morrer no meio
 * não perde nada: a próxima continua de onde parou.
 */
export async function mandarRelatoriosDaSemana(
  agora = new Date(),
): Promise<ResultadoDaRodada> {
  if (!zapiConfigurado()) {
    return { pulou: "zapi-desligada", mandados: [], falharam: [], faltam: 0 };
  }

  const semana = segundaDaSemana(agora);

  // As lojas da casa que têm grupo. Sem grupo não há pra onde mandar, e
  // listá-las aqui só geraria falha toda semana por algo que não é falha.
  const lojas = await prisma.client.findMany({
    where: { ...CARTEIRA, whatsappGrupoId: { not: null } },
    orderBy: { companyName: "asc" },
    select: { id: true, companyName: true },
  });
  if (lojas.length === 0) {
    return { pulou: "nada-pendente", mandados: [], falharam: [], faltam: 0 };
  }

  const ids = lojas.map((l) => l.id);
  const [jaForam, tentativas] = await Promise.all([
    prisma.relatorioEnviado.findMany({
      where: { clientId: { in: ids }, semana },
      select: { clientId: true },
    }),
    prisma.tentativaDeRelatorio.findMany({
      where: { clientId: { in: ids }, semana },
      select: { clientId: true, tentativas: true },
    }),
  ]);

  const prontas = new Set(jaForam.map((r) => r.clientId));
  const quantasTentou = new Map(
    tentativas.map((t) => [t.clientId, t.tentativas]),
  );

  const fila = lojas.filter(
    (l) =>
      !prontas.has(l.id) &&
      (quantasTentou.get(l.id) ?? 0) < TETO_DE_TENTATIVAS,
  );
  if (fila.length === 0) {
    return { pulou: "nada-pendente", mandados: [], falharam: [], faltam: 0 };
  }

  const desta = fila.slice(0, POR_RODADA);
  const mandados: string[] = [];
  const falharam: { loja: string; erro: string }[] = [];

  for (const [i, loja] of desta.entries()) {
    // A pausa vem ANTES da mensagem, menos na primeira. Assim a rodada não
    // gasta tempo de função esperando depois da última, que é tempo jogado
    // fora — a próxima rodada já está a cinco minutos de distância.
    if (i > 0) await dorme(pausaSorteada());

    // A tentativa é contada ANTES de tentar. Se a função for cortada no meio
    // — tempo esgotado, container reciclado — a loja não fica numa fila que
    // a tenta pra sempre.
    await prisma.tentativaDeRelatorio.upsert({
      where: { clientId_semana: { clientId: loja.id, semana } },
      create: { clientId: loja.id, semana, tentativas: 1 },
      update: { tentativas: { increment: 1 }, ultimaEm: new Date() },
    });

    const r = await mandarRelatorioNoGrupo(loja.id);

    if (r.ok) {
      // Marca DEPOIS de sair, nunca antes. Marcar antes criaria o pior
      // defeito possível: a Z-API fora do ar, o cliente sem receber nada, e
      // a tela dizendo "enviado" pra todo mundo.
      await prisma.relatorioEnviado.upsert({
        where: { clientId_semana: { clientId: loja.id, semana } },
        create: { clientId: loja.id, semana, quemId: null },
        update: {},
      });
      await prisma.tentativaDeRelatorio.update({
        where: { clientId_semana: { clientId: loja.id, semana } },
        data: { ultimoErro: null },
      });
      mandados.push(loja.companyName);
    } else {
      await prisma.tentativaDeRelatorio.update({
        where: { clientId_semana: { clientId: loja.id, semana } },
        data: { ultimoErro: r.erro.slice(0, 500) },
      });
      falharam.push({ loja: loja.companyName, erro: r.erro });
    }
  }

  return { mandados, falharam, faltam: fila.length - desta.length };
}

/**
 * As lojas que o robô tentou e não conseguiu nesta semana.
 *
 * Pro Meu Dia. Uma loja que estourou o teto não aparece em lugar nenhum se
 * ninguém perguntar por ela — e aí o cliente simplesmente não recebe o
 * relatório, calado, até cobrar.
 */
export async function relatoriosQueFalharam(
  clientIds: string[],
  agora = new Date(),
): Promise<{ clientId: string; loja: string; erro: string; tentativas: number }[]> {
  if (clientIds.length === 0) return [];
  const semana = segundaDaSemana(agora);

  const linhas = await prisma.tentativaDeRelatorio.findMany({
    where: {
      clientId: { in: clientIds },
      semana,
      ultimoErro: { not: null },
      client: { relatoriosEnviados: { none: { semana } } },
    },
    select: {
      clientId: true,
      ultimoErro: true,
      tentativas: true,
      client: { select: { companyName: true } },
    },
  });

  return linhas.map((l) => ({
    clientId: l.clientId,
    loja: l.client.companyName,
    erro: l.ultimoErro!,
    tentativas: l.tentativas,
  }));
}
