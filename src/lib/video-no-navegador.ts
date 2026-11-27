"use client";

import { capaDoVideo, comecarVideoDaLoja, pedacoDoVideo, terminarVideoDaLoja } from "@/lib/actions/video";

// Sobe um vídeo da tela pra conta de anúncio da loja: em pedaços (a hospedagem não aceita pedido grande), com progresso, e
// tira um quadro do próprio vídeo pra ser a capa. Ver src/lib/meta/video.ts.

export interface VideoSubido {
  videoId: string;
  capaHash: string | null;
  nome: string;
}

/** Um quadro do vídeo (por volta de 1s) como JPEG — a capa do anúncio. null se o navegador não conseguir. */
export async function quadroDoVideo(arquivo: File): Promise<Blob | null> {
  const url = URL.createObjectURL(arquivo);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    await new Promise<void>((ok, erro) => {
      v.onloadeddata = () => ok();
      v.onerror = () => erro(new Error("vídeo"));
      setTimeout(() => erro(new Error("tempo")), 15_000);
    });
    v.currentTime = Math.min(1, (v.duration || 2) / 2);
    await new Promise<void>((ok) => {
      v.onseeked = () => ok();
      setTimeout(ok, 5000);
    });
    const escala = Math.min(1, 1080 / Math.max(v.videoWidth, v.videoHeight, 1));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * escala);
    c.height = Math.round(v.videoHeight * escala);
    if (!c.width || !c.height) return null;
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    return await new Promise<Blob | null>((ok) => c.toBlob((b) => ok(b), "image/jpeg", 0.88));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function subirVideoPelaTela(p: { clientId: string; contaMeta: string; arquivo: File; progresso: (pct: number) => void }): Promise<{ ok: true; video: VideoSubido } | { ok: false; erro: string }> {
  if (!/^video\/(mp4|quicktime)$/.test(p.arquivo.type) && !/\.(mp4|mov)$/i.test(p.arquivo.name)) return { ok: false, erro: "Use vídeo MP4 ou MOV." };
  const c = await comecarVideoDaLoja(p.clientId, p.contaMeta, p.arquivo.size);
  if (!c.ok) return c;
  let offset = c.proximo;
  let ate = c.ate;
  for (let voltas = 0; offset < p.arquivo.size && voltas < 2000; voltas++) {
    const form = new FormData();
    form.set("clientId", p.clientId);
    form.set("contaMeta", p.contaMeta);
    form.set("sessao", c.sessao);
    form.set("offset", String(offset));
    // O pedaço que a Meta pediu (offset..ate), sem passar do limite da hospedagem.
    form.set("pedaco", p.arquivo.slice(offset, Math.min(p.arquivo.size, ate > offset ? ate : offset + c.pedaco, offset + c.pedaco)));
    const r = await pedacoDoVideo(form);
    if (!r.ok) return r;
    if (r.proximo <= offset) return { ok: false, erro: "A Meta parou de aceitar o vídeo no meio." };
    offset = r.proximo;
    ate = r.ate;
    p.progresso(Math.min(99, Math.round((offset / p.arquivo.size) * 100)));
  }
  const fim = await terminarVideoDaLoja(p.clientId, p.contaMeta, c.sessao, p.arquivo.name);
  if (!fim.ok) return fim;
  let capaHash: string | null = null;
  const quadro = await quadroDoVideo(p.arquivo);
  if (quadro) {
    const form = new FormData();
    form.set("clientId", p.clientId);
    form.set("contaMeta", p.contaMeta);
    form.set("nome", p.arquivo.name);
    form.set("capa", quadro, "capa.jpg");
    const capa = await capaDoVideo(form);
    if (capa.ok) capaHash = capa.hash;
  }
  p.progresso(100);
  return { ok: true, video: { videoId: c.videoId, capaHash, nome: p.arquivo.name } };
}
