"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";

// Quem entra e quem sai do Controle de Vendas.
//
// Nem todo cliente é loja de carro. Consórcio, banco e afins não têm "carro
// vendido" pra cobrar — ficavam no vermelho pra sempre e poluíam a tela, que
// existe justamente pra mostrar quem precisa de ação hoje.
//
// Tirar do controle NÃO mexe em mais nada: o cliente continua normal em
// Clientes, no faturamento, no contrato, em tudo. Some só desta tela, e volta
// com um clique na lista de fora do controle.

export async function tirarDoControleDeVendas(clientId: string) {
  await requireModuleAccess("gestao-contas");
  await prisma.client.update({ where: { id: clientId }, data: { controlaVendas: false } });
  revalidatePath("/controle-vendas");
}

export async function voltarAoControleDeVendas(clientId: string) {
  await requireModuleAccess("gestao-contas");
  await prisma.client.update({ where: { id: clientId }, data: { controlaVendas: true } });
  revalidatePath("/controle-vendas");
}
