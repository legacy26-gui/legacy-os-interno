import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";

// Quem conta como cliente da casa — a definição vale pro sistema inteiro, pra
// não acontecer de uma tela somar um cliente e a outra não.
//
// A regra, decidida pelo Guilherme:
//   - CANCELADO sai. Acabou o contrato, não é mais faturamento.
//   - PAUSADO fica. Serviço parado não é contrato encerrado, e tirar da conta
//     fazia o faturamento cair como se o cliente tivesse ido embora.
//   - IMPLANTACAO fica. Contrato assinado é receita contratada: o cliente já
//     conta no MRR desde que entra, não a partir do dia em que a operação
//     engrena.
//
// Tirar da cobrança não entra aqui de propósito: é decisão de UM mês, não do
// cliente. Misturar as duas fazia pular a cobrança de um mês apagar o cliente
// do faturamento pra sempre.
export const CARTEIRA: Prisma.ClientWhereInput = {
  status: { in: ["ATIVO", "PAUSADO", "IMPLANTACAO"] },
};

// Quem recebe cobrança mensal é a carteira inteira. Quem foi pulado num mês
// específico sai pela tabela cobrancas_puladas, que depende do mês — por isso
// não dá pra filtrar aqui.
export const CARTEIRA_COBRAVEL = CARTEIRA;

// ─────────────────────── De quem é cada cliente ────────────────────────────
//
// "Cada um só vê o seu": gestor de tráfego enxerga os clientes sob a gestão
// dele; gerência e dono enxergam a casa inteira.
//
// Mora aqui, junto da definição de quem CONTA como cliente, porque é a mesma
// família de pergunta — e porque precisa valer em toda tela que mostra
// cliente: a lista, a ficha, a gestão de conta, o ranking e as ações que
// gravam. Regra de acesso copiada em sete lugares vira sete regras diferentes
// em seis meses.

export interface PessoaDaCasa {
  id: string;
  role: Role;
}

/** Quem enxerga a carteira inteira. A Andrielli entra aqui como Gerente. */
export function veTodaACarteira(user: PessoaDaCasa): boolean {
  return user.role === "ADMIN" || user.role === "GERENTE";
}

/**
 * O recorte pra entrar em qualquer `where` do Prisma: vazio pra quem vê tudo,
 * `managerId` pro gestor de tráfego.
 *
 * Composto com o filtro de cada tela, nunca copiado.
 */
export function escopoDaCarteira(user: PessoaDaCasa): Prisma.ClientWhereInput {
  return veTodaACarteira(user) ? {} : { managerId: user.id };
}

/**
 * Abre a ficha de um cliente — e só devolve se ele for desta pessoa.
 *
 * Esta é a trava que importa de verdade. Filtrar a LISTA não protege nada:
 * quem tiver o endereço de um cliente de outro gestor chega na ficha dele
 * digitando. Por isso o id e o recorte vão juntos na mesma consulta.
 *
 * Devolve 404 e não "acesso negado" de propósito: "acesso negado" confirma
 * que aquele cliente existe, e isso já é informação que não é dela.
 */
export async function exigirClienteDaCarteira<S extends Prisma.ClientSelect>(
  user: PessoaDaCasa,
  clientId: string,
  select: S
) {
  const cliente = await prisma.client.findFirst({
    where: { id: clientId, ...escopoDaCarteira(user) },
    select,
  });
  if (!cliente) notFound();
  return cliente;
}

/**
 * A mesma trava pras ações que GRAVAM (editar, apagar, anexar).
 *
 * Devolve falso em vez de 404 porque ação não renderiza página: quem chama
 * decide se volta erro ou se simplesmente não faz nada.
 */
export async function clienteEDaCarteira(user: PessoaDaCasa, clientId: string): Promise<boolean> {
  const achou = await prisma.client.findFirst({
    where: { id: clientId, ...escopoDaCarteira(user) },
    select: { id: true },
  });
  return !!achou;
}
