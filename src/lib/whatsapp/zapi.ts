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

/** O formato de id de grupo da Z-API: números e o sufixo "-group". */
export const FORMATO_DO_GRUPO = /^\d{10,}-group$/;

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
