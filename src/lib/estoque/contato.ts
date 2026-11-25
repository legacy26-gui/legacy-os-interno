import "server-only";
import { prisma } from "@/lib/prisma";
import { origemDoSite, urlDeSiteSegura, USER_AGENT_DO_ESTOQUE } from "@/lib/estoque/ler-estoque";
import { lerContatoDoHtml, rodapeSugerido } from "@/lib/estoque/contato-puro";

// O rodapé da legenda (endereço e WhatsApp da loja). Ordem: o que a pessoa já conferiu e salvou; senão, o que o site diz.

/** Lê a página inicial do site da loja e sugere o rodapé. "" se não deu. */
export async function rodapeDoSite(siteUrl: string): Promise<string> {
  const origem = origemDoSite(siteUrl);
  if (!origem || !urlDeSiteSegura(origem)) return "";
  try {
    const r = await fetch(origem, { headers: { "User-Agent": USER_AGENT_DO_ESTOQUE, Accept: "text/html" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!r.ok) return "";
    const html = (await r.text()).slice(0, 3_000_000);
    return rodapeSugerido(lerContatoDoHtml(html));
  } catch {
    return "";
  }
}

/** O rodapé da loja: o salvo, ou o sugerido pelo site (sem salvar — só vale depois que a pessoa usa). */
export async function rodapeDaLoja(clientId: string): Promise<{ rodape: string; doSite: boolean }> {
  const e = await prisma.estoqueDaLoja.findUnique({ where: { clientId }, select: { rodapeDaLegenda: true, siteUrl: true } });
  if (e?.rodapeDaLegenda?.trim()) return { rodape: e.rodapeDaLegenda, doSite: false };
  if (!e?.siteUrl) return { rodape: "", doSite: false };
  return { rodape: await rodapeDoSite(e.siteUrl), doSite: true };
}

/** Guarda o rodapé que a pessoa conferiu (vale pras próximas legendas da loja, inclusive o "anunciar agora"). */
export async function salvarRodape(clientId: string, rodape: string): Promise<void> {
  await prisma.estoqueDaLoja.updateMany({ where: { clientId }, data: { rodapeDaLegenda: rodape.trim().slice(0, 600) || null } });
}
