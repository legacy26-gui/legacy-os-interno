import "server-only";
import type * as z from "zod";
import { AI_CONFIG, aiApiKey, AiNaoConfigurado } from "@/lib/ai/config";
import { RespostaIaInvalida } from "@/lib/ai/tipos";
import {
  chamarAnthropic,
  descreveErroAnthropic,
  ehRetentavelAnthropic,
  listarModelosAnthropic,
} from "@/lib/ai/provedores/anthropic";
import {
  chamarOpenAi,
  descreveErroOpenAi,
  ehRetentavelOpenAi,
  listarModelosOpenAi,
} from "@/lib/ai/provedores/openai";

// Única porta de saída pra IA. Quem chama pede "me devolve isso neste formato"
// e não sabe qual provedor está ligado — isso é decidido por AI_PROVIDER.

export { RespostaIaInvalida };

export interface ResultadoIa<T> {
  dados: T;
  bruto: string;
  provider: string;
  model: string;
  tentativas: number;
  durationMs: number;
}

const PROVEDORES = {
  anthropic: { chamar: chamarAnthropic, descreve: descreveErroAnthropic, retentavel: ehRetentavelAnthropic, modelos: listarModelosAnthropic },
  openai: { chamar: chamarOpenAi, descreve: descreveErroOpenAi, retentavel: ehRetentavelOpenAi, modelos: listarModelosOpenAi },
} as const;

function provedorAtual() {
  const p = PROVEDORES[AI_CONFIG.provider as keyof typeof PROVEDORES];
  if (!p) {
    throw new Error(
      `Provedor de IA "${AI_CONFIG.provider}" não existe. Use AI_PROVIDER=anthropic ou AI_PROVIDER=openai.`
    );
  }
  return p;
}

function descreveErro(erro: unknown): string {
  const especifico = provedorAtual().descreve(erro);
  if (especifico) return especifico;
  if (erro instanceof RespostaIaInvalida) return `A IA respondeu fora do formato esperado: ${erro.message}`;
  return erro instanceof Error ? erro.message : String(erro);
}

function ehRetentavel(erro: unknown): boolean {
  if (erro instanceof RespostaIaInvalida) return true; // JSON fora do formato
  return provedorAtual().retentavel(erro);
}

/**
 * Pede à IA uma resposta que obedece ao schema informado. O formato é imposto na
 * própria chamada (structured output) e ainda revalidado aqui antes de devolver.
 */
export async function gerarJson<S extends z.ZodType>({
  system,
  user,
  schema,
  maxTokens = AI_CONFIG.maxTokens,
}: {
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
}): Promise<ResultadoIa<z.infer<S>>> {
  const apiKey = aiApiKey();
  if (!apiKey) throw new AiNaoConfigurado();

  const provedor = provedorAtual();
  const comecou = Date.now();
  let ultimoErro: unknown = null;

  for (let tentativa = 1; tentativa <= AI_CONFIG.maxRetries + 1; tentativa++) {
    try {
      const resposta = await provedor.chamar({ apiKey, system, user, schema, maxTokens });

      // Cinto e suspensório: revalida com o schema antes de devolver.
      const validado = schema.safeParse(resposta.dados);
      if (!validado.success) {
        throw new RespostaIaInvalida(validado.error.issues[0]?.message ?? "campos faltando", resposta.bruto);
      }

      return {
        dados: validado.data as z.infer<S>,
        bruto: resposta.bruto,
        provider: AI_CONFIG.provider,
        model: resposta.model,
        tentativas: tentativa,
        durationMs: Date.now() - comecou,
      };
    } catch (erro) {
      ultimoErro = erro;
      const vaiRepetir = tentativa <= AI_CONFIG.maxRetries && ehRetentavel(erro);
      console.error(
        `[ia] tentativa ${tentativa} falhou (${vaiRepetir ? "vai repetir" : "desiste"}): ${descreveErro(erro)}`
      );
      if (!vaiRepetir) break;
      await new Promise((r) => setTimeout(r, 1500 * tentativa));
    }
  }

  throw new Error(descreveErro(ultimoErro));
}

// Modelos que a conta configurada realmente tem — pra escolher AI_MODEL sem
// chutar nome de modelo.
export async function listarModelos(): Promise<string[]> {
  const apiKey = aiApiKey();
  if (!apiKey) throw new AiNaoConfigurado();
  return provedorAtual().modelos(apiKey);
}
