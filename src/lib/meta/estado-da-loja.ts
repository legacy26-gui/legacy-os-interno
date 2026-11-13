// Quando o saldo de uma loja preocupa — e quanto.
//
// ── Por que valor fixo não serve ──────────────────────────────────────────
//
// A primeira versão disto dizia "abaixo de R$ 50 é crítico". Está errado, e
// foi o Guilherme quem apontou: algumas lojas gastam R$ 300 no mês, outras
// gastam R$ 3.000. R$ 100 é uma semana pra primeira e meio dia pra segunda.
// Com régua fixa, ou a lista vive vermelha pra quem gasta muito, ou nunca
// avisa quem gasta pouco.
//
// A régua certa é DIAS DE SALDO: quanto tempo o dinheiro ainda dura no ritmo
// daquela loja. Isso se calibra sozinho, e é a pergunta que alguém de fato
// faz quando olha a tela — "quando essa conta para?".
//
// ── De onde sai o ritmo ──────────────────────────────────────────────────
//
// Do gasto REAL dos últimos dias, que o sistema já guarda. É melhor que
// qualquer número combinado, porque acompanha a realidade: loja que
// acelerou na Black Friday passa a ser medida pelo ritmo da Black Friday.
//
// Quando não há gasto nenhum pra olhar — loja nova, ou que ficou parada —
// usa o gasto mensal previsto, que é combinado com o cliente. E quando não
// há nem um nem outro, não dá pra falar em dias: aí a tela diz só o valor,
// sem fingir que sabe se é pouco ou muito.

import type { TomDaLoja } from "./tons";

export type { TomDaLoja };

/** Quantos dias de gasto o sistema olha pra calcular o ritmo. */
export const DIAS_DO_RITMO = 14;

// ── Onde ficam os cortes, e por que aqui ─────────────────────────────────
//
// A loja abastece POR SEMANA. Isso muda tudo: sete dias de saldo não é
// alerta, é o tanque cheio. A primeira versão disto avisava abaixo de sete
// dias, e o Guilherme viu na hora o que ia acontecer — a lista ficaria
// amarela quase a semana inteira, todo mundo se acostumaria com o amarelo, e
// aí ele não avisaria mais nada.
//
// Então o corte não é "pouco saldo". É "não chega no próximo abastecimento".
// Num ciclo de sete dias, isso são os dois últimos: um dia de amarelo pra
// cobrar o Pix, um de vermelho se ele não veio.
//
// Se um dia alguma loja passar a abastecer por mês, estes números continuam
// valendo — ela só ficaria verde por muito mais tempo, que é o certo.

/** Abaixo disto a conta para hoje. */
export const DIAS_SEM_SALDO = 1;
/** Abaixo disto o Pix já está atrasado. */
export const DIAS_ACABANDO = 2;
/** Abaixo disto é hora de cobrar o Pix da semana. */
export const DIAS_ATENCAO = 3;

/**
 * Saldo tão baixo que não vale calcular dias.
 *
 * Cinco reais é menos que um dia de qualquer conta que roda de verdade, e
 * evita o caso bobo de uma loja parada com R$ 3 aparecer como "30 dias de
 * saldo" porque o gasto diário também é quase zero.
 */
export const SALDO_RESIDUAL_CENTS = 500;

export interface SinaisDaLoja {
  temConta: boolean;
  /** Saldo somado das contas pré-pagas, ou null se não deu pra ler. */
  saldoCents: number | null;
  /** Existe conta pré-paga? Conta no cartão não tem saldo a acompanhar. */
  temPrePaga: boolean;
  /** Alguma conta com erro na última leitura. */
  comErro: boolean;
  /** Gasto somado nos últimos DIAS_DO_RITMO dias. */
  gastoRecenteCents: number;
  /** Quantos dias desse período têm dado. Menos que isso distorce a média. */
  diasComDado: number;
  /** O combinado com o cliente, quando houver. */
  gastoMensalPrevistoCents: number | null;
  /** Do período que a tela está mostrando — pro aviso de "gastou sem lead". */
  gastoDoPeriodoCents: number;
  leads: number;
}

export interface Veredito {
  tom: TomDaLoja;
  /** Quantos dias o saldo ainda dura. Null quando não dá pra saber. */
  diasDeSaldo: number | null;
  /** O ritmo usado, em centavos por dia. Null quando não há de onde tirar. */
  gastoDiarioCents: number | null;
  /** De onde veio o ritmo — a tela diz isso, pra ninguém confiar demais. */
  origemDoRitmo: "gasto-real" | "combinado" | null;
}

/**
 * Quanto a loja gasta por dia.
 *
 * Divide pelos dias QUE TÊM DADO, não pelos 14: loja vinculada há três dias
 * teria o ritmo dividido por 14 e pareceria gastar cinco vezes menos do que
 * gasta — e aí o saldo pareceria durar cinco vezes mais.
 */
export function gastoDiario(s: SinaisDaLoja): {
  cents: number | null;
  origem: Veredito["origemDoRitmo"];
} {
  if (s.gastoRecenteCents > 0 && s.diasComDado > 0) {
    return { cents: Math.round(s.gastoRecenteCents / s.diasComDado), origem: "gasto-real" };
  }
  if (s.gastoMensalPrevistoCents && s.gastoMensalPrevistoCents > 0) {
    return { cents: Math.round(s.gastoMensalPrevistoCents / 30), origem: "combinado" };
  }
  return { cents: null, origem: null };
}

export function avaliarLoja(s: SinaisDaLoja): Veredito {
  const { cents: gastoDiarioCents, origem } = gastoDiario(s);

  if (!s.temConta) {
    return { tom: "neutro", diasDeSaldo: null, gastoDiarioCents, origemDoRitmo: origem };
  }

  const semSaldoNenhum =
    s.temPrePaga && s.saldoCents !== null && s.saldoCents < SALDO_RESIDUAL_CENTS;

  const dias =
    s.temPrePaga && s.saldoCents !== null && gastoDiarioCents && gastoDiarioCents > 0
      ? s.saldoCents / gastoDiarioCents
      : null;

  const pronto = (tom: TomDaLoja): Veredito => ({
    tom,
    diasDeSaldo: dias === null ? null : Math.floor(dias),
    gastoDiarioCents,
    origemDoRitmo: origem,
  });

  // Conta zerada ganha de tudo: é a única coisa que PARA a campanha sozinha,
  // hoje, sem aviso.
  if (semSaldoNenhum) return pronto("sem-saldo");
  if (dias !== null && dias < DIAS_SEM_SALDO) return pronto("sem-saldo");
  if (dias !== null && dias < DIAS_ACABANDO) return pronto("acabando");

  // Erro é âmbar e não vermelho de propósito: vermelho quer dizer "a loja
  // está em apuros", erro quer dizer "o sistema não sabe". É problema nosso,
  // não dela, e confundir os dois faz o vermelho perder o sentido.
  if (s.comErro) return pronto("atencao");
  if (dias !== null && dias < DIAS_ATENCAO) return pronto("atencao");
  if (s.gastoDoPeriodoCents > 0 && s.leads === 0) return pronto("atencao");

  // Conta de Pix cujo saldo ninguém conseguiu ler ainda fica CINZA, não verde.
  // Verde é uma afirmação — "olhei e está tudo bem" — e aqui o sistema não
  // olhou. Pintar de verde o que não se sabe é a mesma mentira de escrever
  // R$ 0,00 no lugar de "indisponível", só que mais difícil de perceber.
  if (s.temPrePaga && s.saldoCents === null) return pronto("neutro");

  return pronto("bom");
}

/** "2 dias", "menos de 1 dia", "18 dias" — do jeito que se fala. */
export function comoDias(dias: number | null): string | null {
  if (dias === null) return null;
  if (dias < 1) return "menos de 1 dia";
  if (dias === 1) return "1 dia";
  if (dias > 60) return "mais de 60 dias";
  return `${dias} dias`;
}
