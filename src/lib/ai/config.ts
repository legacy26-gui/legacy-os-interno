import "server-only";

// Configuração da IA em um lugar só, pra trocar de modelo/provedor sem mexer no
// resto do sistema. Tudo vem de variável de ambiente — a chave NUNCA sai do
// servidor (nenhum arquivo deste diretório é importado por componente client).

const PROVIDER = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();

// Modelo padrão de cada provedor. Dá pra sobrescrever com AI_MODEL — e a rota
// /api/diagnostico/gerar?...&modelos=1 lista os modelos que a conta tem, pra
// não ficar no chute.
const MODELO_PADRAO: Record<string, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-5",
};

export const AI_CONFIG = {
  provider: PROVIDER,
  model: process.env.AI_MODEL ?? MODELO_PADRAO[PROVIDER] ?? "gpt-5",
  // Esforço de raciocínio: mais alto pensa melhor e demora mais. "medium"
  // mantém a geração dentro do tempo de execução da função na Vercel.
  effort: (process.env.AI_EFFORT ?? "medium") as "low" | "medium" | "high" | "xhigh" | "max",
  maxTokens: Number(process.env.AI_MAX_TOKENS ?? 8000),
  // Timeout por tentativa (ms). Fica abaixo do tempo máximo de execução das
  // rotas que chamam a IA (maxDuration = 300s) de propósito: assim a falha é
  // registrada como erro na análise em vez de a função ser morta no meio,
  // deixando tudo "processando".
  timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 240_000),
  maxRetries: Number(process.env.AI_MAX_RETRIES ?? 0),
} as const;

// Cada provedor lê a chave dele. Nenhuma delas sai do servidor.
export function aiApiKey(): string | null {
  const chave = AI_CONFIG.provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  return chave?.trim() || null;
}

export function nomeDaVariavelDaChave(): string {
  return AI_CONFIG.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
}

export class AiNaoConfigurado extends Error {
  constructor() {
    super(
      `IA não configurada: falta a variável de ambiente ${nomeDaVariavelDaChave()}. ` +
        "Configure no painel da Vercel (Settings → Environment Variables), refaça o deploy e gere de novo."
    );
    this.name = "AiNaoConfigurado";
  }
}
