// A cor de cada loja na lista.
//
// ── Cor que informa, não cor que enfeita ──────────────────────────────────
//
// A tentação, quando alguém pede "mais visual", é pintar. Mas num sistema que
// alguém abre quarenta vezes por dia, cor sem significado é ruído: depois de
// uma semana o olho ignora tudo, inclusive o que importava.
//
// Então aqui cada cor quer dizer uma coisa, e sempre a mesma:
//
//   vermelho — está acabando o dinheiro, a campanha vai parar
//   âmbar    — tem algo pra olhar: gastou sem lead, ou a leitura falhou
//   verde    — está rodando e entregando
//   cinza    — não tem conta vinculada; não é bom nem ruim, é vazio
//
// Quem abre a tela e vê uma faixa vermelha já sabe o que fazer antes de ler
// qualquer número. É esse o trabalho da cor.

import { SALDO_CRITICO, SALDO_BAIXO } from "./saldo";

export type TomDaLoja = "critico" | "atencao" | "bom" | "neutro";

export interface SinaisDaLoja {
  temConta: boolean;
  /** Saldo somado das contas pré-pagas, ou null se não deu pra ler. */
  saldoCents: number | null;
  /** Existe conta pré-paga? Conta no cartão não tem saldo a acompanhar. */
  temPrePaga: boolean;
  /** Alguma conta com erro na última leitura. */
  comErro: boolean;
  gastoCents: number;
  leads: number;
}

export function tomDaLoja(s: SinaisDaLoja): TomDaLoja {
  if (!s.temConta) return "neutro";

  // Dinheiro acabando ganha de tudo: é o único que PARA a campanha sozinho.
  if (s.temPrePaga && s.saldoCents !== null && s.saldoCents < SALDO_CRITICO) return "critico";

  // Erro é âmbar e não vermelho de propósito: vermelho quer dizer "a loja
  // está em apuros". Erro quer dizer "o sistema não sabe" — é problema
  // nosso, não dela, e confundir os dois faria o vermelho perder o sentido.
  if (s.comErro) return "atencao";
  if (s.temPrePaga && s.saldoCents !== null && s.saldoCents < SALDO_BAIXO) return "atencao";
  // Gastou e não entregou nada.
  if (s.gastoCents > 0 && s.leads === 0) return "atencao";

  return "bom";
}

/** A faixa colorida na beirada esquerda do cartão da loja. */
export const FAIXA_DA_LOJA: Record<TomDaLoja, string> = {
  critico: "bg-red-500",
  atencao: "bg-amber-500",
  bom: "bg-emerald-500",
  neutro: "bg-border-forte",
};

/** Etiqueta de estado, pra quem não distingue bem as cores. */
export const ETIQUETA_DA_LOJA: Record<TomDaLoja, { texto: string; classe: string } | null> = {
  critico: {
    texto: "Saldo acabando",
    classe: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  },
  atencao: {
    texto: "Olhar",
    classe: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  // Sem etiqueta: o normal não precisa de selo. Etiqueta em tudo é etiqueta
  // em nada — e a lista inteira verde vira ruído igual à lista inteira sem
  // cor.
  bom: null,
  neutro: null,
};
