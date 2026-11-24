// Os tipos do "Anunciar agora" que a tela e o servidor dividem. Arquivo puro (roda no navegador também).

export interface CarroDoPlano {
  id: string;
  titulo: string;
  ano: number | null;
  km: number | null;
  cor: string | null;
  precoCents: number | null;
}

export interface PlanoDoAnuncio {
  ok: boolean;
  erro?: string;
  loja?: string;
  carro?: CarroDoPlano;
  /** Endereços das fotos do carro no site (até 6), pra a pessoa ver e tirar as que não quer. */
  fotos?: string[];
  campanhas?: { id: string; nome: string; status: string | null }[];
  conjuntos?: { id: string; nome: string; campaignId: string | null; status: string | null; orcamentoCents: number | null }[];
  anuncios?: { id: string; nome: string; adsetId: string | null; status: string | null }[];
  /** O "mesmo de sempre" da loja: já vem escolhido na tela. */
  padrao?: { adsetId: string; baseAdId: string; duplicarConjunto: boolean; orcamentoCents: number | null; campaignId: string | null } | null;
  /** A legenda que a IA escreveu (editável na tela). Vazia se a IA falhou: aí a pessoa escreve. */
  legenda?: string;
  avisosDaLegenda?: string[];
  erroDaLegenda?: string | null;
  /** O acesso de escrita na Meta está configurado? */
  podeEscrever?: boolean;
}

export interface EscolhaDoAnuncio {
  campanha: { tipo: "existente"; id: string } | { tipo: "nova"; nome: string };
  conjunto: { tipo: "existente"; id: string } | { tipo: "novo"; nome: string; orcamentoReais: number | null };
  /** Conjunto de onde copiar as configurações quando algo é novo (campanha ou conjunto). */
  moldeAdsetId: string | null;
  /** O anúncio de onde o novo herda página, botão e rastreamento. */
  baseAdId: string;
  /** Endereços das fotos que ficam (na ordem). */
  fotos: string[];
  legenda: string;
  /** O nome do anúncio novo. Vazio = o nome do carro. */
  anuncioNome?: string;
}
