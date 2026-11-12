"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira, escopoDaCarteira, CARTEIRA } from "@/lib/carteira";
import { contaValida } from "@/lib/meta/saldo";
import { TIPOS_DE_LEAD } from "@/lib/meta/insights";
import { prazoDe } from "@/lib/meta/sincronizar-insights";
import { varrerContas, varrerCliente } from "@/lib/meta/varredura";

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

/**
 * Nenhuma ação daqui pode EXPLODIR.
 *
 * Server Action que lança erro derruba a tela inteira no "This page couldn't
 * load" — a pessoa perde a página, não sabe o que houve, e o motivo fica num
 * log que ninguém abre. Apertar um botão que deu errado tem que devolver uma
 * frase, não uma tela preta.
 *
 * O redirect e o notFound do Next TAMBÉM são lançados como erro — é assim que
 * eles funcionam. Esses precisam passar direto, senão o "não tem permissão"
 * viraria uma mensagem vermelha no lugar de mandar a pessoa pro dashboard.
 */
async function semQuebrar(
  fazer: () => Promise<MetaAdsState>,
): Promise<MetaAdsState> {
  try {
    return await fazer();
  } catch (erro) {
    const digest = (erro as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw erro;

    console.error("[meta-ads] a ação falhou", erro);
    const msg = erro instanceof Error ? erro.message : String(erro);
    return { erro: `Deu erro no servidor: ${msg.slice(0, 300)}` };
  }
}

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
  revalidatePath(`/meta-ads/${clientId}`);
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
  isPrepay: boolean,
): Promise<MetaAdsState> {
  return semQuebrar(async () => {
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
  });
}


/**
 * Quantas contas uma varredura busca de uma vez.
 *
 * Teto porque cada conta custa DUAS chamadas de rede (saldo e números), em
 * sequência, e a função tem tempo limitado pra responder. Melhor atualizar 25
 * e dizer que faltaram do que estourar no meio e não atualizar nenhuma.
 */
const CONTAS_POR_VARREDURA = 25;

/**
 * Quanto tempo a varredura pode gastar antes de devolver o que conseguiu.
 *
 * A Vercel MATA a função quando o tempo dela acaba — sem erro, sem mensagem,
 * sem passar por try/catch nenhum. O que a pessoa vê é a tela preta do Next e
 * nada atualizado. Por isso o limite é controlado aqui dentro, abaixo do da
 * plataforma: a função termina sozinha, com resposta na mão, antes de alguém
 * desligar ela na tomada.
 *
 * 45 segundos cabe folgado no menor limite da Vercel (60s). Carteira grande
 * precisa de dois ou três apertos, e a tela diz isso — melhor que um aperto
 * que morre no meio e não grava nada.
 */
const ORCAMENTO_MS = 45_000;

/**
 * Atualiza saldo e números de todas as contas que a pessoa enxerga.
 *
 * O recorte é o mesmo do resto do sistema: gestor de tráfego varre a carteira
 * dele, direção varre a casa. Quem não vê a loja não dispara chamada em nome
 * dela.
 *
 * Saldo e números num botão só porque são a mesma pergunta na cabeça de quem
 * aperta: "como está essa loja hoje". Dois botões garantiriam que um dia
 * alguém aperta um e esquece o outro, e aí metade da tela fica velha sem
 * ninguém perceber.
 */
export async function atualizarCarteira(): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await requireModuleAccess("clientes");

    const contas = await prisma.metaAdAccount.findMany({
      where: {
        active: true,
        client: { ...CARTEIRA, ...escopoDaCarteira(user) },
      },
      // Mais velha primeiro: numa carteira maior que o teto, a varredura seguinte
      // pega quem ficou pra trás em vez de buscar sempre as mesmas.
      orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
      take: CONTAS_POR_VARREDURA,
      select: {
        id: true,
        metaAccountId: true,
        isPrepay: true,
        leadActionType: true,
      },
    });

    if (contas.length === 0) {
      return {
        erro: "Nenhuma conta de anúncio vinculada nas suas lojas ainda.",
      };
    }

    const r = await varrerContas(contas, prazoDe(ORCAMENTO_MS));
    revalidatePath("/meta-ads");

    const faltou =
      r.naoDeuTempo > 0 ? ` Faltaram ${r.naoDeuTempo} — aperte de novo pra continuar.` : "";

    if (r.ok === 0 && r.falhou === 0) {
      return { erro: "Não deu tempo de atualizar nenhuma conta. Aperte de novo." };
    }
    if (r.ok === 0) {
      return {
        erro: `Não deu pra atualizar nenhuma das ${r.falhou} contas. O motivo está na linha de cada uma.${faltou}`,
      };
    }
    return {
      ok:
        (r.falhou === 0
          ? `${r.ok} ${r.ok === 1 ? "conta atualizada" : "contas atualizadas"}.`
          : `${r.ok} atualizada(s), ${r.falhou} com problema — o motivo está na linha de cada uma.`) +
        faltou,
    };
  });
}

/**
 * Atualiza UMA loja: saldo e números, de uma vez.
 *
 * É o botão da linha da lista e o da ficha. Existe porque a pergunta mais
 * comum não é "como está a casa", é "como está ESSA loja" — normalmente com
 * alguém no telefone do outro lado. Uma loja são duas chamadas: responde em
 * segundos, sem prazo apertado e sem risco de morrer no meio.
 *
 * Saldo e números juntos de propósito. Separados, um dia alguém aperta um e
 * esquece o outro, e metade da tela fica velha sem ninguém perceber.
 */
export async function atualizarLojaAgora(clientId: string): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await requireModuleAccess("clientes");
    if (!(await clienteEDaCarteira(user, clientId))) {
      return { erro: "Esta loja não está na sua lista." };
    }

    const r = await varrerCliente(clientId);
    revalidar(clientId);

    if (r.total === 0) {
      return { erro: "Nenhuma conta de anúncio vinculada a esta loja." };
    }
    if (r.ok === 0) {
      return { erro: "Não deu pra atualizar. O motivo está na linha da conta." };
    }
    return {
      ok:
        r.falhou === 0
          ? "Atualizado."
          : `Atualizado, menos de ${r.falhou} conta(s) — o motivo está na linha de cada uma.`,
    };
  });
}


/**
 * Troca o que conta como "lead" numa conta.
 *
 * É configuração da conta, não do sistema: uma loja roda campanha de WhatsApp,
 * outra de formulário. Somar as duas como se fossem a mesma coisa daria um
 * custo por lead que não quer dizer nada.
 *
 * Mexer aqui NÃO reescreve o histórico sozinho — os dias já gravados ficam
 * com a contagem antiga até a próxima busca. A tela avisa disso.
 */
export async function definirTipoDeLead(
  clientId: string,
  contaId: string,
  tipo: string,
): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await quemPodeVincular(clientId);
    if (!user) {
      return { erro: "Só a direção muda o que conta como lead." };
    }

    if (!TIPOS_DE_LEAD.some((t) => t.valor === tipo)) {
      return { erro: "Tipo de lead desconhecido." };
    }

    // updateMany com o clientId junto: o id da conta vem do navegador, e assim
    // não dá pra mexer na conta de outra loja mandando outro id.
    const { count } = await prisma.metaAdAccount.updateMany({
      where: { id: contaId, clientId },
      data: { leadActionType: tipo },
    });
    if (count === 0) return { erro: "Conta não encontrada nesta loja." };

    revalidar(clientId);
    return {
      ok: "Tipo de lead trocado. Aperte “Atualizar agora” pra recontar os últimos 30 dias.",
    };
  });
}

/**
 * Vincula várias contas de uma vez, a partir da tela de descoberta.
 *
 * Cada par vem conferido por gente na tela — a sugestão por nome é palpite, e
 * conta vinculada à loja errada manda o gasto de uma pra ficha de outra sem
 * ninguém desconfiar.
 *
 * Nada de transação única: uma conta já usada por outra loja não pode
 * derrubar as outras trinta que estavam certas. Cada uma por si, e no fim a
 * tela diz quantas entraram e o que travou.
 */
export async function vincularVarias(
  pares: { clientId: string; metaAccountId: string; isPrepay: boolean }[]
): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await requireModuleAccess("clientes");
    if (user.role !== "ADMIN" && user.role !== "GERENTE") {
      return { erro: "Só a direção vincula conta de anúncio." };
    }
    if (pares.length === 0) return { erro: "Nenhuma conta marcada." };

    // As lojas da carteira, de uma vez: confere todos os clientId sem uma
    // consulta por par.
    const lojas = new Set(
      (
        await prisma.client.findMany({
          where: { ...CARTEIRA, ...escopoDaCarteira(user) },
          select: { id: true },
        })
      ).map((c) => c.id)
    );

    let entraram = 0;
    const problemas: string[] = [];

    for (const par of pares) {
      if (!lojas.has(par.clientId)) {
        problemas.push("uma loja fora da sua lista");
        continue;
      }
      if (!contaValida(par.metaAccountId)) {
        problemas.push(`${par.metaAccountId} não tem o formato act_<números>`);
        continue;
      }
      const jaExiste = await prisma.metaAdAccount.findUnique({
        where: { metaAccountId: par.metaAccountId },
        select: { client: { select: { companyName: true } } },
      });
      if (jaExiste) {
        problemas.push(`${par.metaAccountId} já é de ${jaExiste.client.companyName}`);
        continue;
      }
      await prisma.metaAdAccount.create({
        data: {
          clientId: par.clientId,
          metaAccountId: par.metaAccountId,
          isPrepay: par.isPrepay,
        },
      });
      entraram++;
    }

    revalidatePath("/meta-ads");
    revalidatePath("/meta-ads/vincular");

    if (entraram === 0) {
      return { erro: `Nenhuma vinculada. ${problemas.join("; ")}.` };
    }
    return {
      ok:
        problemas.length === 0
          ? `${entraram} ${entraram === 1 ? "conta vinculada" : "contas vinculadas"}. Aperte “Atualizar tudo” pra buscar os números.`
          : `${entraram} vinculada(s). Ficaram de fora: ${problemas.join("; ")}.`,
    };
  });
}

/** Desfaz um vínculo — e leva junto o que foi buscado por causa dele. */
export async function desvincularConta(contaId: string): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await requireModuleAccess("clientes");
    if (user.role !== "ADMIN" && user.role !== "GERENTE") {
      return { erro: "Só a direção desvincula conta de anúncio." };
    }

    const conta = await prisma.metaAdAccount.findUnique({
      where: { id: contaId },
      select: { clientId: true, metaAccountId: true },
    });
    if (!conta) return { erro: "Conta não encontrada." };
    if (!(await clienteEDaCarteira(user, conta.clientId))) {
      return { erro: "Essa loja não está na sua lista." };
    }

    // Os números vão junto: são cópia do que está na Meta, e ficar com o
    // gasto de uma conta que não é mais desta loja seria pior que perder.
    await prisma.$transaction(
      async (tx) => {
        await tx.metaInsightDaily.deleteMany({ where: { adAccountId: contaId } });
        await tx.metaLifetime.deleteMany({ where: { adAccountId: contaId } });
        await tx.metaAdCreative.deleteMany({ where: { adAccountId: contaId } });
        await tx.balanceSnapshot.deleteMany({ where: { adAccountId: contaId } });
        await tx.metaAdAccount.delete({ where: { id: contaId } });
      },
      { timeout: 20_000, maxWait: 10_000 }
    );

    revalidar(conta.clientId);
    revalidatePath("/meta-ads/vincular");
    return { ok: `${conta.metaAccountId} desvinculada.` };
  });
}
