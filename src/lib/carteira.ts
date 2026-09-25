import "server-only";
import type { Prisma } from "@/generated/prisma/client";

// Quem conta como cliente da casa — a definição vale pro sistema inteiro, pra
// não acontecer de uma tela somar um cliente e a outra não.
//
// A regra, decidida pelo Guilherme:
//   - CANCELADO sai. Acabou o contrato, não é mais faturamento.
//   - PAUSADO fica. Serviço parado não é contrato encerrado, e tirar da conta
//     fazia o faturamento cair como se o cliente tivesse ido embora.
//   - IMPLANTACAO fica de fora: ainda não começou a cobrar.
//
// `billingActive` NÃO entra aqui de propósito. Ele responde outra pergunta —
// "gera a cobrança deste mês?" — e não "este cliente conta no faturamento?".
// Misturar as duas fazia tirar alguém do fluxo de cobrança apagar o cliente do
// faturamento junto, que é justamente o que a gente não quer.
export const CARTEIRA: Prisma.ClientWhereInput = {
  status: { in: ["ATIVO", "PAUSADO"] },
};

// Quem recebe cobrança mensal automática: a carteira, menos quem foi tirado do
// fluxo na mão (acordo especial, cortesia, negociação em curso).
export const CARTEIRA_COBRAVEL: Prisma.ClientWhereInput = {
  ...CARTEIRA,
  billingActive: true,
};
