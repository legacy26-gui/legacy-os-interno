"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { meusAlertas, rodarAlertas, marcarComoVistos } from "@/lib/alertas/robo";
import { ehODono } from "@/lib/alertas/destinatarios";

// O que a pessoa faz com um alerta.
//
// Repare no que NÃO existe aqui: "dispensar". Alerta que se apaga com clique
// vira clique automático em duas semanas, e aí a central passa a mentir —
// mostra tudo em ordem com a casa pegando fogo. O alerta só sai quando o
// problema é resolvido no sistema: a gravação entregue, a loja vendendo, a
// mensalidade recebida. O que dá pra fazer é tirar da frente até amanhã.

/** Começo do dia seguinte, em UTC. */
function amanha(hoje: Date): Date {
  return new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + 1));
}

/**
 * Confere que a chave que veio do navegador é de um alerta que é mesmo desta
 * pessoa. Sem isso, qualquer um poderia mandar chave inventada e sujar o banco
 * com linhas de alerta que não existem.
 */
async function minhaChave(chave: string): Promise<boolean> {
  const { ativos, silenciados } = await meusAlertas();
  return [...ativos, ...silenciados].some((a) => a.chave === chave);
}

/** O alerta aceita "lembrar amanhã"? No nível máximo, não. */
async function podeAdiar(chave: string): Promise<boolean> {
  const { ativos, silenciados } = await meusAlertas();
  return [...ativos, ...silenciados].some((a) => a.chave === chave && a.podeAdiar);
}

export async function lembrarAmanha(chave: string) {
  const user = await getCurrentUser();
  if (!(await minhaChave(chave))) return;
  // Esconder o botão não tranca nada: ação de servidor é chamável por quem
  // souber o nome dela. A recusa de verdade é esta.
  if (!(await podeAdiar(chave))) return;

  const ate = amanha(new Date());
  await prisma.alertaEstado.upsert({
    where: { userId_chave: { userId: user.id, chave } },
    update: { silenciadoAte: ate },
    create: { userId: user.id, chave, silenciadoAte: ate },
  });
  revalidatePath("/alertas", "layout");
}

export async function voltarAVer(chave: string) {
  const user = await getCurrentUser();
  if (!(await minhaChave(chave))) return;

  await prisma.alertaEstado.updateMany({
    where: { userId: user.id, chave },
    data: { silenciadoAte: null },
  });
  revalidatePath("/alertas", "layout");
}

/**
 * Roda o robô na hora, sem esperar o dia virar. É pro Guilherme conferir que
 * os avisos estão chegando no celular — e serve de rede: se o agendamento
 * falhar um dia, ninguém fica sem caminho pra disparar.
 *
 * Pode apertar quantas vezes quiser: o robô só avisa o que ainda não avisou.
 */
/**
 * "Eu vi" — chamado quando a pessoa abre o painel do sininho ou a tela de
 * Alertas. Tira o "novo" e cala o aviso de canto.
 *
 * Não marca nada como resolvido: o alerta continua lá, igual. Só para de se
 * apresentar como novidade.
 */
export async function marcarAlertasComoVistos() {
  const user = await getCurrentUser();
  const quantos = await marcarComoVistos(user);
  // Só redesenha se algo mudou de verdade. Na maioria das aberturas não há
  // nada novo, e aí não vale sacudir a página inteira.
  if (quantos > 0) revalidatePath("/alertas", "layout");
}

export async function rodarAgora() {
  const user = await getCurrentUser();
  // Esconder o botão não protege nada: ação de servidor pode ser chamada por
  // quem souber o nome dela. A conferência de verdade é esta.
  if (!ehODono(user)) return;
  await rodarAlertas();
  revalidatePath("/alertas", "layout");
}
