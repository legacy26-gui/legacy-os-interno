import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// A conversa com a API da tabela FIPE (fipe.parallelum.com.br, v2): marcas → versões → anos → preço.
//
// ── A cota ───────────────────────────────────────────────────────────────
//
// A API gratuita deixa 1.000 consultas por dia e 50 por minuto. Por isso:
//   - toda resposta fica guardada (fipe_cache): marcas, versões e anos por 30 dias; preço por 20 (a FIPE muda
//     uma vez por mês);
//   - uma pausa entre consultas de verdade (as do cache não esperam);
//   - cada rodada tem um ORÇAMENTO de consultas; acabou, para, e o resto fica pra próxima rodada.
// Com FIPE_TOKEN configurado (conta gratuita deles), a cota sobe — vai no cabeçalho, nunca na URL.

const BASE = () => process.env.FIPE_BASE_URL?.trim() || "https://fipe.parallelum.com.br/api/v2/cars";
const PAUSA_MS = () => Number(process.env.FIPE_PAUSA_MS ?? 1300);
const DIA = 86_400_000;

export class SemCota extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "SemCota";
  }
}

export interface Orcamento {
  /** Consultas de verdade (fora do cache) que ainda podem ser feitas nesta rodada. */
  restantes: number;
  /** Hora limite da rodada (ms). */
  ate: number;
  feitas: number;
}

export function novoOrcamento(consultas: number, ms: number): Orcamento {
  return { restantes: consultas, ate: Date.now() + ms, feitas: 0 };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET na FIPE, com cache. Lança SemCota quando o orçamento ou a API dizem que acabou. */
export async function buscarFipe<T>(caminho: string, validadeDias: number, orc: Orcamento): Promise<T> {
  const guardado = await prisma.fipeCache.findUnique({ where: { chave: caminho } });
  if (guardado && Date.now() - guardado.buscadoEm.getTime() < validadeDias * DIA) return guardado.dados as T;

  if (orc.restantes <= 0) throw new SemCota("acabou o orçamento desta rodada");
  if (Date.now() > orc.ate) throw new SemCota("acabou o tempo desta rodada");
  if (orc.feitas > 0) await dormir(PAUSA_MS());
  orc.restantes--;
  orc.feitas++;

  const token = process.env.FIPE_TOKEN?.trim();
  let r: Response;
  try {
    r = await fetch(`${BASE()}${caminho}`, {
      headers: token ? { "X-Subscription-Token": token } : {},
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new Error("a FIPE não respondeu");
  }
  if (r.status === 429) throw new SemCota("a FIPE pediu pra esperar (cota do dia ou do minuto)");
  const dados = (await r.json().catch(() => null)) as T | null;
  if (!r.ok && r.status !== 404 && r.status !== 400) throw new Error(`a FIPE respondeu ${r.status}`);
  // 404/400 ("veículo não encontrado") também é resposta: guarda, pra não perguntar de novo.
  const valor = (dados ?? { error: `HTTP ${r.status}` }) as unknown as Prisma.InputJsonValue;
  await prisma.fipeCache.upsert({
    where: { chave: caminho },
    create: { chave: caminho, dados: valor },
    update: { dados: valor, buscadoEm: new Date() },
  });
  return valor as T;
}
