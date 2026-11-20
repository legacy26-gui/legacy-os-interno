import "server-only";

// Mandar mensagem no WhatsApp pela Z-API.
//
// ── Por que Z-API e não a API oficial da Meta ─────────────────────────────
//
// Porque o relatório vai pro GRUPO da loja, e grupo é justamente o que a API
// oficial não entrega bem. Foi decisão do Guilherme, com o risco na mesa.
//
// O risco é real e vale estar escrito: a Z-API não é oficial. Ela conecta um
// número de WhatsApp comum pelo mesmo caminho do WhatsApp Web. A Meta pode
// bloquear esse número, e bloqueia sem aviso. Por isso o número tem que ser
// DEDICADO ao robô — se cair, para o envio automático, não o atendimento da
// agência.
//
// ── Os segredos vão na URL, e isso exige cuidado ──────────────────────────
//
// A Z-API põe o id da instância e o token no CAMINHO do endereço:
//
//   https://api.z-api.io/instances/{instancia}/token/{token}/send-image
//
// Não é escolha nossa e não dá pra contornar. A consequência é que a URL
// inteira é um segredo — e URL é a coisa que mais vaza, porque todo mundo
// loga URL sem pensar. Então, neste arquivo:
//
//   - a URL é montada dentro da função e morre nela;
//   - NADA que sai daqui (erro, log, retorno) contém a URL, o token ou o id
//     da instância;
//   - o erro devolvido diz o que aconteceu, nunca com o quê.
//
// O Client-Token, esse vai no cabeçalho, como manda a documentação deles.

/**
 * O endereço da Z-API.
 *
 * Sai de variável de ambiente com o valor real como padrão, por um motivo
 * prático: sem isto não há como testar o envio sem mandar mensagem de
 * verdade pro grupo de um cliente. Nos testes ele aponta pra um servidor
 * falso aqui dentro; em produção ninguém define a variável e vale o padrão.
 *
 * Não é segredo — é o domínio público deles.
 */
const BASE = process.env.ZAPI_BASE_URL?.trim() || "https://api.z-api.io";

/** Quanto esperar a Z-API antes de desistir de uma mensagem. */
const PRAZO_MS = 30_000;

export interface Credenciais {
  instancia: string;
  token: string;
  clientToken: string;
}

/**
 * As credenciais, ou null se faltar alguma.
 *
 * Tudo ou nada de propósito: com duas das três, cada envio falharia com um
 * erro da Z-API que não explica nada. Faltando qualquer uma, o sistema diz
 * "não configurado" e mostra o botão desligado, que é a verdade.
 */
export function credenciais(): Credenciais | null {
  const instancia = process.env.ZAPI_INSTANCE_ID?.trim();
  const token = process.env.ZAPI_TOKEN?.trim();
  const clientToken = process.env.ZAPI_CLIENT_TOKEN?.trim();
  if (!instancia || !token || !clientToken) return null;
  return { instancia, token, clientToken };
}

export function zapiConfigurado(): boolean {
  return credenciais() !== null;
}

export type ResultadoDoEnvio =
  | { ok: true; id: string | null }
  | { ok: false; erro: string };

/**
 * Chama um endpoint da Z-API.
 *
 * Privada de propósito: é a única função que conhece a URL com os segredos,
 * e ela não devolve nada que a contenha.
 */
async function chamar(caminho: string, corpo: unknown): Promise<ResultadoDoEnvio> {
  const c = credenciais();
  if (!c) return { ok: false, erro: "WhatsApp não configurado no sistema." };

  const url = `${BASE}/instances/${c.instancia}/token/${c.token}/${caminho}`;

  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": c.clientToken,
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(PRAZO_MS),
      cache: "no-store",
    });
  } catch (erro) {
    // O erro de rede do fetch pode trazer a URL dentro dele. Nunca repassar.
    const motivo = erro instanceof Error && erro.name === "TimeoutError" ? "demorou demais" : "não respondeu";
    return { ok: false, erro: `A Z-API ${motivo}. A mensagem pode não ter saído — confira no grupo antes de mandar de novo.` };
  }

  const texto = await r.text();

  if (!r.ok) {
    // O corpo do erro da Z-API é curto e não repete a URL, mas corta-se
    // mesmo assim: resposta de serviço de fora não é lugar de confiar em
    // tamanho nem em conteúdo.
    const detalhe = texto.slice(0, 200).replace(/\s+/g, " ").trim();
    return { ok: false, erro: `A Z-API recusou (${r.status})${detalhe ? `: ${detalhe}` : ""}` };
  }

  try {
    const dados = JSON.parse(texto) as { zaapId?: string; messageId?: string };
    return { ok: true, id: dados.zaapId ?? dados.messageId ?? null };
  } catch {
    // 200 com corpo que não é JSON: aceita, porque a mensagem saiu. Guardar
    // id é bom, mas não é o que importa.
    return { ok: true, id: null };
  }
}

/**
 * Chama um endpoint de LEITURA da Z-API.
 *
 * Gêmea de `chamar`, com as mesmas regras de segredo: a URL nasce e morre
 * aqui dentro, e nada que sai desta função a contém. Separada porque GET não
 * leva corpo e porque o que ela devolve é dado, não confirmação de envio.
 */
async function buscar<T>(
  caminho: string,
  query?: Record<string, string>,
): Promise<{ ok: true; dados: T } | { ok: false; erro: string }> {
  const c = credenciais();
  if (!c) return { ok: false, erro: "WhatsApp não configurado no sistema." };

  const q = query ? `?${new URLSearchParams(query).toString()}` : "";
  const url = `${BASE}/instances/${c.instancia}/token/${c.token}/${caminho}${q}`;

  let r: Response;
  try {
    r = await fetch(url, {
      headers: { "Client-Token": c.clientToken },
      signal: AbortSignal.timeout(PRAZO_MS),
      cache: "no-store",
    });
  } catch (erro) {
    const motivo =
      erro instanceof Error && erro.name === "TimeoutError"
        ? "demorou demais"
        : "não respondeu";
    return { ok: false, erro: `A Z-API ${motivo}.` };
  }

  const texto = await r.text();
  if (!r.ok) {
    const detalhe = texto.slice(0, 200).replace(/\s+/g, " ").trim();
    return {
      ok: false,
      erro: `A Z-API recusou (${r.status})${detalhe ? `: ${detalhe}` : ""}`,
    };
  }

  try {
    return { ok: true, dados: JSON.parse(texto) as T };
  } catch {
    return { ok: false, erro: "A Z-API respondeu uma coisa que não é JSON." };
  }
}

/** O formato de id de grupo da Z-API: números e o sufixo "-group". */
export const FORMATO_DO_GRUPO = /^\d{10,}-group$/;

/** Quantos grupos buscar por página. A casa tem dezenas, não milhares. */
const GRUPOS_POR_PAGINA = 100;

export interface GrupoDaZapi {
  /** O id que vai no cadastro da loja: "120363019502650977-group". */
  id: string;
  /** O nome do grupo como aparece no WhatsApp. */
  nome: string;
}

/**
 * Os grupos em que o número do robô está.
 *
 * ── Por que isto existe ──────────────────────────────────────────────────
 *
 * Porque hoje o id do grupo é DIGITADO na ficha da loja, copiado do painel
 * da Z-API. E o estrago de errar um dígito é o pior que este sistema sabe
 * fazer: o relatório da loja A — gasto, leads, custo — entregue no grupo da
 * loja B, sem desfazer.
 *
 * Com a lista na tela, ninguém digita: escolhe o grupo pelo nome. A trava de
 * formato e a de grupo repetido continuam valendo, mas deixam de ser a
 * única coisa entre um dedo escorregado e um cliente vendo o número de
 * outro.
 */
export async function listarGrupos(): Promise<
  { ok: true; grupos: GrupoDaZapi[] } | { ok: false; erro: string }
> {
  const r = await buscar<unknown>("groups", {
    page: "1",
    pageSize: String(GRUPOS_POR_PAGINA),
  });
  if (!r.ok) return r;

  // A Z-API devolve um array, mas resposta de serviço de fora não é lugar de
  // confiar em formato: se vier outra coisa, é lista vazia, não tela quebrada.
  if (!Array.isArray(r.dados)) return { ok: true, grupos: [] };

  const grupos: GrupoDaZapi[] = [];
  for (const bruto of r.dados) {
    if (!bruto || typeof bruto !== "object") continue;
    const g = bruto as { phone?: unknown; name?: unknown; isGroup?: unknown };
    const id = typeof g.phone === "string" ? g.phone : null;
    // Só o que realmente é grupo e tem id no formato que o envio aceita. Um
    // telefone de pessoa que passasse daqui viraria uma opção clicável de
    // mandar o relatório da loja pro WhatsApp pessoal de alguém.
    if (!id || !FORMATO_DO_GRUPO.test(id)) continue;
    if (g.isGroup === false) continue;
    grupos.push({
      id,
      nome: typeof g.name === "string" && g.name.trim() ? g.name.trim() : id,
    });
  }

  grupos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { ok: true, grupos };
}

export interface Aparelho {
  numero: string | null;
  nome: string | null;
}

/**
 * Qual número está pendurado na instância.
 *
 * Importa porque o combinado é um chip DEDICADO ao robô. Se alguém parear o
 * número pessoal da agência por engano, o sistema passa a mandar relatório
 * de cliente pelo WhatsApp que a equipe usa pra tudo — e o bloqueio da Meta,
 * quando vier, leva junto o atendimento. Ver o número na tela é o que torna
 * esse engano visível no dia em que acontece.
 */
export async function dadosDoAparelho(): Promise<
  { ok: true; aparelho: Aparelho } | { ok: false; erro: string }
> {
  const r = await buscar<{ phone?: unknown; name?: unknown }>("device");
  if (!r.ok) return r;
  return {
    ok: true,
    aparelho: {
      numero: typeof r.dados?.phone === "string" ? r.dados.phone : null,
      nome: typeof r.dados?.name === "string" ? r.dados.name : null,
    },
  };
}

/**
 * O "@lid" de um número: o identificador privado que o WhatsApp usa no lugar
 * do telefone em parte das marcações. Ver mencao.ts.
 *
 * A Z-API NÃO converte lid em telefone (a doc diz que o aplicativo proíbe),
 * mas converte telefone em lid — e é só isso que precisamos: o lid do NOSSO
 * número, pra reconhecer quando alguém nos marca.
 *
 * Devolve só dígitos ("81896604192873"), sem o "@lid". `lid: null` quando a
 * Z-API respondeu mas não trouxe um — que é um resultado, não um erro.
 */
export async function lidDoNumero(
  telefone: string,
): Promise<{ ok: true; lid: string | null } | { ok: false; erro: string }> {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) return { ok: false, erro: "Número curto demais." };

  const r = await buscar<unknown>(`phone-exists/${digitos}`);
  if (!r.ok) return r;

  // A doc mostra uma lista, mas a Z-API já devolveu objeto solto em outras
  // rotas. Aceita os dois pra não depender de um formato que pode mudar.
  const item = Array.isArray(r.dados) ? r.dados[0] : r.dados;
  const lid =
    item && typeof item === "object" && "lid" in item
      ? (item as { lid?: unknown }).lid
      : null;
  if (typeof lid !== "string") return { ok: true, lid: null };
  const so = lid.replace(/\D/g, "");
  return { ok: true, lid: so.length >= 8 ? so : null };
}

/**
 * Manda um texto — serve pro teste de que a ligação está de pé.
 *
 * Aceita grupo (`...-group`) ou telefone, porque o teste mais honesto é o
 * que o Guilherme manda pro próprio número antes de deixar o robô falar com
 * cliente. O envio de relatório continua sendo só por grupo, com a trava de
 * formato de sempre.
 */
export async function enviarTexto(
  destino: string,
  mensagem: string,
): Promise<ResultadoDoEnvio> {
  const alvo = destino.trim();
  if (!alvo) return { ok: false, erro: "Diga pra onde mandar." };
  if (!FORMATO_DO_GRUPO.test(alvo) && !/^\d{10,15}$/.test(alvo)) {
    return {
      ok: false,
      erro: "Destino inválido: ou um grupo (“…-group”) ou um telefone com DDI e DDD, só números.",
    };
  }
  if (!mensagem.trim()) return { ok: false, erro: "A mensagem está vazia." };
  return chamar("send-text", { phone: alvo, message: mensagem });
}

/**
 * Manda uma imagem pra um grupo.
 *
 * A imagem vai como data URI (base64) e não como endereço.
 *
 * Por quê: o relatório é uma tela protegida por login. Pra mandar o endereço,
 * ele teria que ser público — e aí qualquer um com o link veria o gasto e os
 * leads da loja. Base64 custa um terço a mais de tamanho e resolve isso sem
 * abrir nada.
 */
export async function enviarImagemAoGrupo(
  grupoId: string,
  dataUri: string,
  legenda: string
): Promise<ResultadoDoEnvio> {
  // O id vem do cadastro, mas o cadastro é digitado por gente. Conferir o
  // formato aqui evita mandar o relatório de uma loja pro telefone pessoal
  // de alguém por causa de um campo preenchido errado.
  if (!FORMATO_DO_GRUPO.test(grupoId)) {
    return {
      ok: false,
      erro: "O id do grupo não está no formato da Z-API (números seguidos de “-group”).",
    };
  }
  if (!dataUri.startsWith("data:image/")) {
    return { ok: false, erro: "A imagem do relatório não foi gerada." };
  }

  return chamar("send-image", { phone: grupoId, image: dataUri, caption: legenda });
}

/**
 * Confere se a conexão está de pé, sem mandar mensagem pra ninguém.
 *
 * Existe porque o modo de falha da Z-API é silencioso: o celular que hospeda
 * a sessão desconecta, e os envios passam a falhar sem que ninguém perceba
 * até o cliente reclamar que não recebeu. Melhor ter onde olhar.
 */
export async function conferirConexao(): Promise<{
  configurado: boolean;
  conectado: boolean;
  erro: string | null;
}> {
  const c = credenciais();
  if (!c) return { configurado: false, conectado: false, erro: null };

  try {
    const r = await fetch(`${BASE}/instances/${c.instancia}/token/${c.token}/status`, {
      headers: { "Client-Token": c.clientToken },
      signal: AbortSignal.timeout(PRAZO_MS),
      cache: "no-store",
    });
    if (!r.ok) {
      return { configurado: true, conectado: false, erro: `A Z-API respondeu ${r.status}.` };
    }
    const dados = (await r.json()) as { connected?: boolean; error?: string };
    return {
      configurado: true,
      conectado: dados.connected === true,
      erro: dados.error ?? null,
    };
  } catch {
    return { configurado: true, conectado: false, erro: "A Z-API não respondeu." };
  }
}
