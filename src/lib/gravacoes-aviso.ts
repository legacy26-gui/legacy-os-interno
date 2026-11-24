import "server-only";

import { prisma } from "@/lib/prisma";
import { enviarTexto } from "@/lib/whatsapp/zapi";
import { anotar } from "@/lib/whatsapp/trilha";

// "Tem vídeo novo": quando uma entrega do Igor é dada como feita, o gestor de tráfego da loja é avisado pelo WhatsApp.
// Quem chama: o botão da tela de Gravações e o "entreguei/enviei os vídeos da Vilela" do WhatsApp. Uma só regra.

const soDigitos = (s: string) => s.replace(/\D/g, "");
const primeiroNome = (n: string) => n.trim().split(/\s+/)[0];

export interface AvisoDeEntrega {
  /** Quem foi avisado ("Tatiana"). */
  avisou: string | null;
  /** Por que não avisou, quando não avisou — pra quem marcou saber. */
  motivo: "sem-gestor" | "sem-whatsapp" | "mesma-pessoa" | "falhou" | "sem-cliente" | null;
}

/**
 * Avisa o gestor da loja que a entrega saiu. Nunca estoura (falha de envio vira `motivo`).
 * `quemMarcouId`: quem deu a baixa — o gestor não é avisado do que ele mesmo marcou.
 */
export async function avisarGestorDaEntrega(
  gravacao: { clientId: string | null; loja: string; quantidade: number },
  quemMarcou: { id: string; name: string },
  messageId?: string | null,
): Promise<AvisoDeEntrega> {
  if (!gravacao.clientId) return { avisou: null, motivo: "sem-cliente" };
  const c = await prisma.client.findUnique({
    where: { id: gravacao.clientId },
    select: { companyName: true, manager: { select: { id: true, name: true, whatsapp: true, active: true } } },
  });
  const g = c?.manager;
  if (!g || !g.active) return { avisou: null, motivo: "sem-gestor" };
  if (g.id === quemMarcou.id) return { avisou: null, motivo: "mesma-pessoa" };
  if (!g.whatsapp || soDigitos(g.whatsapp).length < 10) return { avisou: null, motivo: "sem-whatsapp" };

  const q = gravacao.quantidade;
  const texto =
    `🎬 *Vídeo novo — ${c?.companyName ?? gravacao.loja}*\n` +
    `${primeiroNome(quemMarcou.name)} entregou o material da gravação (${q} ${q === 1 ? "carro" : "carros"}). ` +
    `Já dá pra subir nos anúncios. 🚗`;
  try {
    const r = await enviarTexto(soDigitos(g.whatsapp), texto);
    if (!r.ok) {
      await anotar(messageId, "gravacoes", "entrega-aviso-recusado", r.erro ?? "");
      return { avisou: null, motivo: "falhou" };
    }
    return { avisou: primeiroNome(g.name), motivo: null };
  } catch (e) {
    await anotar(messageId, "gravacoes", "entrega-aviso-estourou", e instanceof Error ? e.message : String(e));
    return { avisou: null, motivo: "falhou" };
  }
}
