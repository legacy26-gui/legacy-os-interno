import "server-only";

// Configuração da IA em um lugar só, pra trocar de modelo/provedor sem mexer no
// resto do sistema. Tudo vem de variável de ambiente — a chave NUNCA sai do
// servidor (nenhum arquivo deste diretório é importado por componente client).

export const AI_CONFIG = {
  provider: process.env.AI_PROVIDER ?? "anthropic",
  model: process.env.AI_MODEL ?? "claude-opus-5",
  // Esforço de raciocínio: mais alto pensa melhor e demora mais. "medium"
  // mantém a geração dentro do tempo de execução da função na Vercel.
  effort: (process.env.AI_EFFORT ?? "medium") as "low" | "medium" | "high" | "xhigh" | "max",
  maxTokens: Number(process.env.AI_MAX_TOKENS ?? 8000),
  // Timeout por tentativa (ms). Fica abaixo do tempo máximo de execução da
  // função na Vercel (60s) de propósito: assim a falha é registrada como erro
  // na análise em vez de a função ser morta com tudo "processando".
  timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 52_000),
  maxRetries: Number(process.env.AI_MAX_RETRIES ?? 0),
} as const;

export function aiApiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY?.trim() || null;
}

export class AiNaoConfigurado extends Error {
  constructor() {
    super(
      "IA não configurada: falta a variável de ambiente ANTHROPIC_API_KEY. " +
        "Configure no painel da Vercel (Settings → Environment Variables) e gere de novo."
    );
    this.name = "AiNaoConfigurado";
  }
}
