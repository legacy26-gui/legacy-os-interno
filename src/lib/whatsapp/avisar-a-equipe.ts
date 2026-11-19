import "server-only";

import { prisma } from "@/lib/prisma";
import { enviarTexto } from "./zapi";

// Falar com a equipe no privado, sem passar pelo grupo do cliente.
//
// ── Por que isto precisou existir ────────────────────────────────────────
//
// Pedido do Guilherme: quando avisam no grupo que um carro foi vendido e
// esse carro NÃO está anunciado, o robô não deve ficar discutindo no grupo
// do cliente — deve avisar a equipe no privado.
//
// A razão é boa. "Não achei esse carro nos anúncios" é um problema NOSSO: ou
// o carro nunca foi anunciado, ou o anúncio tem outro nome, ou já tinha sido
// pausado. Nenhuma dessas três o dono da loja precisa resolver, e ler isso no
// grupo dele só passa a impressão de que o sistema não sabe o que está
// fazendo.
//
// ── Quem é "a equipe" ────────────────────────────────────────────────────
//
// O gestor DAQUELA loja, que é quem cuida dela. Se ele não tiver WhatsApp
// cadastrado, ou se a loja não tiver gestor, a mensagem vai pra direção —
// porque um aviso que não chega a ninguém é pior que aviso nenhum: ele cria
// a sensação de que alguém foi avisado.

export interface AvisoAEquipe {
  mandados: number;
  /** Verdadeiro quando ninguém da casa tem número cadastrado. */
  semNinguem: boolean;
}

/**
 * Manda um recado no privado de quem cuida desta loja.
 *
 * Nunca estoura: um aviso que falha não pode derrubar o atendimento que
 * estava acontecendo. O pior caso é a equipe não saber — que é exatamente o
 * caso de antes desta função existir.
 */
export async function avisarAEquipeDaLoja(
  clientId: string,
  texto: string,
): Promise<AvisoAEquipe> {
  try {
    const loja = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        manager: { select: { id: true, whatsapp: true, active: true } },
      },
    });

    const gestor = loja?.manager;
    const destinos: string[] = [];

    if (gestor?.whatsapp && gestor.active) {
      destinos.push(gestor.whatsapp);
    } else {
      // Sem gestor com número, sobe pra direção. Quem vê a casa inteira é
      // quem consegue resolver uma loja que não é de ninguém.
      const direcao = await prisma.user.findMany({
        where: {
          active: true,
          whatsapp: { not: null },
          role: { in: ["ADMIN", "GERENTE"] },
        },
        select: { whatsapp: true },
      });
      for (const d of direcao) if (d.whatsapp) destinos.push(d.whatsapp);
    }

    if (destinos.length === 0) return { mandados: 0, semNinguem: true };

    let mandados = 0;
    for (const numero of destinos) {
      const r = await enviarTexto(numero, texto);
      if (r.ok) mandados++;
    }
    return { mandados, semNinguem: false };
  } catch {
    // Ver acima.
    return { mandados: 0, semNinguem: false };
  }
}
