import "server-only";
import type { Prisma } from "@/generated/prisma/client";

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
