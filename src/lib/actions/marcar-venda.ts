"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { filtroDeClientes } from "@/lib/vendas-permitidas";

// Marcar venda — a tela rápida de quem está na operação.
//
// A venda também pode ser lançada pela ficha do cliente, na Gestão de Contas.
// Esta aqui existe pra o caminho ser curto: entra, escolhe a loja, põe o valor
// e pronto, sem precisar achar o cliente numa lista de todos primeiro.

const VendaSchema = z.object({
  clientId: z.string().min(1, "Escolha a loja na lista."),
  value: z.coerce.number().positive("Informe o valor da venda."),
  adSpend: z.coerce.number().min(0, "Investimento inválido."),
  soldAt: z.string().min(1, "Informe o dia da venda."),
  description: z.string().optional(),
});

export type MarcarVendaState =
  | { erro?: string; ok?: boolean; loja?: string }
  | undefined;

export async function marcarVenda(
  _anterior: MarcarVendaState,
  formData: FormData
): Promise<MarcarVendaState> {
  const user = await requireModuleAccess("gestao-contas");

  const lido = VendaSchema.safeParse({
    clientId: formData.get("clientId"),
    value: formData.get("value"),
    adSpend: formData.get("adSpend") || 0,
    soldAt: formData.get("soldAt"),
    description: formData.get("description") || undefined,
  });
  if (!lido.success) return { erro: lido.error.issues[0]?.message ?? "Dados inválidos." };

  const { clientId, soldAt, description, ...resto } = lido.data;

  // A conferência que vale.
  //
  // O id da loja vem do navegador, então limitar a lista na tela não protege
  // nada sozinho: quem souber montar a requisição manda qualquer id. É aqui
  // que a regra "cada gestor só os clientes dele" existe de verdade — e usando
  // o MESMO filtro que montou a lista, pra as duas nunca discordarem.
  const loja = await prisma.client.findFirst({
    where: { id: clientId, ...filtroDeClientes(user) },
    select: { id: true, companyName: true },
  });
  if (!loja) return { erro: "Essa loja não está na sua lista." };

  // Venda no futuro é engano de digitação, e engano em venda suja o controle
  // (a loja aparece "vendendo" sem ter vendido). Barrar é melhor que limpar
  // depois.
  const dia = new Date(`${soldAt}T00:00:00Z`);
  const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(dia.getTime())) return { erro: "Dia da venda inválido." };
  if (dia > amanha) return { erro: "Não dá pra marcar venda com data no futuro." };

  await prisma.clientSale.create({
    data: {
      ...resto,
      clientId: loja.id,
      description: description?.trim() || null,
      soldAt: dia,
      // Quem marcou. É a atribuição: a venda fica com nome.
      createdById: user.id,
    },
  });

  revalidarTelasDeVenda(loja.id);
  return { ok: true, loja: loja.companyName };
}

/**
 * Apaga uma venda que a própria pessoa marcou.
 *
 * Só a própria, e por isso o `createdById` entra no `where` do delete em vez
 * de uma conferência antes: assim não existe janela entre conferir e apagar, e
 * id de venda de outra pessoa simplesmente não encontra nada.
 *
 * Existe porque errar o valor marcando às pressas é comum, e sem desfazer a
 * pessoa teria que pedir pra alguém corrigir — ou, pior, marcar outra venda
 * por cima.
 */
export async function apagarVendaQueMarquei(saleId: string) {
  const user = await requireModuleAccess("gestao-contas");

  const venda = await prisma.clientSale.findFirst({
    where: { id: saleId, createdById: user.id },
    select: { clientId: true },
  });
  if (!venda) return;

  await prisma.clientSale.deleteMany({ where: { id: saleId, createdById: user.id } });
  revalidarTelasDeVenda(venda.clientId);
}

// Uma venda aparece em quatro telas. Mexeu numa, as quatro precisam ser
// refeitas — senão o Controle de Vendas continua mostrando a loja no vermelho
// depois de ela ter vendido.
function revalidarTelasDeVenda(clientId: string) {
  revalidatePath("/marcar-venda");
  revalidatePath("/controle-vendas");
  revalidatePath("/ranking-lojas");
  revalidatePath("/gestao-contas");
  revalidatePath(`/gestao-contas/${clientId}`);
}
