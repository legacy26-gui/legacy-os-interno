import "server-only";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type * as z from "zod";
import { AI_CONFIG } from "@/lib/ai/config";
import { RespostaIaInvalida, type ChamadaIa, type RespostaBruta } from "@/lib/ai/tipos";

// Adaptador da OpenAI. Mesma assinatura do adaptador da Anthropic: recebe o
// pedido e devolve o JSON já no formato pedido. Quem chama não sabe qual dos
// dois está ligado.

function cliente(apiKey: string) {
  return new OpenAI({ apiKey, timeout: AI_CONFIG.timeoutMs, maxRetries: 0 });
}

// A OpenAI aceita low | medium | high. Nossos níveis extras (xhigh/max) viram
// high — é o teto de lá.
function esforcoDeRaciocinio(): "low" | "medium" | "high" {
  if (AI_CONFIG.effort === "low") return "low";
  if (AI_CONFIG.effort === "medium") return "medium";
  return "high";
}

export async function chamarOpenAi<S extends z.ZodType>({
  apiKey,
  system,
  user,
  schema,
  maxTokens,
}: ChamadaIa<S>): Promise<RespostaBruta<z.infer<S>>> {
  const resposta = await cliente(apiKey)
    .chat.completions.parse({
      model: AI_CONFIG.model,
      max_completion_tokens: maxTokens,
      reasoning_effort: esforcoDeRaciocinio(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // Formato imposto na própria chamada (structured output em modo estrito).
      response_format: zodResponseFormat(schema, "diagnostico"),
    })
    .catch((erro: unknown) => {
      const texto = erro instanceof Error ? erro.message : String(erro);
      if (texto.includes("Could not parse response content") || texto.includes("refusal")) {
        console.error("[ia] resposta fora do schema:", texto);
        throw new RespostaIaInvalida("a resposta não veio no formato esperado", texto.slice(0, 2000));
      }
      throw erro;
    });

  const escolha = resposta.choices[0];
  const bruto = escolha?.message?.content ?? "";

  if (escolha?.message?.refusal) {
    throw new RespostaIaInvalida(`a IA recusou a solicitação: ${escolha.message.refusal}`, bruto);
  }
  if (escolha?.finish_reason === "length") {
    throw new RespostaIaInvalida("a resposta foi cortada por tamanho", bruto);
  }
  if (!escolha?.message?.parsed) {
    throw new RespostaIaInvalida("não veio JSON válido no formato pedido", bruto);
  }

  return { dados: escolha.message.parsed as z.infer<S>, bruto, model: resposta.model ?? AI_CONFIG.model };
}

export function descreveErroOpenAi(erro: unknown): string | null {
  if (erro instanceof OpenAI.AuthenticationError) {
    return "Chave da IA inválida ou sem permissão (401). Confira OPENAI_API_KEY.";
  }
  if (erro instanceof OpenAI.PermissionDeniedError) {
    return "A conta não tem permissão para usar este modelo (403). Confira AI_MODEL e o acesso da conta.";
  }
  if (erro instanceof OpenAI.NotFoundError) {
    return `Modelo "${AI_CONFIG.model}" não existe nesta conta (404). Veja os modelos disponíveis em /api/diagnostico/gerar?key=...&modelos=1 e ajuste AI_MODEL.`;
  }
  if (erro instanceof OpenAI.RateLimitError) {
    return "Limite de uso ou crédito da OpenAI atingido (429). Confira o saldo e tente de novo.";
  }
  if (erro instanceof OpenAI.APIConnectionTimeoutError) {
    return "A IA demorou demais para responder. Tente gerar de novo.";
  }
  if (erro instanceof OpenAI.APIError) {
    return `Erro da IA (${erro.status ?? "sem status"}): ${erro.message}`;
  }
  return null;
}

export function ehRetentavelOpenAi(erro: unknown): boolean {
  if (erro instanceof OpenAI.APIError) {
    return erro.status === 429 || erro.status === undefined || (erro.status ?? 0) >= 500;
  }
  return erro instanceof OpenAI.APIConnectionError;
}

// Lista os modelos que a conta realmente tem — usado pela rota de conferência,
// pra configurar AI_MODEL sem adivinhação.
export async function listarModelosOpenAi(apiKey: string): Promise<string[]> {
  const lista = await cliente(apiKey).models.list();
  return lista.data.map((m) => m.id).sort();
}
