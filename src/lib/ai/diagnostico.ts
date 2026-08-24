import "server-only";
import { prisma } from "@/lib/prisma";
import { gerarJson } from "@/lib/ai/client";
import { AI_CONFIG } from "@/lib/ai/config";
import { DiagnosticoSchema, parseDiagnostico } from "@/lib/ai/diagnostico-schema";
import { SYSTEM_PROMPT, PROMPT_VERSION, montarPromptUsuario } from "@/lib/ai/diagnostico-prompt";
import { coletarDadosDigitais, parseDadosDigitais } from "@/lib/ai/enriquecimento";
import type { AnalysisKind } from "@/generated/prisma/enums";

// Depois disso, uma análise "processando" é considerada travada (função morreu
// no meio, deploy no meio do caminho) e pode ser gerada de novo.
const LIMITE_PROCESSANDO_MS = 6 * 60 * 1000;

export class GeracaoDuplicada extends Error {
  constructor() {
    super("Já existe uma geração em andamento para esta ficha.");
    this.name = "GeracaoDuplicada";
  }
}

/**
 * Gera (ou regenera) o diagnóstico de uma ficha. Cria SEMPRE uma linha nova —
 * nada é sobrescrito, o histórico fica no banco.
 *
 * Nunca lança por culpa da IA: falha vira uma análise com status ERRO e a
 * mensagem, pra aparecer na tela e poder ser tentada de novo. Só lança quando
 * não há o que gerar (ficha inexistente) ou já existe geração em andamento.
 */
export async function gerarDiagnostico({
  onboardingId,
  kind = "PRE_DIAGNOSTICO",
  requestedById = null,
}: {
  onboardingId: string;
  kind?: AnalysisKind;
  requestedById?: string | null;
}): Promise<{ analysisId: string; status: "CONCLUIDO" | "ERRO" }> {
  const ficha = await prisma.clientOnboarding.findUnique({
    where: { id: onboardingId },
    include: {
      analyses: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!ficha) throw new Error("Ficha não encontrada.");

  // Evita duas gerações ao mesmo tempo (duplo clique, envio repetido do form).
  const emAndamento = ficha.analyses.find(
    (a) =>
      a.kind === kind &&
      a.status === "PROCESSANDO" &&
      Date.now() - a.createdAt.getTime() < LIMITE_PROCESSANDO_MS
  );
  if (emAndamento) throw new GeracaoDuplicada();

  const versao = Math.max(0, ...ficha.analyses.filter((a) => a.kind === kind).map((a) => a.version)) + 1;

  const respostas = (ficha.answers ?? {}) as Record<string, unknown>;
  const digitaisSalvos = parseDadosDigitais(ficha.enrichment);
  const digitais =
    digitaisSalvos ??
    (await coletarDadosDigitais({
      instagram: typeof respostas.instagram === "string" ? respostas.instagram : null,
      site: typeof respostas.site === "string" ? respostas.site : null,
      empresa: ficha.companyName,
      cidade: ficha.city,
    }));

  // No plano final, a IA recebe o último pré-diagnóstico pra confirmar ou
  // derrubar as hipóteses em vez de começar do zero.
  const preDiagnostico =
    kind === "PLANO_FINAL"
      ? ficha.analyses.find((a) => a.kind === "PRE_DIAGNOSTICO" && a.status === "CONCLUIDO")?.result
      : undefined;

  const entrada = {
    empresa: ficha.companyName,
    responsavel: ficha.contactName,
    cidade: ficha.city,
    respostas,
    dadosDigitais: digitais,
    reuniao: kind === "PLANO_FINAL" ? ficha.meetingNotes : null,
    preDiagnostico: preDiagnostico ?? undefined,
  };

  const analise = await prisma.onboardingAnalysis.create({
    data: {
      onboardingId,
      clientId: ficha.clientId,
      kind,
      version: versao,
      status: "PROCESSANDO",
      provider: AI_CONFIG.provider,
      model: AI_CONFIG.model,
      promptVersion: PROMPT_VERSION,
      inputData: JSON.parse(JSON.stringify(entrada)),
      requestedById,
    },
  });

  try {
    const resultado = await gerarJson({
      system: SYSTEM_PROMPT,
      user: montarPromptUsuario(entrada),
      schema: DiagnosticoSchema,
    });

    await prisma.onboardingAnalysis.update({
      where: { id: analise.id },
      data: {
        status: "CONCLUIDO",
        result: JSON.parse(JSON.stringify(resultado.dados)),
        rawResponse: resultado.bruto.slice(0, 100_000),
        model: resultado.model,
        durationMs: resultado.durationMs,
        completedAt: new Date(),
      },
    });

    console.log(
      `[diagnostico] ${kind} v${versao} da ficha ${onboardingId} pronto em ${resultado.durationMs}ms (${resultado.tentativas} tentativa(s))`
    );
    return { analysisId: analise.id, status: "CONCLUIDO" };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(`[diagnostico] ${kind} da ficha ${onboardingId} falhou: ${mensagem}`);
    await prisma.onboardingAnalysis.update({
      where: { id: analise.id },
      data: { status: "ERRO", error: mensagem.slice(0, 5000), completedAt: new Date() },
    });
    return { analysisId: analise.id, status: "ERRO" };
  }
}

export interface AnaliseParaTela {
  id: string;
  kind: AnalysisKind;
  version: number;
  status: "PROCESSANDO" | "CONCLUIDO" | "ERRO";
  model: string;
  promptVersion: string;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
  diagnostico: ReturnType<typeof parseDiagnostico>;
}

export interface ParDeAnalises {
  // A tentativa mais recente (pode estar processando ou ter dado erro).
  ultima: AnaliseParaTela | null;
  // A última que deu certo — é o conteúdo que a equipe lê. Uma tentativa que
  // falha não apaga da tela o diagnóstico bom que já existia.
  concluida: AnaliseParaTela | null;
}

export async function carregarAnalises(onboardingId: string): Promise<{
  pre: ParDeAnalises;
  final: ParDeAnalises;
  totalVersoes: number;
}> {
  const linhas = await prisma.onboardingAnalysis.findMany({
    where: { onboardingId },
    orderBy: { createdAt: "desc" },
  });

  const converte = (a: (typeof linhas)[number] | undefined): AnaliseParaTela | null => {
    if (!a) return null;
    return {
      id: a.id,
      kind: a.kind,
      version: a.version,
      status: a.status,
      model: a.model,
      promptVersion: a.promptVersion,
      error: a.error,
      createdAt: a.createdAt,
      completedAt: a.completedAt,
      diagnostico: parseDiagnostico(a.result),
    };
  };

  const par = (kind: AnalysisKind): ParDeAnalises => ({
    ultima: converte(linhas.find((l) => l.kind === kind)),
    concluida: converte(linhas.find((l) => l.kind === kind && l.status === "CONCLUIDO")),
  });

  return {
    pre: par("PRE_DIAGNOSTICO"),
    final: par("PLANO_FINAL"),
    totalVersoes: linhas.length,
  };
}
