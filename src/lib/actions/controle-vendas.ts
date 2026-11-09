"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { marcaParaTodos } from "@/lib/vendas-permitidas";

// Quem entra e quem sai do Controle de Vendas.
//
// Nem todo cliente é loja de carro. Consórcio, banco e afins não têm "carro
// vendido" pra cobrar — ficavam no vermelho pra sempre e poluíam a tela, que
// existe justamente pra mostrar quem precisa de ação hoje.
//
// Tirar do controle NÃO mexe em mais nada: o cliente continua normal em
// Clientes, no faturamento, no contrato, em tudo. Some só desta tela, e volta
// com um clique na lista de fora do controle.

// Quem entra e sai do controle é decisão de quem enxerga a casa inteira.
//
// Gestor de tráfego vê só a carteira dele nesta tela — e justamente por isso
// não pode tirar loja do controle: tirar a própria loja vermelha faria ela
// sumir do controle do dono, e o problema desapareceria da tela de quem
// precisa vê-lo. Esconder não é resolver.
async function exigirVisaoDaCasa() {
  const user = await requireModuleAccess("gestao-contas");
  return marcaParaTodos(user) ? user : null;
}

export async function tirarDoControleDeVendas(clientId: string) {
  if (!(await exigirVisaoDaCasa())) return;
  await prisma.client.update({ where: { id: clientId }, data: { controlaVendas: false } });
  revalidatePath("/controle-vendas");
  revalidatePath("/ranking-lojas");
  revalidatePath("/marcar-venda");
}

export async function voltarAoControleDeVendas(clientId: string) {
  if (!(await exigirVisaoDaCasa())) return;
  await prisma.client.update({ where: { id: clientId }, data: { controlaVendas: true } });
  revalidatePath("/controle-vendas");
  revalidatePath("/ranking-lojas");
  revalidatePath("/marcar-venda");
}
