import "server-only";

import { canAccessModule } from "@/lib/permissions";
import { escritaLiberada } from "@/lib/meta/escrever-na-graph";
import { tipoDeImagem } from "@/lib/meta/rascunho-anuncio";
import { enviarTexto } from "./zapi";
import { anotar } from "./trilha";
import { acharPessoaPeloNumero } from "./atender-privado";
import { registrarFoto, tratarLegendaDaFoto, TEXTO_FOTO_RECEBIDA, TEXTO_VIDEO_RECEBIDO } from "./subir-anuncio";
import { ehVideo } from "@/lib/meta/video";
import { receberMidiaDoZero } from "./campanha-do-zero-whats";

// Foto que chega no privado do robô: é o começo de "subir anúncio pelo WhatsApp".
//
// ── A ordem das travas é a parte importante (a mesma do áudio) ───────────
//
// Baixar uma imagem custa banda e guarda dado no banco. Então, ANTES de baixar nada:
//   1. quem mandou tem que ser pessoa da casa com número cadastrado e acesso a clientes;
//   2. o acesso de escrita na Meta tem que existir (senão não há o que fazer com a foto).
// Foto de número desconhecido é ignorada sem ser baixada e sem resposta.
//
// ── O que se baixa, e de onde ────────────────────────────────────────────
//
// O endereço da foto vem no corpo do webhook. É "baixar uma URL que veio de fora": só https, nada de IP ou
// nome interno, no máximo 4 MB, no máximo 20 segundos, e o conteúdo precisa SER um JPEG ou PNG de verdade
// (confere os primeiros bytes; o tipo que o remetente declara não prova nada).
//
// ── Foto do WhatsApp ─────────────────────────────────────────────────────
//
// O WhatsApp comprime a foto mandada como "foto" (costuma ficar abaixo de 1 MB e ~1.600 px) e não toca no que
// vai como "documento". Aqui só entra o que vem como foto. Pra arte do designer com qualidade total, a tela
// (Meta Ads → Subir anúncio) continua valendo.

const BYTES_MAXIMOS = 4 * 1024 * 1024;

export type DesfechoDaFoto =
  | { tipo: "ignorada"; motivo: string }
  | { tipo: "falhou"; erro: string }
  | { tipo: "guardada"; avisou: boolean; total: number };

/** O endereço é seguro pra baixar? (Em teste, FOTO_PERMITE_LOCAL=1 libera o http local.) */
export function urlDeFotoSegura(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (process.env.FOTO_PERMITE_LOCAL === "1" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return true;
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":") || h.startsWith("[")) return false;
  return h.includes(".");
}

async function baixar(url: string): Promise<{ ok: true; bytes: Buffer } | { ok: false; erro: string }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "error" });
    if (!r.ok) return { ok: false, erro: `não consegui baixar a foto (${r.status})` };
    const declarado = Number(r.headers.get("content-length") ?? 0);
    if (declarado > BYTES_MAXIMOS) return { ok: false, erro: "a foto passou de 4 MB" };
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length === 0) return { ok: false, erro: "a foto veio vazia" };
    if (bytes.length > BYTES_MAXIMOS) return { ok: false, erro: "a foto passou de 4 MB" };
    return { ok: true, bytes };
  } catch {
    return { ok: false, erro: "não consegui baixar a foto" };
  }
}

export async function receberFotoNoPrivado(a: {
  telefone: string;
  imageUrl: string;
  /** O texto que veio junto da foto, se veio. Vale como a mensagem da pessoa. */
  legenda?: string | null;
  messageId?: string | null;
  /** Quando a pessoa mandou (ms, da Z-API). */
  momento?: number | null;
}): Promise<DesfechoDaFoto> {
  const ponta = `privado …${a.telefone.replace(/\D/g, "").slice(-4)}`;
  const pessoa = await acharPessoaPeloNumero(a.telefone);
  if (!pessoa || !canAccessModule(pessoa.role, "clientes", pessoa.email)) {
    await anotar(a.messageId, ponta, "foto-ignorada", pessoa ? "sem acesso a clientes" : "número não reconhecido");
    return { tipo: "ignorada", motivo: pessoa ? "sem-acesso" : "desconhecido" };
  }

  const responder = async (texto: string) => {
    const r = await enviarTexto(a.telefone, texto);
    if (!r.ok) await anotar(a.messageId, ponta, "foto-resposta-recusada", r.erro ?? "");
  };

  if (!escritaLiberada()) {
    await anotar(a.messageId, ponta, "foto-sem-escrita");
    await responder("Recebi a foto, mas ainda não consigo subir anúncio: o acesso de escrita na Meta não está configurado no sistema.");
    return { tipo: "falhou", erro: "sem-escrita" };
  }
  if (!urlDeFotoSegura(a.imageUrl)) {
    await anotar(a.messageId, ponta, "foto-url-insegura");
    return { tipo: "ignorada", motivo: "url" };
  }
  if (!a.messageId) {
    await anotar(a.messageId, ponta, "foto-sem-id");
    return { tipo: "ignorada", motivo: "sem-id" };
  }

  const baixada = await baixar(a.imageUrl);
  if (!baixada.ok) {
    await anotar(a.messageId, ponta, "foto-nao-baixou", baixada.erro);
    await responder(`📷 ${baixada.erro[0].toUpperCase()}${baixada.erro.slice(1)}. Manda de novo (como foto, não como arquivo).`);
    return { tipo: "falhou", erro: baixada.erro };
  }
  const tipo = tipoDeImagem(baixada.bytes);
  if (!tipo) {
    await anotar(a.messageId, ponta, "foto-formato");
    await responder("📷 Só aceito foto em JPEG ou PNG. Manda de novo como foto.");
    return { tipo: "falhou", erro: "formato" };
  }

  // Campanha do zero aberta: a foto é ARTE de um carro (pelo nome na legenda), não foto de "subir anúncio".
  const doZero = await receberMidiaDoZero(pessoa, { tipo: "foto", bytes: baixada.bytes, legenda: a.legenda ?? null });
  if (doZero !== null) {
    await responder(doZero);
    return { tipo: "guardada", avisou: true, total: 1 };
  }

  const quando = a.momento && Number.isFinite(a.momento) ? new Date(a.momento) : new Date();
  const r = await registrarFoto(pessoa, { messageId: a.messageId, mime: tipo === "png" ? "image/png" : "image/jpeg", bytes: baixada.bytes, quando });
  if (r.cheio) {
    await responder("📷 Já tenho 10 fotos, que é o máximo do carrossel. Escreve a loja e o carro pra eu continuar, ou *cancela*.");
    return { tipo: "falhou", erro: "cheio" };
  }
  if (r.repetida) return { tipo: "ignorada", motivo: "repetida" };
  await anotar(a.messageId, ponta, "foto-guardada", `${r.total} foto(s)`);

  if (r.avisar && !(a.legenda ?? "").trim()) await responder(TEXTO_FOTO_RECEBIDA);

  // Foto com legenda escrita: a legenda é a mensagem da pessoa ("virtus 2021 r2").
  const legenda = (a.legenda ?? "").trim();
  if (legenda) {
    const resposta = await tratarLegendaDaFoto(pessoa, legenda);
    if (resposta) await responder(resposta);
    else if (r.avisar) await responder(TEXTO_FOTO_RECEBIDA);
  }
  return { tipo: "guardada", avisou: r.avisar, total: r.total };
}

// ───────────────────────────── Vídeo no privado ─────────────────────────────
//
// Mesmas travas da foto (pessoa da casa, escrita na Meta, endereço seguro), antes de baixar. Até VIDEO_MAXIMO (o WhatsApp
// manda vídeo comprimido, normalmente bem menos). Precisa SER MP4/MOV de verdade (primeiros bytes). Fica guardado até o
// "sim": aí sobe pra conta do conjunto e o anúncio sai de vídeo (ver executar em subir-anuncio.ts).

const VIDEO_MAXIMO = 64 * 1024 * 1024;

async function baixarVideo(url: string): Promise<{ ok: true; bytes: Buffer } | { ok: false; erro: string }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: "error" });
    if (!r.ok) return { ok: false, erro: `não consegui baixar o vídeo (${r.status})` };
    if (Number(r.headers.get("content-length") ?? 0) > VIDEO_MAXIMO) return { ok: false, erro: "o vídeo passou de 64 MB" };
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length === 0) return { ok: false, erro: "o vídeo veio vazio" };
    if (bytes.length > VIDEO_MAXIMO) return { ok: false, erro: "o vídeo passou de 64 MB" };
    return { ok: true, bytes };
  } catch {
    return { ok: false, erro: "não consegui baixar o vídeo" };
  }
}

export async function receberVideoNoPrivado(a: {
  telefone: string;
  videoUrl: string;
  legenda?: string | null;
  messageId?: string | null;
  momento?: number | null;
}): Promise<DesfechoDaFoto> {
  const ponta = `privado …${a.telefone.replace(/\D/g, "").slice(-4)}`;
  const pessoa = await acharPessoaPeloNumero(a.telefone);
  if (!pessoa || !canAccessModule(pessoa.role, "clientes", pessoa.email)) {
    await anotar(a.messageId, ponta, "video-ignorado", pessoa ? "sem acesso a clientes" : "número não reconhecido");
    return { tipo: "ignorada", motivo: pessoa ? "sem-acesso" : "desconhecido" };
  }
  const responder = async (texto: string) => {
    const r = await enviarTexto(a.telefone, texto);
    if (!r.ok) await anotar(a.messageId, ponta, "video-resposta-recusada", r.erro ?? "");
  };
  if (!escritaLiberada()) {
    await responder("Recebi o vídeo, mas ainda não consigo subir anúncio: o acesso de escrita na Meta não está configurado no sistema.");
    return { tipo: "falhou", erro: "sem-escrita" };
  }
  if (!urlDeFotoSegura(a.videoUrl) || !a.messageId) {
    await anotar(a.messageId, ponta, "video-url-insegura");
    return { tipo: "ignorada", motivo: "url" };
  }
  const baixado = await baixarVideo(a.videoUrl);
  if (!baixado.ok) {
    await anotar(a.messageId, ponta, "video-nao-baixou", baixado.erro);
    await responder(`🎬 ${baixado.erro[0].toUpperCase()}${baixado.erro.slice(1)}. Manda de novo.`);
    return { tipo: "falhou", erro: baixado.erro };
  }
  if (!ehVideo(baixado.bytes)) {
    await responder("🎬 Só aceito vídeo MP4 (o normal do celular). Manda de novo.");
    return { tipo: "falhou", erro: "formato" };
  }
  const doZero = await receberMidiaDoZero(pessoa, { tipo: "video", bytes: baixado.bytes, legenda: a.legenda ?? null });
  if (doZero !== null) {
    await responder(doZero);
    return { tipo: "guardada", avisou: true, total: 1 };
  }
  const quando = a.momento && Number.isFinite(a.momento) ? new Date(a.momento) : new Date();
  const r = await registrarFoto(pessoa, { messageId: a.messageId, mime: "video/mp4", bytes: baixado.bytes, quando });
  if (r.repetida) return { tipo: "ignorada", motivo: "repetida" };
  await anotar(a.messageId, ponta, "video-guardado", `${Math.round(baixado.bytes.length / 1024)} KB`);
  const legenda = (a.legenda ?? "").trim();
  if (legenda) {
    const resposta = await tratarLegendaDaFoto(pessoa, legenda);
    await responder(resposta ?? TEXTO_VIDEO_RECEBIDO);
  } else await responder(TEXTO_VIDEO_RECEBIDO);
  return { tipo: "guardada", avisou: true, total: r.total };
}
