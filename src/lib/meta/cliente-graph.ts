import "server-only";

// A conversa com a Graph API da Meta — só de leitura.
//
// É separada da Conversions API (src/lib/meta-capi.ts) de propósito: lá o
// sistema CONTA pra Meta o que aconteceu, aqui ele PERGUNTA. São tokens
// diferentes, permissões diferentes e consequências diferentes se vazar.
//
// ── O token ───────────────────────────────────────────────────────────────
//
// Nunca na URL. Query string entra em log de servidor, em histórico de proxy,
// em relatório de erro e no Referer do navegador — e token em log é token
// vazado, mesmo que ninguém esteja lendo hoje. Vai sempre no cabeçalho
// Authorization.
//
// Nunca na mensagem de erro: o que a Meta devolve é repassado pra tela, e
// toda mensagem passa por `semSegredo()` antes de sair daqui.
//
// Este arquivo é "server-only": se alguém importar numa tela de navegador, o
// build quebra em vez de mandar o token pro cliente.

/**
 * 10 segundos pra uma busca comum. Além disso é a Meta que está fora do ar,
 * não a rede.
 *
 * Não serve pra tudo, porém: a busca de vida inteira pede o acumulado de
 * TODOS os anúncios de uma conta desde sempre, e numa conta antiga e grande
 * ela passa dos 10 segundos com facilidade. O corte cedo demais virava um
 * "a Meta demorou demais" numa loja em que estava tudo certo — os números do
 * período já tinham entrado, só o acumulado é que não. Por isso quem chama
 * pode pedir mais tempo.
 */
const TIMEOUT_MS = 10_000;

const VERSAO_PADRAO = "v26.0";

function versao() {
  return process.env.META_GRAPH_VERSION?.trim() || VERSAO_PADRAO;
}

function base() {
  // Mesma variável que a Conversions API já usa, pra existir um lugar só pra
  // apontar tudo a um servidor de teste.
  return process.env.META_GRAPH_BASE?.trim() || "https://graph.facebook.com";
}

function token() {
  return process.env.META_ADS_READ_TOKEN?.trim() || null;
}

/**
 * Tira o token de qualquer texto, por garantia.
 *
 * A Meta não devolve o token nos erros dela. Isto é cinto de segurança: o dia
 * em que devolver — ou em que alguém colar o token numa mensagem por engano —
 * ele não chega na tela nem no log.
 */
function semSegredo(texto: string): string {
  const t = token();
  if (!t) return texto;
  return texto.split(t).join("[token]");
}

export type RespostaGraph<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: string };

/**
 * Um GET na Graph API.
 *
 * `caminho` é o que vem depois da versão, sem barra inicial — por exemplo
 * "act_123" ou "act_123/insights". `campos` vira query string, e o token
 * NUNCA entra aí.
 */
export async function buscarNaGraph<T>(
  caminho: string,
  params: Record<string, string> = {},
  /** Quanto esperar. Só as buscas sabidamente pesadas pedem mais. */
  timeoutMs: number = TIMEOUT_MS,
): Promise<RespostaGraph<T>> {
  const chave = token();
  if (!chave) {
    return {
      ok: false,
      erro: "Token de leitura da Meta não configurado no sistema.",
    };
  }

  const url = new URL(`${base()}/${versao()}/${caminho}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  // AbortController e não a opção `signal: AbortSignal.timeout`: o motivo do
  // corte precisa ser distinguível de um erro de rede pra a mensagem fazer
  // sentido pra quem lê.
  const corte = new AbortController();
  const relogio = setTimeout(() => corte.abort(), timeoutMs);

  try {
    const resposta = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${chave}` },
      signal: corte.signal,
      cache: "no-store",
    });

    const texto = await resposta.text();

    if (!resposta.ok) {
      // A Meta devolve { error: { message, type, code } }. Pega só a
      // mensagem; o corpo inteiro não serve pra quem está na tela.
      let detalhe = `HTTP ${resposta.status}`;
      try {
        const corpo = JSON.parse(texto) as { error?: { message?: string } };
        if (corpo.error?.message) detalhe = corpo.error.message;
      } catch {
        // Resposta que não é JSON (página de erro, proxy no caminho). O
        // status sozinho já diz o suficiente.
      }
      return { ok: false, erro: semSegredo(detalhe) };
    }

    try {
      return { ok: true, dados: JSON.parse(texto) as T };
    } catch {
      return {
        ok: false,
        erro: "A Meta respondeu num formato que não deu pra ler.",
      };
    }
  } catch (erro) {
    if (erro instanceof Error && erro.name === "AbortError") {
      return {
        ok: false,
        erro: `A Meta demorou demais pra responder (mais de ${Math.round(timeoutMs / 1000)} segundos).`,
      };
    }
    return {
      ok: false,
      erro: semSegredo(
        erro instanceof Error ? erro.message : "Falha ao falar com a Meta.",
      ),
    };
  } finally {
    clearTimeout(relogio);
  }
}
