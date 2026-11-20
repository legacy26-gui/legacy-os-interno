import "server-only";

// Áudio do WhatsApp → texto.
//
// ── Por que OpenAI, e não o provedor do Copiloto ─────────────────────────
//
// O Copiloto pode estar na Anthropic, que não transcreve áudio. Então a
// transcrição usa a chave da OpenAI diretamente (OPENAI_API_KEY), independente de
// qual provedor responde o resto. Sem a chave, o robô diz que não conseguiu ouvir
// — nunca finge ter entendido.
//
// ── O que se baixa, e de onde ────────────────────────────────────────────
//
// O endereço do áudio vem no corpo do webhook. O webhook é protegido por segredo,
// mas "baixar uma URL que veio de fora" é o desenho clássico de SSRF, então:
// só https, nada de IP ou nome interno, tamanho máximo, tempo máximo. Quem chama
// já conferiu que o áudio é do DONO no grupo financeiro antes de chegar aqui.

export const SEGUNDOS_MAXIMOS = 120;
const BYTES_MAXIMOS = 8 * 1024 * 1024;
const MODELO = process.env.TRANSCRICAO_MODELO?.trim() || "gpt-4o-mini-transcribe";

export type ResultadoDaTranscricao = { ok: true; texto: string } | { ok: false; erro: string };

/** O endereço é seguro pra baixar? (Em teste, TRANSCRICAO_PERMITE_LOCAL=1 libera o http local.) */
export function urlDeAudioSegura(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (process.env.TRANSCRICAO_PERMITE_LOCAL === "1" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return true;
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  // IPv4/IPv6 literal: nunca.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":") || h.startsWith("[")) return false;
  return h.includes(".");
}

function extensaoDe(tipo: string | null | undefined): string {
  const t = (tipo ?? "").toLowerCase();
  if (t.includes("ogg") || t.includes("opus")) return "ogg";
  if (t.includes("mpeg") || t.includes("mp3")) return "mp3";
  if (t.includes("mp4") || t.includes("m4a") || t.includes("aac")) return "m4a";
  if (t.includes("wav")) return "wav";
  if (t.includes("webm")) return "webm";
  return "ogg"; // o áudio de voz do WhatsApp é ogg/opus
}

export async function transcreverAudio(url: string, opcoes: { mimeType?: string | null } = {}): Promise<ResultadoDaTranscricao> {
  const chave = process.env.OPENAI_API_KEY?.trim();
  if (!chave) return { ok: false, erro: "falta a chave da OpenAI (OPENAI_API_KEY) pra transcrever áudio" };
  if (!urlDeAudioSegura(url)) return { ok: false, erro: "o endereço do áudio não é confiável" };

  let bytes: ArrayBuffer;
  let tipo: string | null = opcoes.mimeType ?? null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return { ok: false, erro: `não consegui baixar o áudio (${r.status})` };
    const declarado = Number(r.headers.get("content-length") ?? 0);
    if (declarado > BYTES_MAXIMOS) return { ok: false, erro: "o áudio é grande demais" };
    bytes = await r.arrayBuffer();
    tipo = tipo ?? r.headers.get("content-type");
  } catch {
    return { ok: false, erro: "não consegui baixar o áudio" };
  }
  if (bytes.byteLength === 0) return { ok: false, erro: "o áudio veio vazio" };
  if (bytes.byteLength > BYTES_MAXIMOS) return { ok: false, erro: "o áudio é grande demais" };

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: tipo ?? "audio/ogg" }), `audio.${extensaoDe(tipo)}`);
  form.append("model", MODELO);
  form.append("language", "pt");
  form.append("response_format", "json");
  // Vocabulário: ajuda o modelo a acertar o que se fala de gasto.
  form.append(
    "prompt",
    "Anotação de gastos em reais: almoço, uber, mercado, gasolina, farmácia, imposto, DAS, pessoal, empresa, treinamentos.",
  );

  try {
    const base = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
    const r = await fetch(`${base}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) return { ok: false, erro: `a transcrição falhou (${r.status})` };
    const j = (await r.json()) as { text?: unknown };
    const texto = typeof j.text === "string" ? j.text.trim() : "";
    if (!texto) return { ok: false, erro: "não ouvi fala nesse áudio" };
    return { ok: true, texto };
  } catch {
    return { ok: false, erro: "a transcrição não respondeu" };
  }
}
