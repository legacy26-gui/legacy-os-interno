import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod";
import { AI_CONFIG, aiApiKey, AiNaoConfigurado } from "@/lib/ai/config";

// Única porta de saída pra IA. Trocar de provedor/modelo é mexer só aqui e no
// config — quem chama pede "me devolve isso neste formato" e não sabe de nada.

export interface ResultadoIa<T> {
  dados: T;
  bruto: string;
  provider: string;
  model: string;
  tentativas: number;
  durationMs: number;
}

export class RespostaIaInvalida extends Error {
  constructor(
    message: string,
    readonly bruto: string
  ) {
    super(message);
    this.name = "RespostaIaInvalida";
  }
}

function ehRetentavel(erro: unknown): boolean {
  if (erro instanceof RespostaIaInvalida) return true; // JSON fora do formato
  if (erro instanceof Anthropic.APIError) {
    // 4xx de request errado não adianta repetir; 429 e 5xx sim.
    return erro.status === 429 || erro.status === undefined || (erro.status ?? 0) >= 500;
  }
  if (erro instanceof Anthropic.APIConnectionError) return true;
  return false;
}

function descreveErro(erro: unknown): string {
  if (erro instanceof Anthropic.AuthenticationError) {
    return "Chave da IA inválida ou sem permissão (401). Confira ANTHROPIC_API_KEY.";
  }
  if (erro instanceof Anthropic.RateLimitError) {
    return "Limite de uso da IA atingido (429). Tente gerar de novo em alguns minutos.";
  }
  if (erro instanceof Anthropic.APIConnectionTimeoutError) {
    return "A IA demorou demais para responder. Tente gerar de novo.";
  }
  if (erro instanceof Anthropic.APIError) {
    return `Erro da IA (${erro.status ?? "sem status"}): ${erro.message}`;
  }
  if (erro instanceof RespostaIaInvalida) {
    return `A IA respondeu fora do formato esperado: ${erro.message}`;
  }
  return erro instanceof Error ? erro.message : String(erro);
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

  if (AI_CONFIG.provider !== "anthropic") {
    throw new Error(
      `Provedor de IA "${AI_CONFIG.provider}" não implementado. Hoje só existe "anthropic" (veja src/lib/ai/client.ts).`
    );
  }

  const client = new Anthropic({
    apiKey,
    timeout: AI_CONFIG.timeoutMs,
    // As tentativas são controladas aqui embaixo, pra podermos repetir também
    // quando o JSON vem torto — o SDK só repetiria erro de rede/limite.
    maxRetries: 0,
  });

  const comecou = Date.now();
  let ultimoErro: unknown = null;

  for (let tentativa = 1; tentativa <= AI_CONFIG.maxRetries + 1; tentativa++) {
    try {
      const resposta = await client.messages
        .parse({
          model: AI_CONFIG.model,
          max_tokens: maxTokens,
          system,
          thinking: { type: "adaptive" },
          output_config: { effort: AI_CONFIG.effort, format: zodOutputFormat(schema) },
          messages: [{ role: "user", content: user }],
        })
        .catch((erro: unknown) => {
          // O SDK estoura com o dump do validador quando o JSON não bate com o
          // schema. Vira erro nosso, curto na tela e completo no log.
          const texto = erro instanceof Error ? erro.message : String(erro);
          if (texto.includes("Failed to parse structured output")) {
            console.error("[ia] resposta fora do schema:", texto);
            throw new RespostaIaInvalida("a resposta não veio no formato esperado", texto.slice(0, 2000));
          }
          throw erro;
        });

      const bruto = resposta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      if (resposta.stop_reason === "refusal") {
        throw new RespostaIaInvalida("a IA recusou a solicitação", bruto);
      }
      if (resposta.stop_reason === "max_tokens") {
        throw new RespostaIaInvalida("a resposta foi cortada por tamanho", bruto);
      }
      if (!resposta.parsed_output) {
        throw new RespostaIaInvalida("não veio JSON válido no formato pedido", bruto);
      }

      // Cinto e suspensório: revalida com o schema antes de devolver.
      const validado = schema.safeParse(resposta.parsed_output);
      if (!validado.success) {
        throw new RespostaIaInvalida(validado.error.issues[0]?.message ?? "campos faltando", bruto);
      }

      return {
        dados: validado.data as z.infer<S>,
        bruto,
        provider: AI_CONFIG.provider,
        model: resposta.model ?? AI_CONFIG.model,
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
