import "server-only";
import { buscarNaGraph } from "./cliente-graph";
import { enviarArquivoNaGraph, escreverNaGraph, lerComTokenDeEscrita } from "./escrever-na-graph";

// Vídeo de anúncio na Meta (pedido do Guilherme: "subir vídeos e fotos direto pelo sistema e pelo WhatsApp").
//
// ── Como sobe ───────────────────────────────────────────────────────────
// Upload em partes da Meta (act_X/advideos): start (tamanho) → transfer (pedaço a pedaço, cada um com o seu offset — a Meta
// diz qual o próximo) → finish. Em partes porque a hospedagem não aceita pedido grande: da tela, o navegador manda um pedaço
// por vez pro servidor (até PEDACO bytes), e o servidor repassa. Do WhatsApp, o servidor já tem o vídeo inteiro e manda os
// pedaços ele mesmo.
//
// ── Capa ────────────────────────────────────────────────────────────────
// Anúncio de vídeo precisa de uma imagem de capa. Na tela, o navegador tira um quadro do vídeo e sobe como foto. No WhatsApp,
// usa a miniatura que a Meta gera (depois de processar o vídeo).
//
// Limites: até MAX_VIDEO_BYTES, só MP4/MOV (conferido pelos primeiros bytes).

export const PEDACO = 3_500_000;
export const MAX_VIDEO_BYTES = 250 * 1024 * 1024;

/** MP4/MOV: "ftyp" nos bytes 4..8. Pura. */
export function ehVideo(bytes: Uint8Array): boolean {
  return bytes.length > 12 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp";
}

type Fase = { upload_session_id?: string; video_id?: string; start_offset?: string; end_offset?: string; success?: boolean };

export async function comecarVideo(contaMeta: string, tamanho: number): Promise<{ ok: true; sessao: string; videoId: string; proximo: number; ate: number } | { ok: false; erro: string }> {
  if (!Number.isInteger(tamanho) || tamanho <= 0) return { ok: false, erro: "Vídeo vazio." };
  if (tamanho > MAX_VIDEO_BYTES) return { ok: false, erro: `Vídeo maior que ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB.` };
  const r = await escreverNaGraph<Fase>(`${contaMeta}/advideos`, { upload_phase: "start", file_size: String(tamanho) });
  if (!r.ok || !r.dados.upload_session_id || !r.dados.video_id) return { ok: false, erro: `A Meta não abriu o envio do vídeo: ${r.ok ? "sem sessão" : r.erro}` };
  const proximo = Number(r.dados.start_offset ?? 0);
  return { ok: true, sessao: r.dados.upload_session_id, videoId: r.dados.video_id, proximo, ate: Number(r.dados.end_offset ?? proximo + PEDACO) };
}

/** O pedaço a mandar: o que a Meta pediu (start..end), sem passar do limite da hospedagem. Pura. */
export function fimDoPedaco(offset: number, ate: number, tamanho: number): number {
  return Math.min(tamanho, ate > offset ? ate : offset + PEDACO, offset + PEDACO);
}

/** Manda um pedaço. Devolve o próximo offset (= tamanho quando acabou). */
export async function mandarPedaco(contaMeta: string, sessao: string, offset: number, pedaco: Uint8Array): Promise<{ ok: true; proximo: number; ate: number } | { ok: false; erro: string }> {
  if (pedaco.length === 0 || pedaco.length > PEDACO + 1024) return { ok: false, erro: "Pedaço do vídeo com tamanho inválido." };
  const r = await enviarArquivoNaGraph<Fase>(
    `${contaMeta}/advideos`,
    { upload_phase: "transfer", upload_session_id: sessao, start_offset: String(offset) },
    { campo: "video_file_chunk", bytes: pedaco, nome: "pedaco.mp4", tipo: "video/mp4" },
  );
  if (!r.ok) return { ok: false, erro: `A Meta não recebeu um pedaço do vídeo: ${r.erro}` };
  const proximo = Number(r.dados.start_offset ?? offset + pedaco.length);
  return { ok: true, proximo, ate: Number(r.dados.end_offset ?? proximo + PEDACO) };
}

export async function terminarVideo(contaMeta: string, sessao: string, titulo: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const r = await escreverNaGraph<Fase>(`${contaMeta}/advideos`, { upload_phase: "finish", upload_session_id: sessao, title: titulo.slice(0, 200) });
  return r.ok ? { ok: true } : { ok: false, erro: `A Meta não fechou o vídeo: ${r.erro}` };
}

/** Sobe o vídeo inteiro (servidor — ex.: o que chegou pelo WhatsApp). */
export async function subirVideo(contaMeta: string, bytes: Uint8Array, titulo: string): Promise<{ ok: true; videoId: string } | { ok: false; erro: string }> {
  if (!ehVideo(bytes)) return { ok: false, erro: "Esse arquivo não é um vídeo MP4/MOV." };
  const c = await comecarVideo(contaMeta, bytes.length);
  if (!c.ok) return c;
  let offset = c.proximo;
  let ate = c.ate;
  for (let voltas = 0; offset < bytes.length && voltas < 2000; voltas++) {
    const r = await mandarPedaco(contaMeta, c.sessao, offset, bytes.subarray(offset, fimDoPedaco(offset, ate, bytes.length)));
    if (!r.ok) return r;
    if (r.proximo <= offset) return { ok: false, erro: "A Meta parou de aceitar o vídeo no meio." };
    offset = r.proximo;
    ate = r.ate;
  }
  const f = await terminarVideo(contaMeta, c.sessao, titulo);
  return f.ok ? { ok: true, videoId: c.videoId } : f;
}

/**
 * Espera a Meta processar o vídeo (até `esperaMs`) e devolve a miniatura dela (pra capa, quando não há quadro do navegador).
 * `pronto: false` não é erro: o criativo pode ser criado mesmo com o vídeo ainda processando (a Meta só publica depois).
 */
export async function esperarVideo(videoId: string, esperaMs = 60_000): Promise<{ pronto: boolean; capa: string | null; erro?: string }> {
  const fim = Date.now() + esperaMs;
  let capa: string | null = null;
  while (Date.now() < fim) {
    const r = await lerComTokenDeEscrita<{ status?: { video_status?: string }; picture?: string }>(videoId, { fields: "status,picture" });
    if (r.ok) {
      capa = r.dados.picture ?? capa;
      const st = r.dados.status?.video_status;
      if (st === "error") return { pronto: false, capa, erro: "A Meta não conseguiu processar o vídeo." };
      if (st === "ready") break;
    }
    await new Promise((res) => setTimeout(res, 4000));
  }
  const th = await buscarNaGraph<{ data?: { uri?: string; is_preferred?: boolean }[] }>(`${videoId}/thumbnails`, {});
  const preferida = th.ok ? ((th.dados.data ?? []).find((t) => t.is_preferred) ?? (th.dados.data ?? [])[0]) : null;
  return { pronto: Date.now() < fim, capa: preferida?.uri ?? capa };
}

/**
 * O object_story_spec de um anúncio de VÍDEO com botão de WhatsApp. Pura.
 * `capa`: hash de imagem (subida) ou endereço (miniatura da Meta).
 */
export function specDeVideo(p: {
  paginaId: string;
  instagramId?: string | null;
  videoId: string;
  capa: { hash?: string | null; url?: string | null };
  legenda: string;
  titulo: string;
  botao: Record<string, unknown>;
  conversa?: string | null;
}): Record<string, unknown> {
  const vd: Record<string, unknown> = { video_id: p.videoId, message: p.legenda, title: p.titulo.slice(0, 255), call_to_action: p.botao };
  if (p.capa.hash) vd.image_hash = p.capa.hash;
  else if (p.capa.url) vd.image_url = p.capa.url;
  if (p.conversa) vd.page_welcome_message = p.conversa;
  return { page_id: p.paginaId, ...(p.instagramId ? { instagram_user_id: p.instagramId } : {}), video_data: vd };
}
