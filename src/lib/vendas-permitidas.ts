import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { ehAndrielli } from "@/lib/permissions";
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
//   Andrielli ............. todos
//   dono e gerência ....... todos

export interface QuemMarca {
  id: string;
  email: string;
  role: Role;
}

/** Quem enxerga a carteira inteira na hora de marcar. */
export function marcaParaTodos(user: QuemMarca): boolean {
  if (user.role === "ADMIN" || user.role === "GERENTE") return true;
  // A Andrielli cuida da operação de todas as lojas, não de uma carteira.
  return ehAndrielli(user.email);
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
  const base: Prisma.ClientWhereInput = {
    ...CARTEIRA,
    // Quem foi tirado do Controle de Vendas não entra: são as contas que não
    // têm "carro vendido" pra marcar (consórcio, banco). Marcar venda nelas
    // sujaria justamente o controle que o Guilherme mandou limpar.
    controlaVendas: true,
  };
  if (marcaParaTodos(user)) return base;
  return { ...base, managerId: user.id };
}
