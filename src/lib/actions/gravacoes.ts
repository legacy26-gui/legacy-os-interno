"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { empresaAtual } from "@/lib/empresa-atual";
import { diaDaEntrega } from "@/lib/gravacoes";

// Gravação de vídeo: quem foi gravado, a que hora e quantos vídeos saíram.
//
// O prazo da casa é D+1: gravou hoje, entrega amanhã. A regra mora em
// @/lib/gravacoes, num lugar só — se um dia virar D+2, muda ali. Fica fora
// deste arquivo porque "use server" só exporta Server Action, e o formulário
// no navegador usa a mesma função pra mostrar a data da entrega.

const GravacaoSchema = z.object({
  // Loja da carteira. Vazio quando a gravação é pra alguém que ainda não está
  // cadastrado — aí o nome vem digitado.
  clientId: z.string().optional(),
  loja: z.string().optional(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data da gravação."),
  hora: z.string().regex(/^\d{2}:\d{2}$/, "Informe a hora da gravação."),
  quantidade: z.coerce
    .number()
    .int("Quantidade de vídeos tem que ser número inteiro.")
    .min(1, "Tem que ser pelo menos 1 vídeo.")
    .max(200, "Mais de 200 vídeos numa gravação? Confere o número."),
  // Em branco = D+1, o padrão. Serve pra quando foi combinado outro prazo.
  entrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  observacao: z.string().optional(),
});

export type GravacaoFormState = { error?: string; ok?: boolean } | undefined;

function lerFormulario(formData: FormData) {
  return GravacaoSchema.safeParse({
    clientId: (formData.get("clientId") as string) || undefined,
    loja: (formData.get("loja") as string) || undefined,
    data: formData.get("data"),
    hora: formData.get("hora"),
    quantidade: formData.get("quantidade"),
    entrega: (formData.get("entrega") as string) || undefined,
    observacao: (formData.get("observacao") as string) || undefined,
  });
}

function revalidar() {
  revalidatePath("/calendario");
  revalidatePath("/meu-dia");
}

/**
 * Resolve de quem é a gravação e qual nome fica guardado na linha.
 *
 * O nome da loja é copiado pra dentro da gravação mesmo quando o cliente está
 * vinculado, igual aos eventos de venda: se o cliente for renomeado ou sair da
 * carteira, a gravação continua dizendo pra quem foi.
 */
async function resolverLoja(
  empresa: "AGENCIA" | "TREINAMENTOS",
  clientId: string | undefined,
  lojaDigitada: string | undefined
): Promise<{ clientId: string | null; loja: string } | { erro: string }> {
  const digitada = lojaDigitada?.trim();

  // "__outra" é a opção de tela "digitar o nome". O formulário já manda vazio
  // nesse caso; aqui é cinto de segurança pra nunca procurar um cliente com
  // esse id e recusar a gravação por um motivo que a pessoa não entenderia.
  const id = clientId && clientId !== "__outra" ? clientId : undefined;

  // A carteira de lojas é da agência. Com o Treinamentos aberto, só nome
  // digitado — não dá pra pendurar gravação de curso numa loja.
  if (id && empresa === "AGENCIA") {
    const cliente = await prisma.client.findUnique({
      where: { id },
      select: { id: true, companyName: true },
    });
    if (!cliente) return { erro: "Essa loja não foi encontrada. Atualize a página e tente de novo." };
    return { clientId: cliente.id, loja: cliente.companyName };
  }

  if (!digitada || digitada.length < 2) {
    return { erro: "Escolha a loja na lista ou digite o nome dela." };
  }
  return { clientId: null, loja: digitada };
}

export async function createGravacao(
  _prevState: GravacaoFormState,
  formData: FormData
): Promise<GravacaoFormState> {
  const user = await requireModuleAccess("calendario");
  const empresa = await empresaAtual();

  const parsed = lerFormulario(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { clientId, loja, data, hora, quantidade, entrega, observacao } = parsed.data;

  const alvo = await resolverLoja(empresa, clientId, loja);
  if ("erro" in alvo) return { error: alvo.erro };

  await prisma.gravacao.create({
    data: {
      empresa,
      clientId: alvo.clientId,
      loja: alvo.loja,
      quantidade,
      gravadoEm: new Date(`${data}T${hora}`),
      entregaEm: new Date(`${entrega ?? diaDaEntrega(data)}T00:00`),
      observacao: observacao?.trim() || null,
      ownerId: user.id,
    },
  });

  revalidar();
  return { ok: true };
}

export async function updateGravacao(
  gravacaoId: string,
  _prevState: GravacaoFormState,
  formData: FormData
): Promise<GravacaoFormState> {
  await requireModuleAccess("calendario");
  const empresa = await empresaAtual();

  const parsed = lerFormulario(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { clientId, loja, data, hora, quantidade, entrega, observacao } = parsed.data;

  const alvo = await resolverLoja(empresa, clientId, loja);
  if ("erro" in alvo) return { error: alvo.erro };

  // A empresa entra no `where`, não numa conferência depois: o id vem do
  // navegador e não prova de quem a gravação é.
  const { count } = await prisma.gravacao.updateMany({
    where: { id: gravacaoId, empresa },
    data: {
      clientId: alvo.clientId,
      loja: alvo.loja,
      quantidade,
      gravadoEm: new Date(`${data}T${hora}`),
      entregaEm: new Date(`${entrega ?? diaDaEntrega(data)}T00:00`),
      observacao: observacao?.trim() || null,
    },
  });
  if (count === 0) return { error: "Gravação não encontrada." };

  revalidar();
  return { ok: true };
}

/** Marca que a entrega saiu. Clicar de novo desmarca, pra desfazer o engano. */
export async function alternarEntrega(gravacaoId: string) {
  await requireModuleAccess("calendario");
  const empresa = await empresaAtual();

  const atual = await prisma.gravacao.findFirst({
    where: { id: gravacaoId, empresa },
    select: { entregueEm: true },
  });
  if (!atual) return;

  await prisma.gravacao.updateMany({
    where: { id: gravacaoId, empresa },
    data: { entregueEm: atual.entregueEm ? null : new Date() },
  });
  revalidar();
}

/**
 * Apagar é só de quem lançou, ou do administrador.
 *
 * Corrigir a gravação qualquer um da equipe pode — é registro do trabalho de
 * todos, e quem está de plantão tem que conseguir arrumar um número errado.
 * Apagar some com o registro, então fica mais fechado.
 */
export async function deleteGravacao(gravacaoId: string) {
  const user = await requireModuleAccess("calendario");
  const empresa = await empresaAtual();

  const item = await prisma.gravacao.findFirst({
    where: { id: gravacaoId, empresa },
    select: { ownerId: true },
  });
  if (!item) return;
  if (item.ownerId !== user.id && user.role !== "ADMIN") return;

  await prisma.gravacao.deleteMany({ where: { id: gravacaoId, empresa } });
  revalidar();
}
