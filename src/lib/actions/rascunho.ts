"use server";

import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira } from "@/lib/carteira";
import { escritaLiberada } from "@/lib/meta/escrever-na-graph";
import {
  subirRascunho,
  contaDoConjunto,
  lerBaseDoAnuncio,
  subirFotoDoRascunho,
  type AvisoDoConjunto,
} from "@/lib/meta/rascunho-anuncio";
import { gerarLegendaDoCarro } from "@/lib/meta/legenda-do-rascunho";

// Subir anúncio como rascunho — as ações que a tela chama.
//
// Toda ação confere duas coisas antes de qualquer outra: quem pede pode mexer em clientes, e a loja é da
// carteira dele (o gestor só sobe anúncio nas lojas dele). O id da loja vem do navegador, então a conferência
// é feita aqui no servidor, nunca confiada à tela.
//
// Nenhuma ação daqui lança erro pra tela: devolve uma frase. E nenhuma devolve token.

export interface RespostaDaBase {
  ok: boolean;
  erro?: string;
  formato?: "foto" | "carrossel";
  legenda?: string;
  titulo?: string;
  link?: string;
}

export interface RespostaDoRascunho {
  ok: boolean;
  erro?: string;
  adId?: string;
  formato?: "foto" | "carrossel" | "video";
  avisos?: AvisoDoConjunto[];
  linkDoGerenciador?: string;
  /** Conjunto criado nesta tentativa (mesmo se o anúncio falhou): a próxima tentativa sobe nele. */
  adsetCriado?: { adsetId: string; nome: string } | null;
}

async function podeNaLoja(clientId: string) {
  const user = await requireModuleAccess("clientes");
  if (typeof clientId !== "string" || !clientId) return null;
  if (!(await clienteEDaCarteira(user, clientId))) return null;
  return user;
}

async function semQuebrar<T extends { ok: boolean; erro?: string }>(fazer: () => Promise<T>, padrao: T): Promise<T> {
  try {
    return await fazer();
  } catch (erro) {
    const digest = (erro as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw erro;
    console.error("[rascunho] a ação falhou", erro);
    return { ...padrao, ok: false, erro: `Deu erro no servidor: ${(erro instanceof Error ? erro.message : String(erro)).slice(0, 200)}` };
  }
}

/** O anúncio escolhido como base: dá pra duplicar? Devolve a legenda, o título e o link dele pra tela preencher. */
export async function conferirAnuncioBase(clientId: string, baseAdId: string): Promise<RespostaDaBase> {
  return semQuebrar<RespostaDaBase>(async () => {
    if (!(await podeNaLoja(clientId))) return { ok: false, erro: "Esta loja não está na sua carteira." };
    const r = await lerBaseDoAnuncio(clientId, String(baseAdId));
    if (!r.ok) return { ok: false, erro: r.erro };
    return { ok: true, formato: r.base.formato, legenda: r.base.legenda, titulo: r.base.titulo, link: r.base.link };
  }, { ok: false });
}

/** Sobe UMA foto (já reduzida pelo navegador). Devolve o código dela na Meta. */
export async function subirFoto(formData: FormData): Promise<{ ok: boolean; erro?: string; hash?: string }> {
  return semQuebrar<{ ok: boolean; erro?: string; hash?: string }>(async () => {
    const clientId = String(formData.get("clientId") ?? "");
    const adsetId = String(formData.get("adsetId") ?? "");
    const arquivo = formData.get("foto");
    if (!(await podeNaLoja(clientId))) return { ok: false, erro: "Esta loja não está na sua carteira." };
    if (!(arquivo instanceof File)) return { ok: false, erro: "Não veio foto." };
    const r = await subirFotoDoRascunho({
      clientId,
      adsetId,
      nome: arquivo.name || "foto.jpg",
      bytes: Buffer.from(await arquivo.arrayBuffer()),
    });
    return r.ok ? { ok: true, hash: r.hash } : { ok: false, erro: r.erro };
  }, { ok: false });
}

/** A conta de anúncio do conjunto (o vídeo sobe nela antes de criar o anúncio). */
export async function contaDoConjuntoParaVideo(clientId: string, adsetId: string): Promise<{ ok: boolean; erro?: string; conta?: string }> {
  return semQuebrar<{ ok: boolean; erro?: string; conta?: string }>(async () => {
    if (!(await podeNaLoja(clientId))) return { ok: false, erro: "Esta loja não está na sua carteira." };
    const c = await contaDoConjunto(clientId, String(adsetId ?? ""));
    return c ? { ok: true, conta: c.contaMeta } : { ok: false, erro: "Esse conjunto não é de uma conta desta loja." };
  }, { ok: false });
}

/** Cria o anúncio PAUSADO, duplicando o base, com as fotos já enviadas. */
export async function criarRascunho(entrada: {
  clientId: string;
  baseAdId: string;
  adsetId: string;
  nome: string;
  legenda: string;
  titulo: string;
  link: string;
  hashes: string[];
  /** Vídeo (já na conta do conjunto) no lugar das fotos. */
  video?: { videoId: string; capaHash?: string | null } | null;
  /** Duplicar o conjunto (adsetId é o molde) com este nome e orçamento diário (centavos, ou null = o do molde). */
  conjuntoNovo?: { nome: string; orcamentoCents: number | null; jaCriadoId?: string | null } | null;
}): Promise<RespostaDoRascunho> {
  return semQuebrar<RespostaDoRascunho>(async () => {
    const user = await podeNaLoja(entrada.clientId);
    if (!user) return { ok: false, erro: "Esta loja não está na sua carteira." };
    if (!escritaLiberada()) return { ok: false, erro: "O acesso de escrita na Meta ainda não está configurado no sistema." };

    const novo = entrada.conjuntoNovo;
    const r = await subirRascunho({
      clientId: entrada.clientId,
      baseAdId: String(entrada.baseAdId),
      adsetId: String(entrada.adsetId),
      nome: String(entrada.nome ?? ""),
      legenda: String(entrada.legenda ?? ""),
      titulo: typeof entrada.titulo === "string" ? entrada.titulo : null,
      link: String(entrada.link ?? ""),
      hashes: Array.isArray(entrada.hashes) ? entrada.hashes.map(String) : [],
      video: entrada.video?.videoId ? { videoId: String(entrada.video.videoId), capaHash: entrada.video.capaHash ? String(entrada.video.capaHash) : null } : null,
      pedidoPor: user.name,
      quemId: user.id,
      conjuntoNovo:
        novo && typeof novo.nome === "string"
          ? {
              nome: novo.nome,
              orcamentoCents: typeof novo.orcamentoCents === "number" && Number.isFinite(novo.orcamentoCents) ? Math.round(novo.orcamentoCents) : null,
              jaCriadoId: typeof novo.jaCriadoId === "string" ? novo.jaCriadoId : null,
            }
          : null,
    });
    if (!r.ok) return { ok: false, erro: r.erro, avisos: r.avisos, adsetCriado: r.adsetCriado ?? null };

    revalidatePath(`/meta-ads/${entrada.clientId}/subir-anuncio`);
    return { ok: true, adId: r.adId, formato: r.formato, avisos: r.avisos, linkDoGerenciador: r.linkDoGerenciador };
  }, { ok: false });
}

/** Pede à IA a legenda do carro, na voz da loja. O resultado vai pra um campo editável: quem sobe é a pessoa. */
export async function gerarLegenda(
  clientId: string,
  dadosDoCarro: string,
  legendaDoBase: string,
): Promise<{ ok: boolean; erro?: string; legenda?: string; avisos?: string[] }> {
  return semQuebrar<{ ok: boolean; erro?: string; legenda?: string; avisos?: string[] }>(async () => {
    if (!(await podeNaLoja(clientId))) return { ok: false, erro: "Esta loja não está na sua carteira." };
    const r = await gerarLegendaDoCarro({
      clientId,
      dadosDoCarro: String(dadosDoCarro ?? ""),
      legendaDoBase: String(legendaDoBase ?? ""),
    });
    return r.ok ? { ok: true, legenda: r.dados.legenda, avisos: r.dados.avisos } : { ok: false, erro: r.erro };
  }, { ok: false });
}
