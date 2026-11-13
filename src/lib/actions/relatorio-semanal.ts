"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira } from "@/lib/carteira";
import { segundaDaSemana } from "@/lib/dia-da-casa";
import { mandarRelatorioNoGrupo } from "@/lib/whatsapp/mandar-relatorio";

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

/**
 * Manda o relatório no grupo da loja e, se sair, marca como enviado.
 *
 * ── A ordem importa, e é esta ─────────────────────────────────────────────
 *
 * Manda primeiro, marca depois. Nunca o contrário.
 *
 * Marcar antes seria mais fácil de escrever e criaria o pior defeito
 * possível: a Z-API fora do ar, o cliente sem receber nada, e a tela dizendo
 * "enviado" pra todo mundo. Ninguém descobriria até o dono da loja cobrar o
 * relatório que o sistema jura ter mandado.
 *
 * Do jeito certo o pior caso é o oposto, e é muito melhor: a mensagem sai, a
 * marcação falha, e a loja continua aparecendo como pendente. Alguém manda de
 * novo e o grupo recebe duas vezes — chato, visível, sem dano.
 */
export async function enviarRelatorioPeloWhatsapp(clientId: string): Promise<EnvioState> {
  const user = await podeMexer(clientId);
  if (!user) return { erro: "Esta loja não está na sua carteira." };

  const r = await mandarRelatorioNoGrupo(clientId);
  if (!r.ok) return { erro: r.erro };

  await prisma.relatorioEnviado.upsert({
    where: { clientId_semana: { clientId, semana: segundaDaSemana() } },
    update: {},
    create: { clientId, semana: segundaDaSemana(), quemId: user.id },
  });
  revalidar();
  return { ok: true };
}
