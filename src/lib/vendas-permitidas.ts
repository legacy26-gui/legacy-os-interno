import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { CARTEIRA, escopoDaCarteira, type PessoaDaCasa } from "@/lib/carteira";

// De quais clientes cada pessoa pode marcar venda.
//
// É o recorte geral da carteira (src/lib/carteira.ts) mais duas condições que
// só valem pra venda. Composto, não copiado: quem muda a regra de "de quem é
// esse cliente" muda num lugar só, e esta tela acompanha.

/**
 * O filtro dos clientes que esta pessoa pode marcar.
 *
 * Vai inteiro pro `where` do Prisma, tanto pra montar a lista quanto pra
 * conferir o que chegou do navegador. Conferir com o MESMO filtro que montou a
 * lista é o que garante que não existe brecha entre o que a tela oferece e o
 * que o servidor aceita.
 */
export function filtroDeClientes(user: PessoaDaCasa): Prisma.ClientWhereInput {
  return {
    ...CARTEIRA,
    // Quem foi tirado do Controle de Vendas não entra: são as contas que não
    // têm "carro vendido" pra marcar (consórcio, banco). Marcar venda nelas
    // sujaria justamente o controle que o Guilherme mandou limpar.
    controlaVendas: true,
    ...escopoDaCarteira(user),
  };
}
