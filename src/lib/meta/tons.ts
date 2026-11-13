// As cores que a lista de lojas usa, e o que cada uma quer dizer.
//
// Mora separado da regra (estado-da-loja.ts) por um motivo prático: a regra é
// discutível e vai mudar — quantos dias são "acabando" é conversa de time. O
// vocabulário de cor não: vermelho forte é "parou ou para hoje", vermelho
// fraco é "resolve essa semana", âmbar é "olha quando puder", verde é "sem
// novidade". Separados, muda-se um sem mexer no outro.
//
// Só quatro níveis, e não cinco ou seis: tela em que tudo é colorido não tem
// cor nenhuma. Loja em paz fica cinza de propósito, pra que o vermelho da
// vizinha salte.

export type TomDaLoja = "sem-saldo" | "acabando" | "aguardando" | "atencao" | "bom" | "neutro";

/**
 * A faixa vertical na beirada esquerda do cartão.
 *
 * É o que se vê antes de ler qualquer coisa, e de longe: quem passa o olho na
 * lista conta quantas faixas vermelhas tem sem ler uma palavra.
 */
export const FAIXA_DA_LOJA: Record<TomDaLoja, string> = {
  "sem-saldo": "bg-red-600",
  acabando: "bg-red-400 dark:bg-red-500/80",
  // Azul e não verde: a conta continua zerada, isso é fato. O que mudou é que
  // alguém já tratou dela — e essa é outra informação, não "está tudo bem".
  aguardando: "bg-sky-500",
  atencao: "bg-amber-500",
  bom: "bg-emerald-500",
  neutro: "bg-border-forte",
};

/**
 * O fundo e a borda do cartão inteiro.
 *
 * Só quem está em apuros ganha fundo colorido. A diferença entre "sem saldo" e
 * "acabando" tem que se enxergar SEM ler: o primeiro é vermelho de verdade, o
 * segundo é um rosa de fundo — mesmo alfabeto, volume diferente.
 *
 * As duas cores são dadas em /10 e /5 e não em tom fixo justamente pra
 * funcionarem nos dois temas: sobre branco viram rosa claro, sobre o fundo
 * escuro viram vinho. Tom fixo acerta um tema e desaparece no outro — já
 * aconteceu nesta tela.
 */
export const FUNDO_DA_LOJA: Record<TomDaLoja, string> = {
  "sem-saldo": "bg-red-500/10 border-red-500",
  acabando: "bg-red-500/5 border-red-400 dark:border-red-500/70",
  aguardando: "bg-sky-500/5 border-sky-500/50",
  atencao: "bg-surface border-amber-500/50",
  bom: "bg-surface border-border-forte",
  neutro: "bg-surface border-border-forte",
};

export interface Etiqueta {
  texto: string;
  classe: string;
}

/**
 * A pílula ao lado do nome da loja.
 *
 * Existe porque cor sozinha não informa: quem é daltônico não vê, e quem é
 * novo na casa não sabe o que o vermelho quer dizer. O texto diz.
 *
 * `null` pra loja em paz: etiqueta "OK" em quarenta linhas é ruído, e faz as
 * três que importam desaparecerem no meio.
 */
export const ETIQUETA_DA_LOJA: Record<TomDaLoja, Etiqueta | null> = {
  "sem-saldo": {
    texto: "Sem saldo",
    classe: "bg-red-600 text-white border-red-600",
  },
  acabando: {
    texto: "Saldo acabando",
    classe: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/60",
  },
  aguardando: {
    texto: "Link enviado",
    classe: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/60",
  },
  atencao: {
    texto: "Olhar",
    classe: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/60",
  },
  bom: null,
  neutro: null,
};

/** A cor do próprio número do saldo. */
export const COR_DO_NUMERO: Record<TomDaLoja, string> = {
  "sem-saldo": "text-red-600 dark:text-red-400",
  acabando: "text-red-600 dark:text-red-400",
  aguardando: "text-sky-700 dark:text-sky-300",
  atencao: "text-amber-700 dark:text-amber-400",
  bom: "text-foreground",
  neutro: "text-foreground",
};
