import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

// Aviso no celular usando o próprio app que a equipe já instalou (PWA). Não
// depende de serviço pago nem de terceiro: o navegador entrega, o sistema
// operacional mostra na tela de bloqueio. Só precisa do par de chaves VAPID,
// que é gerado uma vez e fica nas variáveis de ambiente.

export interface AvisoPush {
  titulo: string;
  corpo: string;
  url?: string;
  tag?: string;
}

export function pushConfigurado() {
  return !!(process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim());
}

export function chavePublicaPush() {
  return process.env.VAPID_PUBLIC_KEY?.trim() ?? null;
}

function configurar() {
  webpush.setVapidDetails(
    // O padrão exige um contato do dono do serviço. Só é usado se a operadora
    // de push precisar falar com a gente.
    process.env.VAPID_SUBJECT?.trim() || "mailto:contato@legacydigital.com",
    process.env.VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim()
  );
}

/**
 * Manda o aviso pra todo mundo inscrito. Nunca lança: notificação que falha não
 * pode derrubar quem chamou — o lead já está salvo, e ficar sem aviso é ruim,
 * mas perder a requisição é pior.
 *
 * Devolve quantos aparelhos receberam.
 */
export async function avisarTodos(aviso: AvisoPush): Promise<number> {
  if (!pushConfigurado()) {
    console.warn("[push] sem VAPID configurado — aviso não enviado:", aviso.titulo);
    return 0;
  }

  const inscritos = await prisma.pushSubscription.findMany();
  if (inscritos.length === 0) {
    console.warn("[push] ninguém inscrito pra receber aviso ainda");
    return 0;
  }

  configurar();
  const carga = JSON.stringify(aviso);
  let entregues = 0;

  await Promise.all(
    inscritos.map(async (i) => {
      try {
        await webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          carga,
          { TTL: 12 * 60 * 60 } // 12h: lead de madrugada ainda vale de manhã
        );
        entregues++;
      } catch (erro) {
        const status = (erro as { statusCode?: number }).statusCode;
        // 404/410 = a pessoa desinstalou o app ou revogou a permissão. A
        // inscrição morreu; guardar não serve pra nada e só gera erro de novo.
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: i.id } }).catch(() => {});
        } else {
          console.error(`[push] falha ao avisar (${status ?? "sem status"})`, erro);
        }
      }
    })
  );

  return entregues;
}
