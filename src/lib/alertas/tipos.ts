import type { Empresa } from "@/generated/prisma/enums";
import type { ModuleKey } from "@/lib/permissions";

// O que é um alerta, e como ele aparece na tela.
//
// Sem "server-only" de propósito: a tela de Alertas, o sininho e o servidor
// precisam dos mesmos rótulos e das mesmas cores, senão o mesmo problema
// aparece "vermelho" num lugar e "amarelo" no outro. A consulta ao banco mora
// em calcular.ts, que é só do servidor.

export const TIPOS_DE_ALERTA = [
  "venda-parada",
  "gravacao-atrasada",
  "mensalidade-vencida",
  "implantacao-parada",
] as const;

export type TipoDeAlerta = (typeof TIPOS_DE_ALERTA)[number];

/**
 * A gravidade, em três degraus. É número e não cor porque é ele que decide se
 * o celular vibra: o aviso só sai quando o problema PIORA de degrau. Sem isso,
 * loja parada há três semanas vibraria o celular todo dia até alguém desligar
 * a notificação — e aí o sistema perde a voz pra sempre.
 */
export type NivelDeAlerta = 1 | 2 | 3;

export type TomDoAlerta = "amarelo" | "vermelho" | "critico";

export const TOM_POR_NIVEL: Record<NivelDeAlerta, TomDoAlerta> = {
  1: "amarelo",
  2: "vermelho",
  3: "critico",
};

export interface Alerta {
  /**
   * A identidade do problema. O MESMO problema tem que dar a MESMA chave
   * amanhã — é ela que lembra que este alerta já foi avisado e que a pessoa
   * pediu pra lembrar depois. Por isso nunca entra data nem contagem aqui.
   */
  chave: string;
  tipo: TipoDeAlerta;
  /** De qual empresa do grupo é o problema. Trava quem pode receber. */
  empresa: Empresa;
  titulo: string;
  detalhe: string | null;
  nivel: NivelDeAlerta;
  /** Onde se resolve. Alerta sem caminho de resolver é só reclamação. */
  link: string;
  /**
   * O módulo da tela do link. É a trava que impede avisar alguém sobre uma
   * tela que ela não pode abrir — alerta que leva pra porta trancada é pior
   * que alerta nenhum.
   */
  modulo: ModuleKey;
  /** Dias que o problema já tem. Ordena a lista: o mais velho primeiro. */
  dias: number;
}

/** O alerta já com o que é de cada pessoa: silenciado, novo, já visto. */
export interface AlertaNaTela extends Alerta {
  /** Verdadeiro enquanto a pessoa pediu pra lembrar depois. */
  silenciado: boolean;
  /** dd/mm até quando está silenciado, pra tela poder dizer. */
  silenciadoAte: string | null;
  /** Nunca foi pro celular ainda nesta gravidade. */
  novo: boolean;
}

export const ROTULO_DO_TIPO: Record<TipoDeAlerta, string> = {
  "venda-parada": "Loja sem vender",
  "gravacao-atrasada": "Gravação atrasada",
  "mensalidade-vencida": "Mensalidade vencida",
  "implantacao-parada": "Implantação parada",
};

// A mesma escada de cores do Controle de Vendas, de propósito: quem já leu
// aquela tela não precisa aprender outro código de cor aqui. A faixa máxima é
// vermelho sólido e não preto — em tela escura o preto é a cor do fundo, e a
// linha recuava justamente quando devia avançar.
export const ESTILO_DO_TOM: Record<TomDoAlerta, string> = {
  amarelo: "border-amber-500/40 bg-amber-500/10",
  vermelho: "border-red-500/40 bg-red-500/15",
  critico: "border-red-600 bg-red-600 text-white",
};

export const ESTILO_DO_SELO: Record<TomDoAlerta, string> = {
  amarelo: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  vermelho: "bg-red-500/25 text-red-400",
  critico: "bg-white text-red-700 font-bold",
};

export const ESTILO_SECUNDARIO: Record<TomDoAlerta, string> = {
  amarelo: "text-foreground-muted",
  vermelho: "text-foreground-muted",
  critico: "text-red-100",
};

/** Ordena pela gravidade e, dentro dela, pelo problema mais velho. */
export function piorPrimeiro(a: Alerta, b: Alerta): number {
  return b.nivel - a.nivel || b.dias - a.dias || a.titulo.localeCompare(b.titulo);
}
