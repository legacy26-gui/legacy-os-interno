import "server-only";

import { prisma } from "@/lib/prisma";
import { hojeUTC } from "./insights";

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
}

export interface OQueORoboFez {
  /** Desligados hoje. Some amanhã. */
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
      nome: true,
      pedidoPor: true,
      pedidoTexto: true,
      criadoEm: true,
      ok: true,
      erro: true,
      client: { select: { companyName: true } },
    },
  });

  const comoAcao = (l: (typeof linhas)[number]): AcaoDoRobo => ({
    id: l.id,
    clientId: l.clientId,
    loja: l.client.companyName,
    anuncio: l.nome,
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
      .filter((l) => l.ok && l.criadoEm >= inicioDeHoje)
      .map(comoAcao),
    falhas: linhas.filter((l) => !l.ok).map(comoAcao),
  };
}
