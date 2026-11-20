import "server-only";

import { prisma } from "@/lib/prisma";
import { CARTEIRA_NO_META, escopoDaCarteira, type PessoaDaCasa } from "@/lib/carteira";
import {
  lerIntervalo,
  somar,
  custoPorLead,
  ctr,
  cpm,
  reais,
  rotuloDoTipoDeLead,
  ZERO,
  type Intervalo,
  type Numeros,
} from "@/lib/meta/insights";
import { linhasDaLoja, ritmoDaLoja } from "@/app/(app)/meta-ads/[clientId]/dados";
import { avaliarLoja, comoDias } from "@/lib/meta/estado-da-loja";
import { saldoEmReais } from "@/lib/meta/saldo";
import { veiculacaoDe } from "@/lib/meta/veiculacao";

// As consultas que o Copiloto pode fazer.
//
// ── Por que uma lista FECHADA, e não acesso ao banco ─────────────────────
//
// Porque a regra número um deste assistente é não inventar número. Um modelo
// que escreve a consulta pode escrever a consulta errada e responder com
// convicção sobre dados que não existem — e quem lê não tem como saber.
//
// Aqui o modelo não vê o banco. Ele escolhe UMA destas consultas e diz com
// quais parâmetros; o sistema roda a consulta de verdade; e só então o modelo
// escreve a resposta em cima do que voltou. Se o número está na resposta, ele
// saiu daqui.
//
// ── A trava de carteira é por consulta, não na entrada ───────────────────
//
// Toda consulta recebe `user` e filtra por `escopoDaCarteira`. Não existe
// consulta que receba um clientId e confie nele: gestor que perguntar pela
// loja de outro recebe "não encontrei essa loja na sua carteira", e não os
// números dela.

/** O que uma consulta devolve pro modelo escrever a resposta. */
export interface ResultadoDaConsulta {
  /** Uma frase dizendo o que foi consultado — vira contexto pro modelo. */
  oQueFoi: string;
  /** As linhas, já com os números calculados e formatados. */
  dados: unknown;
  /** Quando não deu pra responder, o motivo em português. */
  aviso?: string;
}

// ── Peças comuns ─────────────────────────────────────────────────────────

/** As lojas da carteira de quem perguntou, com as contas de anúncio. */
/**
 * Quem está perguntando — e, quando for o caso, por qual porta.
 *
 * ── O campo que importa ──────────────────────────────────────────────────
 *
 * `soALoja` existe pra uma situação só: a pergunta chegou DENTRO do grupo de
 * um cliente. Ali a resposta não pode ser a carteira de quem escreveu — tem
 * que ser aquela loja, e só ela. Um "quais lojas estão sem verba?" no grupo
 * da R2 precisa trazer a R2 e mais nada.
 *
 * Não é o modelo que garante isso. É esta linha, no `where` da única consulta
 * que resolve lojas neste arquivo: o que não passa por aqui não existe pro
 * resto do Copiloto. Pedir pro modelo "deduzir" que só pode falar daquela
 * loja seria apostar o dado do cliente num bom dia dele.
 */
export interface QuemPergunta extends PessoaDaCasa {
  /** clientId. Com ele, a consulta enxerga uma loja só. */
  soALoja?: string;
}

async function lojasDoUsuario(user: QuemPergunta) {
  return prisma.client.findMany({
    where: {
      ...CARTEIRA_NO_META,
      ...escopoDaCarteira(user),
      // A trava do grupo do cliente. Vem DEPOIS do escopo de carteira, e os
      // dois valem juntos: a loja tem que estar na carteira de quem pergunta
      // E ser a do grupo. Uma não substitui a outra.
      ...(user.soALoja ? { id: user.soALoja } : {}),
    },
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      gastoMensalPrevistoCents: true,
      manager: { select: { name: true } },
      metaAdAccounts: {
        where: { active: true },
        select: {
          id: true,
          isPrepay: true,
          leadActionType: true,
          lastSyncedAt: true,
          lastSyncError: true,
          balanceSnapshots: {
            orderBy: { capturedAt: "desc" },
            take: 1,
            select: { availableCents: true, capturedAt: true },
          },
        },
      },
      pedidosDeVerba: {
        orderBy: { enviadoEm: "desc" },
        take: 1,
        select: { enviadoEm: true, entrouEm: true },
      },
    },
  });
}

type LojaDoUsuario = Awaited<ReturnType<typeof lojasDoUsuario>>[number];

/** Acha UMA loja pelo nome, dentro da carteira. */
function acharPorNome(lojas: LojaDoUsuario[], nome: string) {
  const alvo = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  if (!alvo) return null;
  const achatar = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return (
    lojas.find((l) => achatar(l.companyName) === alvo) ??
    lojas.find((l) => achatar(l.companyName).includes(alvo)) ??
    null
  );
}

/** Os números de um conjunto de linhas, já formatados pra leitura. */
function numerosLegiveis(n: Numeros, rotuloDoResultado: string) {
  const cpl = custoPorLead(n);
  return {
    investido: reais(n.spendCents),
    resultados: n.leads,
    oQueEhResultado: rotuloDoResultado,
    custoPorResultado: cpl === null ? null : reais(cpl),
    impressoes: n.impressions,
    alcance: n.reach,
    cliquesNoLink: n.linkClicks,
    ctr: ctr(n) === null ? null : `${ctr(n)!.toFixed(2)}%`,
    cpm: cpm(n) === null ? null : reais(cpm(n)!),
  };
}

function periodoDe(texto: string | undefined): Intervalo {
  return lerIntervalo({ periodo: texto }, "7");
}

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * A janela imediatamente anterior, do mesmo tamanho.
 *
 * "Os últimos 7 dias" comparados com "os 7 antes desses". Vida inteira não
 * tem anterior — é o começo de tudo.
 */
function janelaAnterior(p: Intervalo): Intervalo {
  if (p.vidaInteira || !p.de || !p.ate) {
    return { ...p, rotulo: "não há período anterior" };
  }
  const dias = Math.round((p.ate.getTime() - p.de.getTime()) / UM_DIA) + 1;
  const ate = new Date(p.de.getTime() - UM_DIA);
  const de = new Date(ate.getTime() - (dias - 1) * UM_DIA);
  return {
    de,
    ate,
    rotulo: `os ${dias} dias anteriores`,
    chave: "",
    vidaInteira: false,
  };
}

// ── 1. Como vão todas as lojas ───────────────────────────────────────────

/**
 * O ranking da carteira: quem está indo bem e quem não está.
 *
 * Responde "quais clientes estão com pior desempenho?" sem que o modelo
 * precise decidir o que é "pior": a ordem é por custo por resultado, do mais
 * caro pro mais barato, e quem não teve resultado nenhum vem antes de todos.
 */
export async function desempenhoDasLojas(
  user: QuemPergunta,
  args: { periodo?: string },
): Promise<ResultadoDaConsulta> {
  const periodo = periodoDe(args.periodo);
  const lojas = await lojasDoUsuario(user);
  if (lojas.length === 0) {
    return {
      oQueFoi: "Desempenho das lojas",
      // Mesmo formato do caso normal: duas formas diferentes pro mesmo tipo
      // de resposta é convite pro modelo ler errado uma delas.
      dados: { total: null, lojas: [] },
      aviso: "Não há loja nenhuma na sua carteira.",
    };
  }

  const linhas = await Promise.all(
    lojas.map(async (l) => {
      const contas = l.metaAdAccounts.map((c) => c.id);
      const cruas = await linhasDaLoja(contas, periodo);
      const n = cruas.length
        ? somar(
            cruas.map((c) => ({
              spendCents: c.spendCents,
              impressions: c.impressions,
              reach: c.reach,
              clicks: c.clicks,
              linkClicks: c.linkClicks,
              leads: c.leads,
            })),
          )
        : ZERO;
      const tipo = l.metaAdAccounts[0]?.leadActionType ?? "";
      return {
        loja: l.companyName,
        gestor: l.manager?.name ?? null,
        temContaVinculada: contas.length > 0,
        // Dizer que a leitura falhou importa tanto quanto o número: zero por
        // falha de leitura e zero por não ter rodado são coisas diferentes, e
        // sem isto o modelo trataria as duas como "foi mal".
        leituraComProblema:
          l.metaAdAccounts.some((c) => c.lastSyncError) || null,
        ...numerosLegiveis(n, tipo ? rotuloDoTipoDeLead(tipo) : "não configurado"),
        _cplOrdenar: custoPorLead(n),
        _gasto: n.spendCents,
      };
    }),
  );

  // Quem gastou e não trouxe nada vem primeiro: é o pior caso e é o que
  // ninguém vê sozinho. Depois, do custo mais caro pro mais barato. Quem não
  // gastou nada fica no fim — não é desempenho ruim, é loja parada.
  const ordenado = [...linhas].sort((a, b) => {
    const aSemNada = a._gasto > 0 && a._cplOrdenar === null;
    const bSemNada = b._gasto > 0 && b._cplOrdenar === null;
    if (aSemNada !== bSemNada) return aSemNada ? -1 : 1;
    if (a._gasto === 0 && b._gasto !== 0) return 1;
    if (b._gasto === 0 && a._gasto !== 0) return -1;
    return (b._cplOrdenar ?? 0) - (a._cplOrdenar ?? 0);
  });

  // ── O total, somado aqui e não pelo modelo ────────────────────────────
  //
  // "Quanto foi investido no total?" é uma das perguntas mais comuns, e sem
  // esta linha a resposta saía de o modelo somar a coluna de cabeça. Ele
  // quase sempre acerta — e "quase sempre" é inaceitável em dinheiro que vai
  // ser repetido pro cliente.
  //
  // A soma é das linhas CRUAS, não dos textos já formatados: somar
  // "R$ 1.234,56" de volta pra número seria desfazer o que acabou de ser
  // feito, e é onde entram os erros de centavo.
  const totalCents = linhas.reduce((soma, l) => soma + l._gasto, 0);
  const totalLeads = linhas.reduce((soma, l) => soma + l.resultados, 0);

  return {
    oQueFoi: `Desempenho de cada loja da carteira em ${periodo.rotulo}, da mais cara por resultado para a mais barata, com o total somado pelo sistema`,
    dados: {
      total: {
        lojas: linhas.length,
        investido: reais(totalCents),
        resultados: totalLeads,
        custoPorResultado:
          totalLeads > 0 ? reais(Math.round(totalCents / totalLeads)) : null,
        periodo: periodo.rotulo,
      },
      lojas: ordenado.map(({ _cplOrdenar, _gasto, ...resto }) => {
        void _cplOrdenar;
        void _gasto;
        return resto;
      }),
    },
  };
}

// ── 2. Uma loja em detalhe ───────────────────────────────────────────────

export async function desempenhoDeUmaLoja(
  user: QuemPergunta,
  args: { loja: string; periodo?: string },
): Promise<ResultadoDaConsulta> {
  const periodo = periodoDe(args.periodo);
  const lojas = await lojasDoUsuario(user);
  const loja = acharPorNome(lojas, args.loja ?? "");
  if (!loja) {
    return {
      oQueFoi: `Desempenho de ${args.loja}`,
      dados: null,
      aviso: `Não achei "${args.loja}" na sua carteira. As lojas que você acompanha são: ${lojas.map((l) => l.companyName).join(", ")}.`,
    };
  }

  const contas = loja.metaAdAccounts.map((c) => c.id);
  const cruas = await linhasDaLoja(contas, periodo);
  const n = cruas.length
    ? somar(
        cruas.map((c) => ({
          spendCents: c.spendCents,
          impressions: c.impressions,
          reach: c.reach,
          clicks: c.clicks,
          linkClicks: c.linkClicks,
          leads: c.leads,
        })),
      )
    : ZERO;

  const ritmo = await ritmoDaLoja(contas);
  const prePagas = loja.metaAdAccounts.filter((c) => c.isPrepay);
  const lidas = prePagas.filter((c) => c.balanceSnapshots[0]);
  const saldo =
    prePagas.length > 0 && lidas.length === prePagas.length
      ? lidas.reduce((s, c) => s + c.balanceSnapshots[0].availableCents, 0)
      : null;

  const veredito = avaliarLoja({
    temConta: contas.length > 0,
    saldoCents: saldo,
    temPrePaga: prePagas.length > 0,
    comErro: loja.metaAdAccounts.some((c) => c.lastSyncError),
    gastoRecenteCents: ritmo.gastoRecenteCents,
    diasComDado: ritmo.diasComDado,
    gastoMensalPrevistoCents: loja.gastoMensalPrevistoCents,
    gastoDoPeriodoCents: n.spendCents,
    leads: n.leads,
    pedido: loja.pedidosDeVerba[0] ?? null,
  });

  const tipo = loja.metaAdAccounts[0]?.leadActionType ?? "";
  return {
    oQueFoi: `Desempenho da ${loja.companyName} em ${periodo.rotulo}`,
    dados: {
      loja: loja.companyName,
      gestor: loja.manager?.name ?? null,
      periodo: periodo.rotulo,
      ...numerosLegiveis(n, tipo ? rotuloDoTipoDeLead(tipo) : "não configurado"),
      saldoDaConta: saldo === null ? null : saldoEmReais(saldo),
      diasQueOSaldoAindaDura: comoDias(veredito.diasDeSaldo),
      gastoPorDia:
        veredito.gastoDiarioCents === null
          ? null
          : reais(veredito.gastoDiarioCents),
      estadoDaLoja: veredito.tom,
      leituraComProblema:
        loja.metaAdAccounts.find((c) => c.lastSyncError)?.lastSyncError ?? null,
    },
  };
}

// ── 3. Campanhas, conjuntos e anúncios de uma loja ───────────────────────

export async function itensDaLoja(
  user: QuemPergunta,
  args: { loja: string; nivel?: "campanha" | "conjunto" | "anuncio"; periodo?: string },
): Promise<ResultadoDaConsulta> {
  const periodo = periodoDe(args.periodo);
  const nivel = args.nivel ?? "campanha";
  const lojas = await lojasDoUsuario(user);
  const loja = acharPorNome(lojas, args.loja ?? "");
  if (!loja) {
    return {
      oQueFoi: `${nivel}s da ${args.loja}`,
      dados: null,
      aviso: `Não achei "${args.loja}" na sua carteira. As lojas que você acompanha são: ${lojas.map((l) => l.companyName).join(", ")}.`,
    };
  }

  const contas = loja.metaAdAccounts.map((c) => c.id);
  const cruas = await linhasDaLoja(contas, periodo);
  const tipo = loja.metaAdAccounts[0]?.leadActionType ?? "";

  // Agrupa pelo nível pedido. É a mesma conta que a tela faz; aqui ela sai
  // em texto em vez de em tabela.
  const porChave = new Map<string, { nome: string; n: Numeros }>();
  for (const c of cruas) {
    const chave =
      nivel === "campanha"
        ? (c.campaignId ?? "sem-campanha")
        : nivel === "conjunto"
          ? c.adsetId
          : c.adId;
    const nome =
      nivel === "campanha"
        ? (c.campaignName ?? "Sem campanha")
        : nivel === "conjunto"
          ? c.adsetName
          : c.adName;
    const atual = porChave.get(chave) ?? { nome, n: { ...ZERO } };
    atual.n = somar([
      atual.n,
      {
        spendCents: c.spendCents,
        impressions: c.impressions,
        reach: c.reach,
        clicks: c.clicks,
        linkClicks: c.linkClicks,
        leads: c.leads,
      },
    ]);
    porChave.set(chave, atual);
  }

  // Quem está no ar, pra não recomendar pausar o que já está pausado.
  const criativos =
    nivel === "anuncio" && contas.length
      ? await prisma.metaAdCreative.findMany({
          where: { adAccountId: { in: contas } },
          select: { adId: true, effectiveStatus: true, status: true },
        })
      : [];
  const porAd = new Map(criativos.map((c) => [c.adId, c]));

  const lista = [...porChave.entries()]
    .map(([id, { nome, n }]) => {
      const c = porAd.get(id);
      const v = c ? veiculacaoDe(c.effectiveStatus, c.status) : null;
      return {
        id,
        nome,
        ...numerosLegiveis(n, tipo ? rotuloDoTipoDeLead(tipo) : "não configurado"),
        veiculacao: v?.rotulo ?? null,
        porQue: v?.explicacao ?? null,
        _gasto: n.spendCents,
      };
    })
    .sort((a, b) => b._gasto - a._gasto);

  return {
    oQueFoi: `${nivel === "campanha" ? "Campanhas" : nivel === "conjunto" ? "Conjuntos" : "Anúncios"} da ${loja.companyName} em ${periodo.rotulo}, do que mais gastou pro que menos gastou`,
    dados: lista.map(({ _gasto, ...resto }) => {
      void _gasto;
      return resto;
    }),
  };
}

// ── 4. Onde o dinheiro está sendo queimado ───────────────────────────────

/**
 * Anúncios que gastaram e não trouxeram resultado nenhum.
 *
 * O mínimo de gasto existe porque R$ 4,00 sem lead não é desperdício, é
 * amostra pequena — e uma lista cheia desses esconde os três que importam.
 */
export async function desperdicio(
  user: QuemPergunta,
  args: { loja?: string; periodo?: string; minimoReais?: number },
): Promise<ResultadoDaConsulta> {
  const periodo = periodoDe(args.periodo);
  const minimo = Math.round((args.minimoReais ?? 50) * 100);
  const todas = await lojasDoUsuario(user);
  const lojas = args.loja
    ? [acharPorNome(todas, args.loja)].filter((l): l is LojaDoUsuario => !!l)
    : todas;

  if (args.loja && lojas.length === 0) {
    return {
      oQueFoi: `Desperdício na ${args.loja}`,
      dados: null,
      aviso: `Não achei "${args.loja}" na sua carteira.`,
    };
  }

  const achados: unknown[] = [];
  for (const loja of lojas) {
    const contas = loja.metaAdAccounts.map((c) => c.id);
    if (contas.length === 0) continue;
    const cruas = await linhasDaLoja(contas, periodo);

    const porAnuncio = new Map<string, { nome: string; campanha: string | null; n: Numeros }>();
    for (const c of cruas) {
      const atual = porAnuncio.get(c.adId) ?? {
        nome: c.adName,
        campanha: c.campaignName ?? null,
        n: { ...ZERO },
      };
      atual.n = somar([
        atual.n,
        {
          spendCents: c.spendCents,
          impressions: c.impressions,
          reach: c.reach,
          clicks: c.clicks,
          linkClicks: c.linkClicks,
          leads: c.leads,
        },
      ]);
      porAnuncio.set(c.adId, atual);
    }

    const criativos = await prisma.metaAdCreative.findMany({
      where: { adAccountId: { in: contas } },
      select: { adId: true, effectiveStatus: true, status: true },
    });
    const porAd = new Map(criativos.map((c) => [c.adId, c]));

    for (const [adId, { nome, campanha, n }] of porAnuncio) {
      if (n.leads > 0 || n.spendCents < minimo) continue;
      const c = porAd.get(adId);
      const v = c ? veiculacaoDe(c.effectiveStatus, c.status) : null;
      achados.push({
        loja: loja.companyName,
        anuncioId: adId,
        anuncio: nome,
        campanha,
        investido: reais(n.spendCents),
        resultados: 0,
        cliquesNoLink: n.linkClicks,
        impressoes: n.impressions,
        veiculacao: v?.rotulo ?? null,
        // Se já está pausado, não é desperdício de agora — é histórico.
        jaEstaPausado: v ? v.gravidade === "parado" : null,
        _gasto: n.spendCents,
      });
    }
  }

  const ordenado = (achados as { _gasto: number }[]).sort(
    (a, b) => b._gasto - a._gasto,
  );

  return {
    oQueFoi: `Anúncios que gastaram mais de ${reais(minimo)} em ${periodo.rotulo} e não trouxeram nenhum resultado`,
    dados: ordenado.map(({ _gasto, ...resto }) => {
      void _gasto;
      return resto;
    }),
    aviso:
      ordenado.length === 0
        ? "Nenhum anúncio se encaixa — o que gastou, trouxe resultado."
        : undefined,
  };
}

// ── 5. Comparar dois períodos ────────────────────────────────────────────

export async function compararPeriodos(
  user: QuemPergunta,
  args: { loja: string; periodo?: string; contra?: string },
): Promise<ResultadoDaConsulta> {
  const lojas = await lojasDoUsuario(user);
  const loja = acharPorNome(lojas, args.loja ?? "");
  if (!loja) {
    return {
      oQueFoi: `Comparação da ${args.loja}`,
      dados: null,
      aviso: `Não achei "${args.loja}" na sua carteira.`,
    };
  }

  const agora = periodoDe(args.periodo);
  // Sem um segundo período pedido, "contra" é a janela imediatamente
  // anterior, do mesmo tamanho. Não dá pra pedir isso a lerIntervalo: ele só
  // conhece atalhos com nome ("7", "mes-passado"), e qualquer palavra que ele
  // não reconheça cai no padrão — o que faria a comparação ser dos mesmos
  // sete dias contra eles mesmos, com variação de 0% em tudo e nenhum aviso.
  const antes = args.contra ? periodoDe(args.contra) : janelaAnterior(agora);

  const contas = loja.metaAdAccounts.map((c) => c.id);
  const tipo = loja.metaAdAccounts[0]?.leadActionType ?? "";

  async function numerosDe(p: Intervalo) {
    const cruas = await linhasDaLoja(contas, p);
    return cruas.length
      ? somar(
          cruas.map((c) => ({
            spendCents: c.spendCents,
            impressions: c.impressions,
            reach: c.reach,
            clicks: c.clicks,
            linkClicks: c.linkClicks,
            leads: c.leads,
          })),
        )
      : ZERO;
  }

  const [a, b] = await Promise.all([numerosDe(agora), numerosDe(antes)]);
  const rotulo = tipo ? rotuloDoTipoDeLead(tipo) : "não configurado";

  // A variação é calculada AQUI e entregue pronta. Pedir pro modelo dividir
  // dois números é pedir pra ele errar uma conta que o sistema já sabe fazer.
  const variacao = (depois: number, antes2: number) =>
    antes2 === 0 ? null : `${(((depois - antes2) / antes2) * 100).toFixed(1)}%`;

  return {
    oQueFoi: `${loja.companyName}: ${agora.rotulo} comparado com ${antes.rotulo}`,
    dados: {
      loja: loja.companyName,
      agora: { periodo: agora.rotulo, ...numerosLegiveis(a, rotulo) },
      antes: { periodo: antes.rotulo, ...numerosLegiveis(b, rotulo) },
      variacao: {
        investido: variacao(a.spendCents, b.spendCents),
        resultados: variacao(a.leads, b.leads),
        custoPorResultado:
          custoPorLead(a) !== null && custoPorLead(b) !== null
            ? variacao(custoPorLead(a)!, custoPorLead(b)!)
            : null,
        alcance: variacao(a.reach, b.reach),
      },
    },
  };
}

// ── 6. Saldo das contas ──────────────────────────────────────────────────

export async function saldoDasLojas(
  user: QuemPergunta,
): Promise<ResultadoDaConsulta> {
  const lojas = await lojasDoUsuario(user);
  const linhas = await Promise.all(
    lojas
      .filter((l) => l.metaAdAccounts.some((c) => c.isPrepay))
      .map(async (l) => {
        const contas = l.metaAdAccounts.map((c) => c.id);
        const prePagas = l.metaAdAccounts.filter((c) => c.isPrepay);
        const lidas = prePagas.filter((c) => c.balanceSnapshots[0]);
        const saldo =
          lidas.length === prePagas.length
            ? lidas.reduce((s, c) => s + c.balanceSnapshots[0].availableCents, 0)
            : null;
        const ritmo = await ritmoDaLoja(contas);
        const v = avaliarLoja({
          temConta: contas.length > 0,
          saldoCents: saldo,
          temPrePaga: true,
          comErro: l.metaAdAccounts.some((c) => c.lastSyncError),
          gastoRecenteCents: ritmo.gastoRecenteCents,
          diasComDado: ritmo.diasComDado,
          gastoMensalPrevistoCents: l.gastoMensalPrevistoCents,
          gastoDoPeriodoCents: 0,
          leads: 0,
          pedido: l.pedidosDeVerba[0] ?? null,
        });
        return {
          loja: l.companyName,
          saldo: saldo === null ? "não foi lido" : saldoEmReais(saldo),
          dura: comoDias(v.diasDeSaldo),
          gastoPorDia:
            v.gastoDiarioCents === null ? null : reais(v.gastoDiarioCents),
          estado: v.tom,
          jaFoiCobrada: v.pedido === "aguardando",
          cobrancaVencida: v.pedido === "vencido",
          _dias: v.diasExatos ?? 999,
        };
      }),
  );

  return {
    oQueFoi: "Saldo das contas pré-pagas, da que acaba primeiro pra que dura mais",
    dados: linhas
      .sort((a, b) => a._dias - b._dias)
      .map(({ _dias, ...resto }) => {
        void _dias;
        return resto;
      }),
    aviso:
      linhas.length === 0
        ? "Nenhuma loja da sua carteira usa conta pré-paga."
        : undefined,
  };
}

// ── 7. O que já foi mexido ───────────────────────────────────────────────

export async function acoesRecentes(
  user: QuemPergunta,
  args: { loja?: string; quantas?: number },
): Promise<ResultadoDaConsulta> {
  const lojas = await lojasDoUsuario(user);
  const alvo = args.loja ? acharPorNome(lojas, args.loja) : null;
  if (args.loja && !alvo) {
    return {
      oQueFoi: `Mudanças na ${args.loja}`,
      dados: null,
      aviso: `Não achei "${args.loja}" na sua carteira.`,
    };
  }

  const ids = alvo ? [alvo.id] : lojas.map((l) => l.id);
  const linhas = await prisma.metaAcao.findMany({
    where: { clientId: { in: ids } },
    orderBy: { criadoEm: "desc" },
    take: Math.min(args.quantas ?? 20, 50),
    select: {
      criadoEm: true,
      nivel: true,
      nome: true,
      tipo: true,
      statusPedido: true,
      ok: true,
      erro: true,
      origem: true,
      pedidoPor: true,
      quem: { select: { name: true } },
      client: { select: { companyName: true } },
    },
  });

  return {
    oQueFoi: alvo
      ? `Últimas mudanças feitas pelo sistema na ${alvo.companyName}`
      : "Últimas mudanças feitas pelo sistema na carteira",
    dados: linhas.map((l) => ({
      quando: l.criadoEm.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      }),
      loja: l.client.companyName,
      oQue: l.tipo,
      nivel: l.nivel,
      item: l.nome,
      pedido: l.statusPedido,
      deuCerto: l.ok,
      erro: l.erro,
      quem:
        l.origem === "whatsapp"
          ? `robô do WhatsApp (${l.pedidoPor ?? "grupo"})`
          : (l.quem?.name ?? "sistema"),
    })),
    aviso: linhas.length === 0 ? "Nada foi mexido ainda." : undefined,
  };
}

// ── O catálogo, que é o que o modelo enxerga ─────────────────────────────

export const CONSULTAS = {
  desempenho_das_lojas: desempenhoDasLojas,
  desempenho_de_uma_loja: desempenhoDeUmaLoja,
  itens_da_loja: itensDaLoja,
  desperdicio,
  comparar_periodos: compararPeriodos,
  saldo_das_lojas: saldoDasLojas,
  acoes_recentes: acoesRecentes,
} as const;

export type NomeDaConsulta = keyof typeof CONSULTAS;

export async function rodarConsulta(
  user: QuemPergunta,
  nome: NomeDaConsulta,
  args: Record<string, unknown>,
): Promise<ResultadoDaConsulta> {
  const fn = CONSULTAS[nome];
  if (!fn) {
    return {
      oQueFoi: String(nome),
      dados: null,
      aviso: "Essa consulta não existe.",
    };
  }
  // O `as never` existe porque cada consulta tem a sua forma de argumento e
  // quem escolhe é o modelo. Os argumentos são validados DENTRO de cada uma
  // — nome de loja que não existe vira aviso, não exceção.
  return fn(user, args as never);
}
