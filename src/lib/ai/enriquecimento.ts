import "server-only";

/**
 * ETAPA 2 — ENRIQUECIMENTO DIGITAL (estrutura pronta, coleta ainda desligada)
 *
 * O diagnóstico já sabe receber dados digitais: eles entram no prompt e ficam
 * gravados em `inputData` junto com as respostas do formulário. O que falta é a
 * coleta — e ela depende de credencial/autorização que a agência ainda não tem.
 *
 * Regra que seguimos aqui: NÃO fazer scraping frágil nem contrário às regras das
 * plataformas só pra fechar a funcionalidade. Cada fonte abaixo diz exatamente o
 * que é preciso pra ligar.
 *
 * ── INSTAGRAM ────────────────────────────────────────────────────────────────
 * O que queremos: frequência de publicação, bio, publicações recentes, formatos
 * (foto/reel/carrossel), consistência, se tem oferta, uso de vídeo.
 * Como se faz certo: Instagram Graph API.
 * Precisa: conta Instagram profissional do CLIENTE conectada a uma página do
 * Facebook; o cliente aceitar o nosso app no Business Manager dele; app Meta com
 * as permissões instagram_basic + pages_read_engagement aprovadas em App Review;
 * token de longa duração guardado por cliente.
 * Observação: a API só entrega dados de contas que nos autorizaram. Não existe
 * caminho legítimo de ler o perfil de terceiro sem autorização.
 *
 * ── FACEBOOK ─────────────────────────────────────────────────────────────────
 * O que queremos: atividade da página, conteúdo, informações públicas.
 * Como se faz certo: Facebook Graph API (/{page-id}/posts, /{page-id}?fields=…).
 * Precisa: mesma autorização do Business Manager acima + pages_read_engagement.
 *
 * ── GOOGLE / PERFIL DA EMPRESA ───────────────────────────────────────────────
 * O que queremos: nota, quantidade de avaliações, avaliações recentes, queixas e
 * elogios recorrentes, se a loja responde.
 * Dois caminhos:
 *  a) Google Business Profile API — dados completos, inclusive responder
 *     avaliação. Precisa: o cliente nos dar acesso ao perfil dele + projeto no
 *     Google Cloud com a API liberada (é liberação sob solicitação).
 *  b) Places API (Place Details) — nota, total de avaliações e algumas
 *     avaliações públicas, sem precisar de acesso do cliente. Precisa: chave do
 *     Google Maps Platform com faturamento ativo. É o caminho mais rápido.
 *
 * ── SITE ─────────────────────────────────────────────────────────────────────
 * O que queremos: se existe, se tem estoque online, CTAs, WhatsApp, informações,
 * estrutura, problemas aparentes.
 * Como se faz certo: buscar a própria home do cliente (é permitido: é o site
 * dele, e respeitamos robots.txt) e, se necessário, PageSpeed Insights API para
 * desempenho. Precisa: nada de credencial pra leitura simples; chave do Google
 * pra PageSpeed.
 *
 * Quando cada fonte for ligada, basta preencher o objeto abaixo e gravar em
 * ClientOnboarding.enrichment — o prompt e a tela já lidam com ele.
 */

export interface DadosInstagram {
  arroba: string;
  seguidores?: number;
  bio?: string;
  publicacoesUltimos30Dias?: number;
  formatos?: string[];
  ultimasPublicacoes?: { data: string; tipo: string; legenda: string }[];
  coletadoEm: string;
}

export interface DadosFacebook {
  pagina: string;
  publicacoesUltimos30Dias?: number;
  ultimaPublicacaoEm?: string;
  coletadoEm: string;
}

export interface DadosGoogle {
  nome: string;
  nota?: number;
  totalAvaliacoes?: number;
  avaliacoesRecentes?: { nota: number; texto: string; data: string; respondida: boolean }[];
  coletadoEm: string;
}

export interface DadosSite {
  url: string;
  online: boolean;
  temEstoqueOnline?: boolean;
  temWhatsapp?: boolean;
  observacoes?: string[];
  coletadoEm: string;
}

export interface DadosDigitais {
  instagram?: DadosInstagram;
  facebook?: DadosFacebook;
  google?: DadosGoogle;
  site?: DadosSite;
}

// Fontes ligadas hoje. Enquanto vazio, o diagnóstico roda só com o formulário e
// é instruído a tratar presença digital como informação a levantar.
export const FONTES_ATIVAS: string[] = [];

/**
 * Ponto único de coleta. Hoje devolve null (nada configurado); quando uma fonte
 * entrar, é só implementá-la aqui — nada mais no fluxo precisa mudar.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- a assinatura já é
// a definitiva; o corpo é que ainda não coleta nada.
export async function coletarDadosDigitais(_entrada: {
  instagram?: string | null;
  site?: string | null;
  empresa: string;
  cidade?: string | null;
}): Promise<DadosDigitais | null> {
  if (FONTES_ATIVAS.length === 0) return null;
  return null;
}

export function parseDadosDigitais(valor: unknown): DadosDigitais | null {
  if (!valor || typeof valor !== "object") return null;
  return valor as DadosDigitais;
}
