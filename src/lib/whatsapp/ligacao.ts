import type { GrupoDaZapi } from "./zapi";

// O vocabulário da tela de ligação do WhatsApp.
//
// Separado das ações porque arquivo "use server" só exporta função: constante
// e tipo moram aqui. Também é o arquivo que a tela pode importar sem arrastar
// o servidor junto.

/** Os nomes das três variáveis e onde cada uma é achada no painel da Z-API. */
export const VARIAVEIS_DA_ZAPI = [
  { nome: "ZAPI_INSTANCE_ID", onde: "painel da Z-API, na instância" },
  { nome: "ZAPI_TOKEN", onde: "painel da Z-API, na instância" },
  { nome: "ZAPI_CLIENT_TOKEN", onde: "painel da Z-API, em Segurança da conta" },
] as const;

export type WhatsappState = { ok?: string; erro?: string };

export interface EstadoDaLigacao {
  configurado: boolean;
  /** Quais variáveis faltam, pelo nome, pra não ter que adivinhar. */
  faltando: string[];
  conectado: boolean;
  numero: string | null;
  nomeDoAparelho: string | null;
  erro: string | null;
}

export interface GrupoNaTela extends GrupoDaZapi {
  /** A loja que já usa este grupo, se houver. */
  lojaId: string | null;
  lojaNome: string | null;
}
