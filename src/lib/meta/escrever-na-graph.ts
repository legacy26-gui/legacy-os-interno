import "server-only";

// Escrever na Meta — ligar e desligar campanha, conjunto e anúncio.
//
// ── Por que é um arquivo separado do de leitura ───────────────────────────
//
// Por causa do TOKEN. São dois, e isso é de propósito.
//
// O token de leitura roda o tempo todo: no robô da noite, em cada botão de
// atualizar, em dezenas de chamadas por dia. Se ele vazar, alguém vê números
// que não devia — ruim, e recuperável.
//
// O token de ESCRITA desliga campanha. Se ele vazar, alguém apaga a entrega
// de quarenta lojas numa tarde. Então ele vive numa variável própria
// (META_ADS_WRITE_TOKEN), é usado só aqui, e o caminho de leitura — que é o
// que roda em toda parte — nunca chega perto dele.
//
// Se a variável não existir, nada escreve. É o estado normal hoje: o sistema
// mostra as chaves, explica que falta o acesso, e não finge que mexeu.
//
// ── A regra do token continua a mesma ─────────────────────────────────────
//
// Header Authorization, nunca na URL, nunca em log, nunca em mensagem de
// erro, nunca pro navegador. Na escrita isso vale em dobro: o corpo de um
// POST não aparece em log de servidor, mas uma query string aparece em
// TODO LUGAR — proxy, histórico, relatório de erro.

const TIMEOUT_MS = 15_000;

const VERSAO_PADRAO = "v26.0";

function versao() {
  return process.env.META_GRAPH_VERSION?.trim() || VERSAO_PADRAO;
}

function base() {
  return process.env.META_GRAPH_BASE?.trim() || "https://graph.facebook.com";
}

function token() {
  return process.env.META_ADS_WRITE_TOKEN?.trim() || null;
}

/** Dá pra mexer em campanha hoje? */
export function escritaLiberada(): boolean {
  return token() !== null;
}

/** Tira o token de qualquer texto, por garantia. Ver cliente-graph.ts. */
function semSegredo(texto: string): string {
  const t = token();
  if (!t) return texto;
  return texto.split(t).join("[token]");
}

export type RespostaDaEscrita = { ok: true } | { ok: false; erro: string };

/**
 * Um POST na Graph API.
 *
 * Os campos vão no CORPO, como form-urlencoded, que é o que a Meta espera —
 * e não na query string, onde virariam rastro em todo proxy do caminho.
 */
export async function escreverNaGraph(
  caminho: string,
  campos: Record<string, string>
): Promise<RespostaDaEscrita> {
  const chave = token();
  if (!chave) {
    return {
      ok: false,
      erro: "O acesso de escrita na Meta ainda não está configurado no sistema.",
    };
  }

  const corte = new AbortController();
  const relogio = setTimeout(() => corte.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(`${base()}/${versao()}/${caminho}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(campos).toString(),
      signal: corte.signal,
      cache: "no-store",
    });

    const texto = await resposta.text();

    if (!resposta.ok) {
      let detalhe = `HTTP ${resposta.status}`;
      try {
        const corpo = JSON.parse(texto) as {
          error?: { message?: string; error_user_msg?: string };
        };
        // error_user_msg é a frase que a Meta escreveu PRA MOSTRAR pra
        // pessoa; message é a técnica. Quando as duas vêm, a primeira é mais
        // útil pra quem está na tela.
        detalhe = corpo.error?.error_user_msg || corpo.error?.message || detalhe;
      } catch {
        // Resposta que não é JSON: o status já diz o suficiente.
      }
      return { ok: false, erro: semSegredo(detalhe) };
    }

    return { ok: true };
  } catch (erro) {
    if (erro instanceof Error && erro.name === "AbortError") {
      return {
        ok: false,
        erro: "A Meta demorou demais pra responder. A mudança pode ou não ter sido aplicada — confira no Gerenciador.",
      };
    }
    return { ok: false, erro: semSegredo(erro instanceof Error ? erro.message : String(erro)) };
  } finally {
    clearTimeout(relogio);
  }
}
