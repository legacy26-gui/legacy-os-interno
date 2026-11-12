"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira, escopoDaCarteira, CARTEIRA } from "@/lib/carteira";
import { contaValida } from "@/lib/meta/saldo";
import { TIPOS_DE_LEAD } from "@/lib/meta/insights";
import {
  sincronizarSaldo,
  sincronizarSaldosDoCliente,
} from "@/lib/meta/sincronizar-saldo";
import {
  sincronizarInsights,
  sincronizarInsightsDoCliente,
  prazoDe,
  aindaDaTempo,
} from "@/lib/meta/sincronizar-insights";

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
 * Busca o saldo na Meta agora, sem esperar rotina nenhuma.
 *
 * Quem aperta isso normalmente está no telefone com a loja. A resposta diz o
 * que deu, inclusive quando não deu: "indisponível" com motivo é informação,
 * botão que parece ter funcionado sem ter funcionado não é.
 *
 * Gestor de tráfego também pode apertar — ele não escolhe a conta, mas precisa
 * do número.
 */
export async function atualizarSaldoAgora(
  clientId: string,
): Promise<MetaAdsState> {
  return semQuebrar(async () => {
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
      const unica =
        falhas.length === 1 && !falhas[0].resultado.ok
          ? falhas[0].resultado.erro
          : null;
      return {
        erro: unica ?? `Não deu pra ler o saldo de ${falhas.length} conta(s).`,
      };
    }

    return {
      ok:
        falhas.length === 0
          ? "Saldo atualizado."
          : `Saldo atualizado, menos de ${falhas.length} conta(s).`,
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

    const prazo = prazoDe(ORCAMENTO_MS);
    let ok = 0;
    let falhou = 0;
    let naoDeuTempo = 0;

    for (const conta of contas) {
      // Acabou o tempo: para e conta quantas ficaram. A ordem é "mais velha
      // primeiro", então apertar de novo continua de onde parou — ninguém
      // precisa saber quais faltaram.
      if (!aindaDaTempo(prazo)) {
        naoDeuTempo = contas.length - (ok + falhou);
        break;
      }
      // Saldo primeiro: é o número que para a campanha. Se a conta está
      // quebrada, melhor saber disso antes de gastar a segunda chamada.
      const s = await sincronizarSaldo(conta);
      const i = await sincronizarInsights(conta, prazo);
      if (s.ok && i.ok) ok++;
      else falhou++;
    }

    revalidatePath("/meta-ads");

    const faltou = naoDeuTempo > 0 ? ` Faltaram ${naoDeuTempo} — aperte de novo pra continuar.` : "";

    if (ok === 0 && falhou === 0) {
      return { erro: "Não deu tempo de atualizar nenhuma conta. Aperte de novo." };
    }
    if (ok === 0) {
      return {
        erro: `Não deu pra atualizar nenhuma das ${falhou} contas. O motivo está na linha de cada uma.${faltou}`,
      };
    }
    return {
      ok:
        (falhou === 0
          ? `${ok} ${ok === 1 ? "conta atualizada" : "contas atualizadas"}.`
          : `${ok} atualizada(s), ${falhou} com problema — o motivo está na linha de cada uma.`) +
        faltou,
    };
  });
}

/**
 * Busca os números de campanha de um cliente agora.
 *
 * Separado do saldo porque na ficha da loja são duas perguntas diferentes:
 * "quanto tem na conta" e "o que as campanhas fizeram".
 */
export async function atualizarCampanhasAgora(
  clientId: string,
): Promise<MetaAdsState> {
  return semQuebrar(async () => {
    const user = await requireModuleAccess("clientes");
    if (!(await clienteEDaCarteira(user, clientId))) {
      return { erro: "Esta loja não está na sua lista." };
    }

    const resultados = await sincronizarInsightsDoCliente(clientId, prazoDe(ORCAMENTO_MS));
    revalidar(clientId);

    if (resultados.length === 0) {
      return { erro: "Nenhuma conta de anúncio vinculada a este cliente." };
    }

    const falhas = resultados.filter((r) => !r.resultado.ok);
    if (falhas.length === resultados.length) {
      const unica =
        falhas.length === 1 && !falhas[0].resultado.ok
          ? falhas[0].resultado.erro
          : null;
      return {
        erro:
          unica ??
          `Não deu pra buscar os números de ${falhas.length} conta(s).`,
      };
    }

    const linhas = resultados.reduce(
      (t, r) => t + (r.resultado.ok ? r.resultado.linhas : 0),
      0,
    );
    return {
      ok:
        falhas.length === 0
          ? `Números atualizados (${linhas} dias de conjunto).`
          : `Números atualizados, menos de ${falhas.length} conta(s).`,
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
    if (!user) return { erro: "Só a direção muda o que conta como lead." };

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
      ok: "Tipo de lead trocado. Aperte “Atualizar números” pra recontar os últimos 30 dias.",
    };
  });
}
