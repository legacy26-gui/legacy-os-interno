// O vocabulário do Copiloto que a TELA também precisa conhecer.
//
// Separado das ações porque arquivo "use server" só exporta função, e
// separado do cérebro porque o cérebro é só do servidor (importa o cliente
// de IA, que carrega a chave).

/** Uma ação que o Copiloto sugeriu, já presa a uma loja de verdade. */
export interface AcaoSugerida {
  tipo: "pausar_anuncio" | "mudar_verba";
  /** Resolvido no servidor contra a carteira de quem perguntou. */
  clientId: string;
  loja: string;
  /** O id do anúncio ou conjunto na Meta. */
  objetoId: string;
  nome: string;
  /** Só em mudar_verba. */
  valorReais: number | null;
  porQue: string;
}

export type RespostaDoCopiloto =
  | {
      resposta: string;
      acoes: AcaoSugerida[];
      /** O que foi consultado — a tela mostra de onde veio o número. */
      fonte: string | null;
      erro?: undefined;
    }
  | { erro: string; resposta?: undefined; acoes?: undefined; fonte?: undefined };

export interface TurnoNaTela {
  de: "gestor" | "copiloto";
  texto: string;
  fonte?: string | null;
  acoes?: AcaoSugerida[];
}

/**
 * Perguntas prontas, pra tela não começar com um campo vazio.
 *
 * Campo de texto em branco é a pior porta de entrada que existe: quem abre
 * não sabe o que a ferramenta consegue responder e fecha. Estas quatro
 * mostram o alcance — carteira inteira, uma loja, desperdício, comparação —
 * em vez de descrevê-lo.
 */
export const PERGUNTAS_PRONTAS = [
  "Quais lojas estão com o pior custo por resultado nos últimos 7 dias?",
  "Onde estou perdendo dinheiro? Mostre anúncios que gastaram e não trouxeram nada.",
  "Quem vai ficar sem verba nos próximos dias?",
  "Qual campanha está gastando mais esta semana?",
] as const;
