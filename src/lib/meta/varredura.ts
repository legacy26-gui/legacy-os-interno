import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { sincronizarSaldo } from "./sincronizar-saldo";
import { verbaEntrou } from "./pedido-de-verba";
import { sincronizarCriativos } from "./sincronizar-criativos";
import { sincronizarEstrutura } from "./sincronizar-estrutura";
import {
  registrarVeredito,
  sincronizarInsights,
  sincronizarVidaInteira,
  aindaDaTempo,
  prazoDe,
  type Prazo,
} from "./sincronizar-insights";

// Buscar saldo e números de um monte de contas de uma vez.
//
// ── Por que isto existe ───────────────────────────────────────────────────
//
// Porque apertar botão é o pior jeito de manter número atualizado. Quem abre
// a tela quer o número JÁ ali; se precisa apertar e esperar, metade das vezes
// não aperta, e aí a tela mostra o gasto de três dias atrás sem avisar que é
// velho. Então a varredura tem que servir a três donos:
//
//   o robô da noite  — passa em tudo sozinho, e é ele que faz a tela estar
//                      certa de manhã sem ninguém encostar
//   uma loja só      — "estou no telefone com essa loja agora"
//   a carteira       — quando alguém quer forçar a casa inteira
//
// É a mesma função nos três casos. Três caminhos diferentes pro mesmo
// trabalho viram três comportamentos diferentes em seis meses.

/**
 * Quantas contas ao mesmo tempo.
 *
 * Em fila indiana, 42 lojas × 2 chamadas de ~1,5s dão mais de dois minutos —
 * e aí nenhuma função termina a tempo. Em paralelo, cai pra menos de um
 * minuto.
 *
 * Dois e não quarenta: a Meta conta as chamadas por token e corta quem
 * exagera, e o corte dela dura horas. Melhor demorar meio minuto do que ficar
 * de castigo até de noite.
 *
 * Era quatro. Caiu pra dois quando cada conta passou a disparar as suas
 * cinco buscas juntas: 4 × 5 = 20 chamadas simultâneas por token é pedir pra
 * levar corte. 2 × 5 = 10 mantém o total parecido com o de antes, e o ganho
 * de verdade veio de dentro da conta, não de empilhar mais contas.
 */
const CONCORRENCIA = 2;

export interface ResultadoDaVarredura {
  /** Contas que buscaram saldo e números sem erro. */
  ok: number;
  /** Contas que responderam com problema — o motivo fica em lastSyncError. */
  falhou: number;
  /** Contas que ficaram pra próxima por falta de tempo. */
  naoDeuTempo: number;
  total: number;
}

type ContaDaVarredura = {
  id: string;
  clientId: string;
  metaAccountId: string;
  isPrepay: boolean;
  leadActionType: string;
};

const CAMPOS: Prisma.MetaAdAccountSelect = {
  id: true,
  clientId: true,
  metaAccountId: true,
  isPrepay: true,
  leadActionType: true,
};

/**
 * Busca uma conta: saldo primeiro, números depois.
 *
 * O saldo vem antes porque é o número que PARA a campanha — se a conta está
 * quebrada, é melhor saber disso antes de gastar as outras chamadas.
 *
 * Nada aqui lança erro pra cima: a conta que deu problema já guardou o motivo
 * em lastSyncError, e uma conta ruim não pode derrubar a varredura das
 * outras.
 */
async function umaConta(
  conta: ContaDaVarredura,
  prazo: Prazo,
): Promise<boolean> {
  try {
    // ── Por que as cinco buscas vão juntas ──────────────────────────────
    //
    // Antes era uma depois da outra: saldo, números, vida inteira, arte,
    // cadastro. Cinco idas à Meta de ~1,5s dão sete segundos e meio POR
    // CONTA — e uma loja com duas contas passava de quinze. Era isso o
    // "atualizar demora muito, muito": o botão de uma loja só esperava a
    // soma de cinco esperas que não dependem umas das outras.
    //
    // Elas são independentes de verdade: nenhuma usa o resultado da outra,
    // cada uma escreve na sua tabela. Juntas, o tempo da conta passa a ser o
    // da mais lenta — perto de dois segundos em vez de sete e meio.
    //
    // Isto multiplica as chamadas simultâneas por token, e é por isso que a
    // CONCORRENCIA caiu junto: cinco de uma vez vezes quatro contas seriam
    // vinte, e a Meta corta quem exagera por horas. Ver a constante lá em
    // cima.
    //
    // allSettled e não all: `all` desiste na primeira que falhar, e aí um
    // saldo fora do ar levaria embora os números que já tinham voltado.
    const [saldo, numeros, vida, arte, cadastro] = await Promise.allSettled([
      sincronizarSaldo(conta),
      sincronizarInsights(conta, prazo),
      sincronizarVidaInteira(conta),
      sincronizarCriativos(conta),
      sincronizarEstrutura(conta),
    ]);

    // A arte e o cadastro não entram no veredito, de propósito: são enfeite
    // útil, e não ter a miniatura não pode pintar a loja de amarelo como se
    // o GASTO estivesse desatualizado. Falhou, fica sem imagem e pronto.
    if (arte.status === "rejected") {
      console.error(
        "[meta] falhou a arte de",
        conta.metaAccountId,
        arte.reason,
      );
    }
    if (cadastro.status === "rejected") {
      console.error(
        "[meta] falhou o cadastro de",
        conta.metaAccountId,
        cadastro.reason,
      );
    }

    // ── O veredito, escrito uma vez só ──────────────────────────────────
    //
    // Enquanto cada busca gravava o próprio resultado em `lastSyncError`, as
    // que rodam juntas disputavam o campo: a dos 30 dias limpava o erro ao
    // dar certo, a de vida inteira gravava erro ao falhar, e valia a última
    // a terminar. A mesma conta aparecia com erro numa atualização e sem
    // erro na seguinte, com os mesmos dados.
    //
    // E a ordem das falhas importa: a de NÚMEROS é a que para a loja, e é
    // ela que tem que aparecer na tela quando as duas falham. "O acumulado
    // de vida inteira não veio" ao lado de números velhos mandaria procurar
    // no lugar errado.
    const problema =
      motivo(saldo, "o saldo não veio") ??
      motivo(numeros, "os números do período não vieram") ??
      motivo(
        vida,
        "o acumulado de vida inteira não veio — os números do período estão certos",
      );

    await registrarVeredito(conta.id, problema);
    return problema === null;
  } catch (erro) {
    console.error("[meta] falhou a conta", conta.metaAccountId, erro);
    return false;
  }
}

/**
 * Fecha os pedidos de verba das lojas cujo saldo subiu.
 *
 * É isto que faz o "marquei que mandei o link" não precisar de um segundo
 * clique depois. Saldo de conta pré-paga só DESCE com gasto; se ele subiu
 * desde o envio do link, é porque entrou dinheiro. Quem confirma é a Meta.
 *
 * Roda depois da varredura e não dentro dela: o pedido é da LOJA e o saldo é
 * da CONTA, então só faz sentido perguntar quando todas as contas da loja já
 * foram lidas. Fechar no meio daria falso negativo em loja com duas contas.
 *
 * Nada aqui lança pra cima: o pedido é conforto de tela, e falhar em fechá-lo
 * não pode derrubar uma varredura que buscou os números certos.
 */
export async function fecharPedidosPagos(clientIds: string[]): Promise<void> {
  if (clientIds.length === 0) return;

  try {
    const abertos = await prisma.pedidoDeVerba.findMany({
      where: {
        clientId: { in: clientIds },
        entrouEm: null,
        saldoNoEnvioCents: { not: null },
      },
      select: { id: true, clientId: true, saldoNoEnvioCents: true },
    });
    if (abertos.length === 0) return;

    const contas = await prisma.metaAdAccount.findMany({
      where: {
        clientId: { in: abertos.map((p) => p.clientId) },
        active: true,
        isPrepay: true,
      },
      select: {
        clientId: true,
        balanceSnapshots: {
          orderBy: { capturedAt: "desc" },
          take: 1,
          select: { availableCents: true },
        },
      },
    });

    // Só soma quando TODAS as pré-pagas da loja foram lidas: saldo pela
    // metade poderia parecer uma queda e segurar um pedido já pago, ou
    // parecer uma subida e fechar um que ninguém pagou.
    const somaDaLoja = new Map<string, number | null>();
    for (const c of contas) {
      const atual = somaDaLoja.get(c.clientId);
      if (atual === null) continue;
      const lido = c.balanceSnapshots[0]?.availableCents;
      if (lido === undefined) somaDaLoja.set(c.clientId, null);
      else somaDaLoja.set(c.clientId, (atual ?? 0) + lido);
    }

    const agora = new Date();
    for (const pedido of abertos) {
      const saldo = somaDaLoja.get(pedido.clientId);
      if (saldo === null || saldo === undefined) continue;
      if (!verbaEntrou(saldo, pedido.saldoNoEnvioCents)) continue;
      await prisma.pedidoDeVerba.update({
        where: { id: pedido.id },
        data: { entrouEm: agora, entrouCents: saldo },
      });
    }
  } catch (erro) {
    console.error("[meta] falhou fechar pedidos de verba", erro);
  }
}

/** Varre uma lista de contas, de quatro em quatro, dentro do prazo. */
export async function varrerContas(
  contas: ContaDaVarredura[],
  prazo: Prazo,
): Promise<ResultadoDaVarredura> {
  let ok = 0;
  let falhou = 0;

  for (let i = 0; i < contas.length; i += CONCORRENCIA) {
    // O prazo é conferido entre ondas, não no meio de uma: cortar uma onda
    // pela metade deixaria contas com saldo novo e números velhos.
    if (!aindaDaTempo(prazo)) {
      await fecharPedidosPagos([
        ...new Set(
          contas
            .slice(0, i)
            .filter((c) => c.isPrepay)
            .map((c) => c.clientId),
        ),
      ]);
      return {
        ok,
        falhou,
        naoDeuTempo: contas.length - ok - falhou,
        total: contas.length,
      };
    }
    const onda = contas.slice(i, i + CONCORRENCIA);
    const resultados = await Promise.all(onda.map((c) => umaConta(c, prazo)));
    for (const deuCerto of resultados) deuCerto ? ok++ : falhou++;
  }

  // No fim e não a cada onda: a conta é da loja inteira, e perguntar antes de
  // ler todas as contas dela daria falso negativo.
  await fecharPedidosPagos([
    ...new Set(contas.filter((c) => c.isPrepay).map((c) => c.clientId)),
  ]);

  return { ok, falhou, naoDeuTempo: 0, total: contas.length };
}

/**
 * As contas de UMA loja. É o que o botão da linha e o da ficha chamam.
 *
 * Sem teto e com prazo curto: loja tem uma ou duas contas, isso termina em
 * segundos. O prazo existe só pra uma Meta travada não segurar a tela.
 */
export async function varrerCliente(clientId: string, prazo = prazoDe(30_000)) {
  const contas = (await prisma.metaAdAccount.findMany({
    where: { clientId, active: true },
    select: CAMPOS,
  })) as ContaDaVarredura[];

  return varrerContas(contas, prazo);
}

/**
 * Todas as contas da casa. É o que o robô da noite chama.
 *
 * Sem recorte de pessoa de propósito: o robô não é ninguém, ele passa em
 * tudo. Quem vê o quê é decidido na TELA, não aqui.
 *
 * Mais velha primeiro: se o prazo acabar, a rodada seguinte pega quem ficou
 * pra trás em vez de buscar sempre as mesmas.
 */
export async function varrerCasa(prazo: Prazo): Promise<ResultadoDaVarredura> {
  const contas = (await prisma.metaAdAccount.findMany({
    where: { active: true, client: { status: { not: "CANCELADO" } } },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    select: CAMPOS,
  })) as ContaDaVarredura[];

  return varrerContas(contas, prazo);
}

/**
 * O motivo da falha de uma busca, ou null quando deu certo.
 *
 * `rejected` é exceção (rede caiu, código quebrou); `ok: false` é a Meta
 * tendo dito não. Os dois contam como falha, mas só o segundo tem uma frase
 * que vale mostrar — a primeira vira texto de erro de programador na tela da
 * loja, e por isso recebe a explicação curta de quem chamou.
 */
function motivo(
  r: PromiseSettledResult<{ ok: boolean; erro?: string }>,
  oQue: string,
): string | null {
  if (r.status === "rejected") return `${oQue}.`;
  if (r.value.ok) return null;
  return r.value.erro ? `${oQue}: ${r.value.erro}` : `${oQue}.`;
}
