// Quando um anúncio parou de funcionar.
//
// ── O que acontece de verdade ─────────────────────────────────────────────
//
// Anúncio não morre de uma vez. Ele vai cansando: as mesmas pessoas veem a
// mesma arte pela quinta vez, param de clicar, e o custo por lead sobe devagar
// — R$ 12, R$ 14, R$ 17, R$ 23. Ninguém percebe de um dia pro outro. Percebe
// três semanas depois, quando a loja reclama que não chega mais ninguém.
//
// É a coisa mais óbvia do mundo olhando o gráfico, e invisível olhando o
// número de hoje. Por isso é trabalho de sistema, não de gente.
//
// ── Como a conta funciona ─────────────────────────────────────────────────
//
// Compara os últimos dias com os dias ANTERIORES a eles, do mesmo anúncio:
//
//   agora:  [-------- 7 dias --------]
//   antes:  [-- 7 dias --]
//
// Se o custo por lead subiu muito, ou se o CTR despencou, o anúncio está
// cansando. Duas janelas do mesmo tamanho pra que o número não dependa de a
// semana ter sido boa ou ruim — o que se mede é a MUDANÇA.
//
// ── O que impede alarme falso ─────────────────────────────────────────────
//
// Volume mínimo nas duas janelas. Um anúncio que teve 1 lead e passou a ter 0
// "dobrou de custo" na matemática e não quer dizer nada. Sem esse piso, a
// tela viraria um varal de avisos inúteis e ninguém olharia mais nenhum.

import { custoPorLead, ctr, type Numeros } from "./insights";

/**
 * O aviso está ligado?
 *
 * Desligado em 17/11/2026, a pedido do Guilherme: "ainda não está legal".
 *
 * ── Por que um interruptor e não apagar o código ─────────────────────────
 *
 * Porque a conta em si não é o problema — a ideia de comparar sete dias com
 * os sete anteriores está certa, e os testes dela continuam valendo. O que
 * não está bom é a régua: o que conta como "cansado", quanto de volume
 * exigir antes de abrir a boca, e provavelmente quantos avisos aparecem de
 * uma vez. Apagar jogaria fora a parte boa junto com a que precisa de
 * ajuste.
 *
 * O que ele desliga é a APARIÇÃO: a etiqueta na linha do anúncio e a lista
 * do Meu Dia. O diagnóstico continua sendo calculado — fica em memória, não
 * aparece — porque é ele que vai permitir calibrar a régua com dado real em
 * vez de no chute.
 *
 * Pra religar: `true` aqui, e só aqui.
 */
export const AVISOS_DE_CANSACO_LIGADOS = false;

/** O tamanho de cada janela. Sete dias pega a semana inteira de uma vez. */
export const DIAS_DA_JANELA = 7;

/** Abaixo disso em cada janela, a conta não tem base pra nada. */
export const MINIMO_DE_LEADS = 3;
export const MINIMO_DE_IMPRESSOES = 500;

/** O custo por lead subiu mais que isso: cansou. */
export const SUBIDA_DO_CUSTO = 0.4;

/** O CTR caiu mais que isso e o custo não melhorou: cansou. */
export const QUEDA_DO_CTR = 0.3;

export type EstadoDoCriativo =
  /** Custo por lead disparou ou o CTR desabou. Hora de trocar a arte. */
  | "cansado"
  /** Piorou, mas ainda não o bastante pra gritar. */
  | "cansando"
  /** Está igual ou melhor. */
  | "firme"
  /** Não há volume pra dizer nada. É diferente de "está bem". */
  | "sem-base";

export interface Diagnostico {
  estado: EstadoDoCriativo;
  /** Quanto o custo por lead mudou: 0,5 = subiu 50%. Negativo = melhorou. */
  variacaoDoCusto: number | null;
  /** Quanto o CTR mudou. Negativo = caiu. */
  variacaoDoCtr: number | null;
  custoAgoraCents: number | null;
  custoAntesCents: number | null;
}

const SEM_BASE: Diagnostico = {
  estado: "sem-base",
  variacaoDoCusto: null,
  variacaoDoCtr: null,
  custoAgoraCents: null,
  custoAntesCents: null,
};

/**
 * Compara as duas janelas de um anúncio.
 *
 * `agora` são os últimos DIAS_DA_JANELA dias; `antes`, os DIAS_DA_JANELA
 * anteriores a esses. Quem separa as linhas é quem chama — aqui só entra a
 * conta, pra poder ser testada sem banco.
 */
export function diagnosticar(agora: Numeros, antes: Numeros): Diagnostico {
  const semVolume =
    agora.impressions < MINIMO_DE_IMPRESSOES || antes.impressions < MINIMO_DE_IMPRESSOES;
  if (semVolume) return SEM_BASE;

  const ctrAgora = ctr(agora);
  const ctrAntes = ctr(antes);
  const variacaoDoCtr =
    ctrAgora !== null && ctrAntes !== null && ctrAntes > 0 ? ctrAgora / ctrAntes - 1 : null;

  const custoAgora = custoPorLead(agora);
  const custoAntes = custoPorLead(antes);

  // Leads de menos: o custo por lead não serve, mas o CTR ainda serve — ele
  // vem das impressões, que sobram. Anúncio que parou de ser clicado é sinal
  // mesmo sem nenhum lead pra contar.
  const poucosLeads = agora.leads < MINIMO_DE_LEADS || antes.leads < MINIMO_DE_LEADS;

  if (poucosLeads || custoAgora === null || custoAntes === null || custoAntes === 0) {
    if (variacaoDoCtr === null) return SEM_BASE;
    return {
      estado:
        variacaoDoCtr <= -QUEDA_DO_CTR
          ? "cansado"
          : variacaoDoCtr <= -QUEDA_DO_CTR / 2
            ? "cansando"
            : "sem-base",
      variacaoDoCusto: null,
      variacaoDoCtr,
      custoAgoraCents: custoAgora,
      custoAntesCents: custoAntes,
    };
  }

  const variacaoDoCusto = custoAgora / custoAntes - 1;

  // Cansou se o custo disparou, OU se o clique sumiu enquanto o custo não
  // melhorava. O "e não melhorou" importa: CTR caindo com custo caindo junto
  // é campanha achando um público melhor, não arte gasta.
  const estado: EstadoDoCriativo =
    variacaoDoCusto >= SUBIDA_DO_CUSTO ||
    (variacaoDoCtr !== null && variacaoDoCtr <= -QUEDA_DO_CTR && variacaoDoCusto > 0)
      ? "cansado"
      : variacaoDoCusto >= SUBIDA_DO_CUSTO / 2
        ? "cansando"
        : "firme";

  return {
    estado,
    variacaoDoCusto,
    variacaoDoCtr,
    custoAgoraCents: custoAgora,
    custoAntesCents: custoAntes,
  };
}

/** "subiu 62%", "caiu 18%", "igual". */
export function comoVariacao(v: number | null): string | null {
  if (v === null) return null;
  const pct = Math.round(Math.abs(v) * 100);
  if (pct < 3) return "igual";
  return v > 0 ? `subiu ${pct}%` : `caiu ${pct}%`;
}

export const ETIQUETA_DO_CRIATIVO: Record<EstadoDoCriativo, { texto: string; classe: string } | null> =
  AVISOS_DE_CANSACO_LIGADOS
    ? {
        cansado: {
          texto: "Arte cansada",
          classe:
            "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/60",
        },
        cansando: {
          texto: "Cansando",
          classe:
            "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/60",
        },
        firme: null,
        "sem-base": null,
      }
    : // Desligado: nenhum estado tem etiqueta, então a linha do anúncio não
      // mostra nada. Quem desenha a tela já trata null — não precisou de um
      // "if" novo em lugar nenhum.
      { cansado: null, cansando: null, firme: null, "sem-base": null };
