"use server";

import { requireModuleAccess } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { veTodaACarteira } from "@/lib/carteira";
import { mandarRelatorioNoGrupo } from "@/lib/whatsapp/mandar-relatorio";

// Aprovar ou recusar o relatório que o robô segurou.
//
// ── Por que só quem vê a casa inteira decide ─────────────────────────────
//
// Porque a decisão é "este número pode chegar no grupo do cliente assim como
// está". Quem aprova precisa poder comparar com as outras lojas da semana —
// um custo por lead de R$ 18 é péssimo numa loja e normal em outra, e quem
// enxerga só a própria carteira não tem como saber qual é o caso.
//
// É a mesma régua de veTodaACarteira: a direção e a Andrielli. Foi pra ela
// que o Guilherme mandou a fila.
//
// ── Por que o envio acontece AQUI, no clique ─────────────────────────────
//
// Porque aprovar sem mandar deixaria a loja num limbo: marcada como aprovada
// e com o cliente sem receber nada. Se a Z-API falhar no momento do clique, a
// linha continua PENDENTE e a tela diz o erro — é chato e é certo. O
// contrário, marcar aprovado e torcer, é o defeito que a gente já viu neste
// sistema e não repete.
//
// ── Por que NÃO há revalidatePath aqui ───────────────────────────────────
//
// Porque revalidar repinta a lista do servidor, a linha decidida sai dela, e
// o componente que estava segurando a confirmação é desmontado junto. O
// resultado, visto no navegador: a pessoa clica em "aprovar", a linha some, e
// não sobra aviso nenhum na tela — indistinguível de um clique que não
// funcionou, justo na ação que manda mensagem pra cliente.
//
// Sem revalidar, a linha fica onde está e troca os botões pela confirmação.
// A lista se atualiza na próxima visita. O risco de duas pessoas decidindo a
// mesma linha ao mesmo tempo já estava coberto: a segunda recebe "este
// relatório já foi decidido por alguém" e nada acontece duas vezes.

export type AprovacaoState = { ok?: string; erro?: string };

/** A trava comum das duas ações. */
async function quemPodeDecidir() {
  const user = await requireModuleAccess("gestao-contas");
  if (!veTodaACarteira(user)) return null;
  return user;
}

/**
 * Aprova: manda o relatório no grupo do cliente, agora.
 *
 * `RelatorioEnviado` é escrito DEPOIS de sair, na mesma transação que fecha a
 * aprovação. Assim a loja some da fila do robô e da fila de aprovação ao
 * mesmo tempo, e nunca existe o estado "aprovado mas não enviado".
 */
export async function aprovarRelatorio(id: string): Promise<AprovacaoState> {
  const user = await quemPodeDecidir();
  if (!user) return { erro: "Só a direção aprova relatório." };

  const linha = await prisma.relatorioParaAprovar.findUnique({
    where: { id },
    select: {
      id: true,
      clientId: true,
      semana: true,
      estado: true,
      client: { select: { companyName: true } },
    },
  });
  if (!linha) return { erro: "Esta aprovação não existe mais." };
  if (linha.estado !== "PENDENTE") {
    return { erro: "Este relatório já foi decidido por alguém." };
  }

  const r = await mandarRelatorioNoGrupo(linha.clientId);
  if (!r.ok) return { erro: r.erro };

  await prisma.$transaction([
    prisma.relatorioParaAprovar.update({
      where: { id },
      data: {
        estado: "APROVADO",
        decididoEm: new Date(),
        decididoPorId: user.id,
      },
    }),
    prisma.relatorioEnviado.upsert({
      where: {
        clientId_semana: { clientId: linha.clientId, semana: linha.semana },
      },
      create: {
        clientId: linha.clientId,
        semana: linha.semana,
        quemId: user.id,
      },
      update: {},
    }),
  ]);

  return { ok: `Relatório da ${linha.client.companyName} mandado no grupo.` };
}

/**
 * Recusa: o relatório NÃO vai pro cliente nesta semana.
 *
 * Não apaga a linha. Recusa apagada é recusa que ninguém consegue explicar
 * depois — e a pergunta "por que a loja X não recebeu relatório naquela
 * semana?" aparece sempre, meses depois, quando ninguém lembra.
 */
export async function recusarRelatorio(
  id: string,
  observacao: string,
): Promise<AprovacaoState> {
  const user = await quemPodeDecidir();
  if (!user) return { erro: "Só a direção decide relatório." };

  const linha = await prisma.relatorioParaAprovar.findUnique({
    where: { id },
    select: { estado: true, client: { select: { companyName: true } } },
  });
  if (!linha) return { erro: "Esta aprovação não existe mais." };
  if (linha.estado !== "PENDENTE") {
    return { erro: "Este relatório já foi decidido por alguém." };
  }

  await prisma.relatorioParaAprovar.update({
    where: { id },
    data: {
      estado: "RECUSADO",
      decididoEm: new Date(),
      decididoPorId: user.id,
      observacao: observacao.trim().slice(0, 500) || null,
    },
  });

  return {
    ok: `Relatório da ${linha.client.companyName} não vai sair esta semana.`,
  };
}
