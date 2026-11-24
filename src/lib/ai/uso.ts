import "server-only";

import { prisma } from "@/lib/prisma";

// Quanto cada função do sistema gasta de IA. Uma linha por chamada (uso_da_ia), gravada por gerarJson e pela transcrição.
//
// O CUSTO é estimado pelo preço de tabela, em dólar por 1 milhão de tokens — dá pra ajustar pelas variáveis abaixo se o preço
// mudar. A conta de verdade é a do painel da OpenAI (Usage); isto aqui serve pra saber QUAL função pesa, que o painel não mostra.

export interface UsoDeUmaChamada {
  entrada: number;
  cacheados: number;
  saida: number;
  raciocinio: number;
}

const preco = (nome: string, padrao: number) => {
  const v = Number(process.env[nome]);
  return Number.isFinite(v) && v >= 0 ? v : padrao;
};

/** Preço de tabela por 1M de tokens (US$). Padrão: gpt-5. Transcrição: US$ por minuto. */
export function precos() {
  return {
    entrada: preco("AI_PRECO_ENTRADA_1M", 1.25),
    cacheados: preco("AI_PRECO_CACHE_1M", 0.125),
    saida: preco("AI_PRECO_SAIDA_1M", 10),
    audioPorMinuto: preco("AI_PRECO_AUDIO_MINUTO", 0.003),
  };
}

/** Preço de tabela do modelo (US$ por 1M). Modelos "mini"/"nano" são bem mais baratos que o principal. Pura. */
export function precoDoModelo(modelo: string): { entrada: number; cacheados: number; saida: number } {
  const m = modelo.toLowerCase();
  if (m.includes("nano")) return { entrada: 0.05, cacheados: 0.005, saida: 0.4 };
  if (m.includes("mini")) return { entrada: 0.25, cacheados: 0.025, saida: 2 };
  const p = precos();
  return { entrada: p.entrada, cacheados: p.cacheados, saida: p.saida };
}

/** Custo estimado (US$) de um conjunto de tokens. O raciocínio já está dentro da saída. Pura. */
export function custoEstimado(u: { entrada: number; cacheados: number; saida: number; segundosDeAudio?: number | null; modelo?: string }): number {
  const p = { ...precos(), ...(u.modelo ? precoDoModelo(u.modelo) : {}) };
  const naoCacheados = Math.max(0, u.entrada - u.cacheados);
  return (
    (naoCacheados * p.entrada + u.cacheados * p.cacheados + u.saida * p.saida) / 1_000_000 +
    ((u.segundosDeAudio ?? 0) / 60) * p.audioPorMinuto
  );
}

/** Grava o uso. Nunca estoura: registrar não pode derrubar a função que usou a IA. */
export async function registrarUso(funcao: string, modelo: string, uso: UsoDeUmaChamada | null, ms: number, segundosDeAudio?: number | null) {
  try {
    await prisma.usoDaIa.create({
      data: {
        funcao: funcao.slice(0, 60),
        modelo: modelo.slice(0, 60),
        entrada: uso?.entrada ?? 0,
        cacheados: uso?.cacheados ?? 0,
        saida: uso?.saida ?? 0,
        raciocinio: uso?.raciocinio ?? 0,
        segundosDeAudio: segundosDeAudio ?? null,
        ms: Math.round(ms),
      },
    });
  } catch (e) {
    console.error("[ia] não consegui registrar o uso", e);
  }
}

export const NOME_DA_FUNCAO: Record<string, string> = {
  "copiloto-escolher": "Copiloto (WhatsApp/tela) — entender a pergunta",
  "copiloto-responder": "Copiloto (WhatsApp/tela) — escrever a resposta",
  "financeiro-interpretar": "Grupo financeiro — entender cada mensagem",
  "financeiro-ler": "Financeiro — ler gasto com IA",
  "audio-transcricao": "Áudios — transcrição",
  "legenda-anuncio": "Legenda de anúncio",
  "comentario-relatorio": "Comentário do relatório semanal",
  diagnostico: "Diagnóstico da loja",
  outros: "Outros",
};

export interface LinhaDoResumo {
  funcao: string;
  nome: string;
  chamadas: number;
  entrada: number;
  saida: number;
  raciocinio: number;
  custoUsd: number;
}

/** Soma por função, desde uma data. */
export async function resumoDoUso(desde: Date): Promise<{ linhas: LinhaDoResumo[]; totalUsd: number; chamadas: number }> {
  const grupos = await prisma.usoDaIa.groupBy({
    by: ["funcao", "modelo"],
    where: { quando: { gte: desde } },
    _count: { _all: true },
    _sum: { entrada: true, cacheados: true, saida: true, raciocinio: true, segundosDeAudio: true },
  });
  // Soma por função (uma função pode ter usado mais de um modelo: o barato e, se ele falhou, o principal).
  const porFuncao = new Map<string, LinhaDoResumo>();
  for (const g of grupos) {
    const s = { entrada: g._sum.entrada ?? 0, cacheados: g._sum.cacheados ?? 0, saida: g._sum.saida ?? 0, segundosDeAudio: g._sum.segundosDeAudio ?? 0, modelo: g.modelo };
    const l = porFuncao.get(g.funcao) ?? { funcao: g.funcao, nome: NOME_DA_FUNCAO[g.funcao] ?? g.funcao, chamadas: 0, entrada: 0, saida: 0, raciocinio: 0, custoUsd: 0 };
    l.chamadas += g._count._all;
    l.entrada += s.entrada;
    l.saida += s.saida;
    l.raciocinio += g._sum.raciocinio ?? 0;
    l.custoUsd += custoEstimado(s);
    porFuncao.set(g.funcao, l);
  }
  const linhas = [...porFuncao.values()].sort((a, b) => b.custoUsd - a.custoUsd);
  return { linhas, totalUsd: linhas.reduce((t, l) => t + l.custoUsd, 0), chamadas: linhas.reduce((t, l) => t + l.chamadas, 0) };
}
