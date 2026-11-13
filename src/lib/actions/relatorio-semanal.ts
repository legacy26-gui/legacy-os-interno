"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira } from "@/lib/carteira";
import { segundaDaSemana } from "@/lib/dia-da-casa";

// "Mandei o relatório desta loja esta semana."
//
// ── Por que marcar, se o relatório já sai sozinho ─────────────────────────
//
// Porque o que sai sozinho é a IMAGEM. Quem aperta "enviar" no WhatsApp
// ainda é gente, e gente com quarenta lojas pula uma sem perceber. O erro
// não é gerar errado: é não mandar e ninguém notar até o dono cobrar.
//
// Sem este registro, descobrir qual faltou exigiria abrir quarenta conversas.
// Com ele, o Meu Dia mostra só as que faltam, e a lista zera quando acaba.
//
// ── A semana, e não o dia ─────────────────────────────────────────────────
//
// A chave é a segunda-feira da semana. Se fosse a data de hoje, o gestor que
// manda na terça marcaria um dia diferente do que mandou na segunda — a
// mesma loja contaria duas vezes e a lista nunca fecharia.

export type EnvioState = { erro?: string; ok?: boolean } | undefined;

function revalidar() {
  revalidatePath("/meu-dia");
  revalidatePath("/meta-ads/relatorio");
}

async function podeMexer(clientId: string) {
  const user = await requireModuleAccess("clientes");
  // O id vem do navegador: só se marca loja da própria carteira.
  return (await clienteEDaCarteira(user, clientId)) ? user : null;
}

/**
 * Marca que o relatório desta loja foi enviado nesta semana.
 *
 * `upsert` e não `create`: dois cliques seguidos — ou dois gestores na mesma
 * loja — não podem virar erro na cara de quem já fez o trabalho. E o
 * `update` é vazio de propósito: quem marcou primeiro continua sendo quem
 * marcou, com a hora em que marcou.
 */
export async function marcarRelatorioEnviado(clientId: string): Promise<EnvioState> {
  const user = await podeMexer(clientId);
  if (!user) return { erro: "Esta loja não está na sua carteira." };

  await prisma.relatorioEnviado.upsert({
    where: { clientId_semana: { clientId, semana: segundaDaSemana() } },
    update: {},
    create: { clientId, semana: segundaDaSemana(), quemId: user.id },
  });
  revalidar();
  return { ok: true };
}

/**
 * Desmarca, pro clique errado.
 *
 * Só a semana corrente: semana passada não se reescreve. Se alguém esqueceu
 * de marcar na semana que passou, o registro que falta já é a informação —
 * deixar reescrever o passado transformaria o histórico em opinião.
 */
export async function desmarcarRelatorioEnviado(clientId: string): Promise<EnvioState> {
  const user = await podeMexer(clientId);
  if (!user) return { erro: "Esta loja não está na sua carteira." };

  await prisma.relatorioEnviado.deleteMany({
    where: { clientId, semana: segundaDaSemana() },
  });
  revalidar();
  return { ok: true };
}
