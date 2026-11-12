import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { sincronizarSaldo } from "./sincronizar-saldo";
import { sincronizarCriativos } from "./sincronizar-criativos";
import {
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
 * e aí nenhuma função termina a tempo. De quatro em quatro, cai pra menos de
 * quarenta segundos.
 *
 * Quatro e não quarenta: a Meta conta as chamadas por token e corta quem
 * exagera, e o corte dela dura horas. Melhor demorar meio minuto do que ficar
 * de castigo até de noite.
 */
const CONCORRENCIA = 4;

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
  metaAccountId: string;
  isPrepay: boolean;
  leadActionType: string;
};

const CAMPOS: Prisma.MetaAdAccountSelect = {
  id: true,
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
async function umaConta(conta: ContaDaVarredura, prazo: Prazo): Promise<boolean> {
  try {
    const saldo = await sincronizarSaldo(conta);
    const numeros = await sincronizarInsights(conta, prazo);
    // A vida inteira é uma chamada só e não paginada na prática; vem por
    // último porque é a menos urgente das três.
    const vida = await sincronizarVidaInteira(conta);

    // A arte não entra no veredito, de propósito: ela é enfeite útil, e não
    // ter a miniatura não pode pintar a loja de amarelo como se o GASTO
    // estivesse desatualizado. Falhou, fica sem imagem e pronto.
    try {
      await sincronizarCriativos(conta);
    } catch (erro) {
      console.error("[meta] falhou a arte de", conta.metaAccountId, erro);
    }

    return saldo.ok && numeros.ok && vida.ok;
  } catch (erro) {
    console.error("[meta] falhou a conta", conta.metaAccountId, erro);
    return false;
  }
}

/** Varre uma lista de contas, de quatro em quatro, dentro do prazo. */
export async function varrerContas(
  contas: ContaDaVarredura[],
  prazo: Prazo
): Promise<ResultadoDaVarredura> {
  let ok = 0;
  let falhou = 0;

  for (let i = 0; i < contas.length; i += CONCORRENCIA) {
    // O prazo é conferido entre ondas, não no meio de uma: cortar uma onda
    // pela metade deixaria contas com saldo novo e números velhos.
    if (!aindaDaTempo(prazo)) {
      return { ok, falhou, naoDeuTempo: contas.length - ok - falhou, total: contas.length };
    }
    const onda = contas.slice(i, i + CONCORRENCIA);
    const resultados = await Promise.all(onda.map((c) => umaConta(c, prazo)));
    for (const deuCerto of resultados) deuCerto ? ok++ : falhou++;
  }

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
