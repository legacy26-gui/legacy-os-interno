import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod";
import { AI_CONFIG } from "@/lib/ai/config";
import { RespostaIaInvalida, type ChamadaIa, type RespostaBruta } from "@/lib/ai/tipos";

// Adaptador da Anthropic. Mesma assinatura do adaptador da OpenAI.

export async function chamarAnthropic<S extends z.ZodType>({
  apiKey,
  system,
  user,
  schema,
  maxTokens,
}: ChamadaIa<S>): Promise<RespostaBruta<z.infer<S>>> {
  const client = new Anthropic({ apiKey, timeout: AI_CONFIG.timeoutMs, maxRetries: 0 });

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

  return { dados: resposta.parsed_output as z.infer<S>, bruto, model: resposta.model ?? AI_CONFIG.model };
}

export function descreveErroAnthropic(erro: unknown): string | null {
  if (erro instanceof Anthropic.AuthenticationError) {
    return "Chave da IA inválida ou sem permissão (401). Confira ANTHROPIC_API_KEY.";
  }
  if (erro instanceof Anthropic.NotFoundError) {
    return `Modelo "${AI_CONFIG.model}" não encontrado nesta conta (404). Ajuste AI_MODEL.`;
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
  return null;
}

export function ehRetentavelAnthropic(erro: unknown): boolean {
  if (erro instanceof Anthropic.APIError) {
    return erro.status === 429 || erro.status === undefined || (erro.status ?? 0) >= 500;
  }
  return erro instanceof Anthropic.APIConnectionError;
}

export async function listarModelosAnthropic(apiKey: string): Promise<string[]> {
  const client = new Anthropic({ apiKey, timeout: 20_000 });
  const lista = await client.models.list({ limit: 50 });
  return lista.data.map((m) => m.id).sort();
}
