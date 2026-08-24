import type * as z from "zod";

// Contrato entre o orquestrador e os adaptadores de cada provedor de IA.
// Trocar de provedor é implementar estas duas funções — nada além disso.

export interface ChamadaIa<S extends z.ZodType> {
  apiKey: string;
  system: string;
  user: string;
  schema: S;
  maxTokens: number;
}

export interface RespostaBruta<T> {
  dados: T;
  bruto: string;
  model: string;
}

// Resposta que não obedeceu ao formato pedido (JSON torto, recusa, corte por
// tamanho). Vale a pena repetir quando acontece.
export class RespostaIaInvalida extends Error {
  constructor(
    message: string,
    readonly bruto: string
  ) {
    super(message);
    this.name = "RespostaIaInvalida";
  }
}
