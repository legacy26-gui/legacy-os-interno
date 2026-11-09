import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import type { Empresa } from "@/generated/prisma/enums";

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
 * Manda o aviso pro celular de quem trabalha naquela empresa. Nunca lança:
 * notificação que falha não pode derrubar quem chamou — o lead já está salvo,
 * e ficar sem aviso é ruim, mas perder a requisição é pior.
 *
 * O filtro por empresa não é detalhe: o aviso de lead traz o nome da loja e do
 * contato. Sem ele, o sócio de uma empresa receberia no celular o lead da
 * outra — um vazamento que nenhuma tranca de tela pegaria, porque não passa
 * por tela nenhuma.
 *
 * `empresa` nulo manda pra todo mundo, e é só pro teste de configuração do
 * push, que não carrega dado de ninguém.
 *
 * Devolve quantos aparelhos receberam.
 */
export async function avisarEmpresa(
  empresa: Empresa | null,
  aviso: AvisoPush
): Promise<number> {
  if (!pushConfigurado()) {
    console.warn("[push] sem VAPID configurado — aviso não enviado:", aviso.titulo);
    return 0;
  }

  const inscritos = await prisma.pushSubscription.findMany({
    where: empresa ? { user: { active: true, empresas: { has: empresa } } } : undefined,
  });
  return entregar(inscritos, aviso);
}

/**
 * Manda o aviso pro celular de pessoas específicas.
 *
 * Existe porque alerta tem dono: a gravação atrasada é problema da Andrielli,
 * a mensalidade vencida é do Guilherme. Mandar pra empresa inteira faria cada
 * um receber o aviso dos outros, e aviso que não é meu eu aprendo a ignorar —
 * junto com o que era meu.
 *
 * Quem decide se o alerta é da pessoa é src/lib/alertas/destinatarios.ts, e
 * esta função não repete essa conferência: ela só entrega pra lista que
 * recebeu. Por isso nunca se chama ela com uma lista vinda da tela.
 */
export async function avisarPessoas(userIds: string[], aviso: AvisoPush): Promise<number> {
  if (!pushConfigurado()) {
    console.warn("[push] sem VAPID configurado — aviso não enviado:", aviso.titulo);
    return 0;
  }
  if (userIds.length === 0) return 0;

  const inscritos = await prisma.pushSubscription.findMany({
    // active no filtro: quem foi desativado não recebe nem que a inscrição
    // dele ainda esteja gravada.
    where: { userId: { in: userIds }, user: { active: true } },
  });
  return entregar(inscritos, aviso);
}

type Inscricao = { id: string; endpoint: string; p256dh: string; auth: string };

async function entregar(inscritos: Inscricao[], aviso: AvisoPush): Promise<number> {
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
