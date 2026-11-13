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

export interface ConferenciaDaEscrita {
  /** A variável existe? */
  configurado: boolean;
  /** A Meta aceitou o token? */
  valido: boolean;
  /** Quantas contas de anúncio este token alcança. */
  contas: number | null;
  /** As permissões que a Meta diz que ele tem, quando dá pra perguntar. */
  permissoes: string[] | null;
  /** Já dá pra ligar e desligar campanha? */
  podeGerenciar: boolean | null;
  erro: string | null;
}

/**
 * Pergunta à Meta o que o token de ESCRITA alcança.
 *
 * Existe porque "configurei a variável, será que entrou?" é uma pergunta que
 * aparece toda vez que um token é trocado — e a única resposta que o sistema
 * dava antes era passar o mouse numa chavinha e ver se ela destravava. Isso
 * diz se a variável existe, mas não se ela tem o escopo certo nem se alcança
 * as contas das lojas: o erro só apareceria no primeiro clique de verdade,
 * numa campanha de verdade.
 *
 * Usa só leitura, de propósito: conferir um token não pode mexer em campanha
 * nenhuma. E NUNCA devolve o token, nem pedaço dele.
 */
export async function conferirEscrita(): Promise<ConferenciaDaEscrita> {
  const chave = token();
  const vazio: ConferenciaDaEscrita = {
    configurado: false,
    valido: false,
    contas: null,
    permissoes: null,
    podeGerenciar: null,
    erro: null,
  };
  if (!chave) return vazio;

  async function perguntar<T>(caminho: string, params: Record<string, string> = {}) {
    const url = new URL(`${base()}/${versao()}/${caminho}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const corte = new AbortController();
    const relogio = setTimeout(() => corte.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${chave}` },
        signal: corte.signal,
        cache: "no-store",
      });
      const texto = await r.text();
      if (!r.ok) {
        let detalhe = `HTTP ${r.status}`;
        try {
          const corpo = JSON.parse(texto) as { error?: { message?: string } };
          detalhe = corpo.error?.message ?? detalhe;
        } catch {
          // Não é JSON: o status já diz o suficiente.
        }
        return { ok: false as const, erro: semSegredo(detalhe) };
      }
      return { ok: true as const, dados: JSON.parse(texto) as T };
    } catch (erro) {
      return {
        ok: false as const,
        erro: semSegredo(erro instanceof Error ? erro.message : String(erro)),
      };
    } finally {
      clearTimeout(relogio);
    }
  }

  // Primeiro: a Meta reconhece este token?
  const eu = await perguntar<{ id?: string }>("me", { fields: "id" });
  if (!eu.ok) {
    return { ...vazio, configurado: true, erro: eu.erro };
  }

  // Quantas contas ele alcança. Zero aqui é o problema silencioso mais
  // comum: o token foi gerado, mas ninguém deu as contas pro usuário do
  // sistema — e aí tudo responde "não achei esse objeto".
  const contas = await perguntar<{ data?: unknown[] }>("me/adaccounts", {
    fields: "id",
    limit: "200",
  });

  // As permissões. Nem todo tipo de token responde isto, então falhar aqui
  // não é erro: é só não dar pra confirmar o escopo por este caminho.
  const perms = await perguntar<{ data?: { permission: string; status: string }[] }>(
    "me/permissions"
  );
  const concedidas = perms.ok
    ? (perms.dados.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission)
    : null;

  return {
    configurado: true,
    valido: true,
    contas: contas.ok ? (contas.dados.data?.length ?? 0) : null,
    permissoes: concedidas,
    podeGerenciar: concedidas ? concedidas.includes("ads_management") : null,
    erro: contas.ok ? null : contas.erro,
  };
}

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
