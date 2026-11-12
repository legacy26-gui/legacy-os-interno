"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira, escopoDaCarteira, CARTEIRA } from "@/lib/carteira";
import { contaValida } from "@/lib/meta/saldo";
import { sincronizarSaldo, sincronizarSaldosDoCliente } from "@/lib/meta/sincronizar-saldo";

// Vincular conta de anúncio da Meta e buscar o saldo.
//
// Só ADMIN e GERENTE. Vincular conta de anúncio errada não é erro de digitação
// que se acha depois: o saldo de outra loja aparece na ficha desta, e quem
// olhar vai decidir Pix em cima de número que não é dele. Gestor de tráfego vê
// o saldo (é ele que precisa) mas não escolhe qual conta é de qual loja.
//
// Nada aqui recebe nem devolve token: o token vive só em src/lib/meta/ e
// nunca sai de lá.

export type MetaAdsState = { erro?: string; ok?: string };

/** Só a direção vincula conta. */
async function quemPodeVincular(clientId: string) {
  const user = await requireModuleAccess("clientes");
  if (user.role !== "ADMIN" && user.role !== "GERENTE") return null;
  // O id vem do navegador. Pra ADMIN/GERENTE isto confirma que a loja existe.
  return (await clienteEDaCarteira(user, clientId)) ? user : null;
}

function revalidar(clientId: string) {
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/meta-ads");
}

/**
 * Liga uma conta de anúncio da Meta a um cliente.
 *
 * `metaAccountId` tem que ser "act_" seguido só de números — é o formato da
 * Meta, e validar aqui evita que um texto colado torto (um link inteiro, um
 * nome de conta) vire uma chamada à Graph API com caminho estranho.
 *
 * `isPrepay` marca conta que é abastecida por Pix. Só pra ela faz sentido
 * guardar saldo: em conta no cartão o número que a Meta devolve é limite de
 * crédito, que é outra conversa.
 */
export async function vincularContaAnuncios(
  clientId: string,
  metaAccountId: string,
  isPrepay: boolean
): Promise<MetaAdsState> {
  const user = await quemPodeVincular(clientId);
  if (!user) return { erro: "Só a direção pode vincular conta de anúncio." };

  const id = metaAccountId.trim();
  if (!contaValida(id)) {
    return {
      erro: 'O ID da conta precisa ser "act_" seguido só de números — por exemplo act_1234567890.',
    };
  }

  // metaAccountId é único no banco: a mesma conta não pode estar em duas
  // lojas. A checagem aqui é pra devolver uma frase que explica, em vez de
  // deixar o erro do banco subir.
  const jaExiste = await prisma.metaAdAccount.findUnique({
    where: { metaAccountId: id },
    select: { client: { select: { id: true, companyName: true } } },
  });
  if (jaExiste) {
    return {
      erro:
        jaExiste.client.id === clientId
          ? "Esta conta já está vinculada a este cliente."
          : `Esta conta já está vinculada a ${jaExiste.client.companyName}.`,
    };
  }

  await prisma.metaAdAccount.create({
    data: { clientId, metaAccountId: id, isPrepay },
  });

  revalidar(clientId);
  return {
    ok: isPrepay
      ? "Conta vinculada. Aperte “Atualizar agora” pra buscar o saldo."
      : "Conta vinculada (sem saldo pré-pago a acompanhar).",
  };
}

/**
 * Busca o saldo na Meta agora, sem esperar rotina nenhuma.
 *
 * Quem aperta isso normalmente está no telefone com a loja. A resposta diz o
 * que deu, inclusive quando não deu: "indisponível" com motivo é informação,
 * botão que parece ter funcionado sem ter funcionado não é.
 *
 * Gestor de tráfego também pode apertar — ele não escolhe a conta, mas precisa
 * do número.
 */
export async function atualizarSaldoAgora(clientId: string): Promise<MetaAdsState> {
  const user = await requireModuleAccess("clientes");
  if (!(await clienteEDaCarteira(user, clientId))) {
    return { erro: "Esta loja não está na sua lista." };
  }

  const resultados = await sincronizarSaldosDoCliente(clientId);
  revalidar(clientId);

  if (resultados.length === 0) {
    return { erro: "Nenhuma conta de anúncio vinculada a este cliente." };
  }

  const falhas = resultados.filter((r) => !r.resultado.ok);
  if (falhas.length === resultados.length) {
    // Uma conta só: mostra o motivo. Várias: mostra quantas, e o motivo de
    // cada uma fica na linha dela, na tela.
    const unica = falhas.length === 1 && !falhas[0].resultado.ok ? falhas[0].resultado.erro : null;
    return { erro: unica ?? `Não deu pra ler o saldo de ${falhas.length} conta(s).` };
  }

  return {
    ok:
      falhas.length === 0
        ? "Saldo atualizado."
        : `Saldo atualizado, menos de ${falhas.length} conta(s).`,
  };
}

/**
 * Quantas contas uma varredura busca de uma vez.
 *
 * Teto porque a busca é uma chamada de rede por conta, em sequência, e a
 * função tem tempo limitado pra responder. Melhor atualizar 40 e dizer que
 * faltaram do que estourar no meio e não atualizar nenhuma.
 */
const CONTAS_POR_VARREDURA = 40;

/**
 * Atualiza o saldo de todas as contas que a pessoa enxerga.
 *
 * O recorte é o mesmo do resto do sistema: gestor de tráfego varre a carteira
 * dele, direção varre a casa. Quem não vê a loja não dispara chamada em nome
 * dela.
 */
export async function atualizarSaldosDaCarteira(): Promise<MetaAdsState> {
  const user = await requireModuleAccess("clientes");

  const contas = await prisma.metaAdAccount.findMany({
    where: {
      active: true,
      isPrepay: true,
      client: { ...CARTEIRA, ...escopoDaCarteira(user) },
    },
    // Mais velha primeiro: numa carteira maior que o teto, a varredura seguinte
    // pega quem ficou pra trás em vez de buscar sempre as mesmas.
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    take: CONTAS_POR_VARREDURA,
    select: { id: true, metaAccountId: true, isPrepay: true },
  });

  if (contas.length === 0) {
    return { erro: "Nenhuma conta pré-paga vinculada nas suas lojas ainda." };
  }

  let ok = 0;
  let falhou = 0;
  for (const conta of contas) {
    const r = await sincronizarSaldo(conta);
    if (r.ok) ok++;
    else falhou++;
  }

  revalidatePath("/meta-ads");

  if (ok === 0) {
    return { erro: `Não deu pra ler o saldo de nenhuma das ${falhou} contas. O motivo está em cada linha.` };
  }
  return {
    ok:
      falhou === 0
        ? `${ok} ${ok === 1 ? "conta atualizada" : "contas atualizadas"}.`
        : `${ok} atualizada(s), ${falhou} com erro — o motivo está na linha de cada uma.`,
  };
}
