import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { CARTEIRA } from "@/lib/carteira";

// De quais clientes cada pessoa pode marcar venda.
//
// Mora num arquivo só porque é usado em DOIS lugares que não podem discordar:
// a lista que aparece na tela pra escolher, e a conferência no servidor na
// hora de salvar. Se fossem duas regras escritas separadas, uma ia envelhecer
// sem a outra — e a que protege de verdade é a do servidor.
//
// A regra, definida pelo Guilherme:
//   gestor de tráfego ..... só os clientes dele
//   dono e gerência ....... todos (a Andrielli é Gerente)

export interface QuemMarca {
  id: string;
  email: string;
  role: Role;
}

/**
 * Quem enxerga a carteira inteira.
 *
 * A Andrielli entra aqui pelo cargo dela, que é GERENTE — e não por uma
 * exceção com o nome dela. Quem cuida da operação de todas as lojas não tem
 * carteira própria pra ser recortada.
 */
export function marcaParaTodos(user: QuemMarca): boolean {
  return user.role === "ADMIN" || user.role === "GERENTE";
}

/**
 * O filtro dos clientes que esta pessoa pode marcar.
 *
 * Vai inteiro pro `where` do Prisma, tanto pra montar a lista quanto pra
 * conferir o que chegou do navegador. Conferir com o MESMO filtro que montou a
 * lista é o que garante que não existe brecha entre o que a tela oferece e o
 * que o servidor aceita.
 */
export function filtroDeClientes(user: QuemMarca): Prisma.ClientWhereInput {
  return {
    ...CARTEIRA,
    // Quem foi tirado do Controle de Vendas não entra: são as contas que não
    // têm "carro vendido" pra marcar (consórcio, banco). Marcar venda nelas
    // sujaria justamente o controle que o Guilherme mandou limpar.
    controlaVendas: true,
    ...escopoDaCarteira(user),
  };
}

/**
 * O recorte da carteira, sozinho: vazio pra quem vê tudo, só os clientes dele
 * pro gestor de tráfego.
 *
 * Sai separado porque o Controle de Vendas precisa do mesmo recorte com outra
 * base — lá entram também as lojas TIRADAS do controle, pra existir caminho de
 * volta. Composto, e não copiado: a regra de carteira existe uma vez só.
 */
export function escopoDaCarteira(user: QuemMarca): Prisma.ClientWhereInput {
  return marcaParaTodos(user) ? {} : { managerId: user.id };
}
