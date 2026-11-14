import "server-only";

import { prisma } from "@/lib/prisma";
import { buscarNaGraph } from "./cliente-graph";
import { escreverNaGraph, escritaLiberada } from "./escrever-na-graph";
import {
  textoDoAnuncio,
  TETO_DO_CAMPO,
  type CampoDeTexto,
  type TextoDoAnuncio,
} from "./texto-do-anuncio";

// Trocar o texto de um anúncio na Meta.
//
// ── A coisa mais importante deste arquivo ────────────────────────────────
//
// Trocar o texto de um anúncio que já roda NÃO é uma edição. É um anúncio
// novo com um post novo, e as curtidas e comentários do post antigo ficam
// para trás. O Gerenciador faz exatamente isso quando alguém edita a legenda
// por lá, só que sem dizer.
//
// Eu já afirmei aqui que criativo era imutável e o Guilherme me corrigiu:
// ele edita pelo Meta e funciona. Os dois estão certos. A referência da
// Graph lista só `name`, `status`, `account_id` e `adlabels` como campos
// que um criativo aceita trocar depois de criado — `body` e `title` não
// estão lá. O que o Gerenciador faz por baixo é criar outro criativo e
// reapontar o anúncio, que é o caminho 2 aqui embaixo.
//
// ── Por que ainda assim o caminho 1 existe ───────────────────────────────
//
// Porque a documentação e a ferramenta de linha de comando da própria Meta
// discordam: o CLI oferece trocar `body` e `title` e avisa que "se falhar,
// crie um criativo novo". Ou seja, em algum formato de anúncio isso passa.
// Quando passa, é de graça: mesmo criativo, mesmo post, prova social
// intacta. Tentar custa uma chamada e não quebra nada se der erro.
//
// Então: tenta o barato, cai pro caro, e o caro só acontece com confirmação
// explícita de quem está na tela — porque o caro tem preço.

/** O que mudou, pronto pra escrever. */
export type Mudancas = Partial<Record<CampoDeTexto, string>>;

/** Como cada campo se chama na Graph, na forma plana e dentro do story spec. */
const CAMPO_PLANO: Record<CampoDeTexto, string> = {
  legenda: "body",
  titulo: "title",
  descricao: "link_description",
};

const CAMPO_NO_SPEC: Record<CampoDeTexto, { link: string; video: string }> = {
  legenda: { link: "message", video: "message" },
  titulo: { link: "name", video: "title" },
  descricao: { link: "description", video: "link_description" },
};

export type ResultadoDoTexto =
  | {
      ok: true;
      nome: string;
      campos: CampoDeTexto[];
      /** Deu pra trocar sem criar criativo novo? */
      noLugar: boolean;
      /** O post mudou? null quando não deu pra conferir. */
      postTrocou: boolean | null;
    }
  | { ok: false; erro: string }
  /** A Meta recusou a troca barata; a cara precisa de confirmação. */
  | { ok: false; precisaCriarNovo: true; motivo: string };

interface CriativoCompleto {
  id?: string;
  name?: string;
  object_story_spec?: Record<string, unknown>;
  degrees_of_freedom_spec?: unknown;
  effective_object_story_id?: string;
  object_story_id?: string;
}

/** Só o que de fato mudou, aparado e dentro dos tetos. */
export function mudancasDeVerdade(
  atual: TextoDoAnuncio,
  pedido: Mudancas,
): { campos: CampoDeTexto[]; limpo: Mudancas; erro?: string } {
  const limpo: Mudancas = {};
  const campos: CampoDeTexto[] = [];

  for (const campo of Object.keys(pedido) as CampoDeTexto[]) {
    const novo = (pedido[campo] ?? "").trim();
    if (novo.length > TETO_DO_CAMPO[campo]) {
      return {
        campos: [],
        limpo: {},
        erro: `O campo ${campo} passou de ${TETO_DO_CAMPO[campo]} caracteres.`,
      };
    }
    const velho = (atual[campo] ?? "").trim();
    // Texto igual não vira chamada. Sem isto, apertar salvar sem mexer em
    // nada criaria um criativo novo e jogaria fora o post por nada.
    if (novo === velho) continue;
    // Apagar a legenda inteira de um anúncio que roda é quase sempre engano,
    // e a Meta aceita. Quem quer tirar o texto desliga o anúncio.
    if (novo === "" && campo === "legenda") {
      return { campos: [], limpo: {}, erro: "A legenda não pode ficar vazia." };
    }
    limpo[campo] = novo;
    campos.push(campo);
  }

  return { campos, limpo };
}

/** Caminho 1: pedir à Meta pra trocar o texto no criativo que já existe. */
async function tentarNoLugar(creativeId: string, limpo: Mudancas) {
  const campos: Record<string, string> = {};
  for (const [campo, valor] of Object.entries(limpo)) {
    campos[CAMPO_PLANO[campo as CampoDeTexto]] = valor;
  }
  return escreverNaGraph(creativeId, campos);
}

/**
 * Caminho 2: criativo novo com o texto trocado, e o anúncio reapontado.
 *
 * O novo criativo nasce do `object_story_spec` do atual, com só os campos de
 * texto substituídos. Copiar o spec inteiro e não remontar do zero é o que
 * preserva imagem, link, botão e página — remontar significaria adivinhar
 * dezenas de campos e errar silenciosamente em algum formato.
 */
async function criarNovoEReapontar(
  atual: TextoDoAnuncio,
  limpo: Mudancas,
): Promise<{ ok: true; creativeId: string } | { ok: false; erro: string }> {
  if (!atual.creativeId) {
    return {
      ok: false,
      erro: "Não sabemos qual é o criativo deste anúncio. Atualize a loja.",
    };
  }

  const leitura = await buscarNaGraph<CriativoCompleto>(atual.creativeId, {
    fields: "id,name,object_story_spec",
  });
  if (!leitura.ok) return { ok: false, erro: leitura.erro };

  const spec = leitura.dados.object_story_spec;
  if (!spec) {
    return {
      ok: false,
      erro:
        "Este anúncio não tem um criativo que dê pra copiar (provavelmente usa um post que já existia). " +
        "Dá pra editar o post direto na página, ou criar um anúncio novo.",
    };
  }

  // Troca o texto dentro do spec, no lugar certo pra link ou pra vídeo.
  const novoSpec = JSON.parse(JSON.stringify(spec)) as Record<string, unknown>;
  const link = novoSpec.link_data as Record<string, unknown> | undefined;
  const video = novoSpec.video_data as Record<string, unknown> | undefined;
  if (!link && !video) {
    // Advantage+ e dinâmicos guardam o texto em `asset_feed_spec`, em listas
    // de variações. Dá pra LER (a tela mostra a primeira) e não dá pra
    // reescrever por aqui: um criativo novo teria que remontar a lista
    // inteira, e escolher qual variação a edição substitui é decisão de
    // quem escreveu, não minha.
    return {
      ok: false,
      erro:
        "Este anúncio usa criativo Advantage+ (várias legendas que a Meta combina sozinha). " +
        "Dá pra ver o texto aqui, mas trocar só pelo Gerenciador — aqui eu teria que escolher " +
        "qual das variações substituir, e essa escolha é sua.",
    };
  }

  for (const [campo, valor] of Object.entries(limpo)) {
    const onde = CAMPO_NO_SPEC[campo as CampoDeTexto];
    if (link) link[onde.link] = valor;
    if (video) video[onde.video] = valor;
  }

  const criado = await escreverNaGraph<{ id?: string }>(
    `${atual.contaMeta}/adcreatives`,
    {
      name: `${leitura.dados.name ?? atual.nome} — texto ${new Date().toISOString().slice(0, 10)}`,
      object_story_spec: JSON.stringify(novoSpec),
    },
  );
  if (!criado.ok) return { ok: false, erro: criado.erro };

  const novoId = criado.dados?.id;
  if (!novoId) {
    return {
      ok: false,
      erro: "A Meta criou o criativo mas não disse o id dele.",
    };
  }

  // Reaponta o anúncio. Se isto falhar, fica um criativo solto na conta —
  // sem anúncio nenhum apontando pra ele, ele não gasta nem aparece, mas o
  // erro precisa dizer isso pra ninguém achar que nada aconteceu.
  const trocado = await escreverNaGraph(atual.adId, {
    creative: JSON.stringify({ creative_id: novoId }),
  });
  if (!trocado.ok) {
    return {
      ok: false,
      erro: `O criativo novo foi criado, mas o anúncio não aceitou trocar: ${trocado.erro}`,
    };
  }

  return { ok: true, creativeId: novoId };
}

/** O post do anúncio, perguntado à Meta agora. */
async function postAgora(adId: string): Promise<string | null> {
  const r = await buscarNaGraph<{
    creative?: { effective_object_story_id?: string };
  }>(adId, {
    fields: "creative{effective_object_story_id}",
  });
  return r.ok ? (r.dados.creative?.effective_object_story_id ?? null) : null;
}

/**
 * Troca o texto e grava o que aconteceu.
 *
 * `confirmadoCriarNovo` é o pedágio: sem ele, quando a Meta recusa a troca
 * barata a função PARA e devolve o motivo, em vez de seguir pro caminho que
 * custa a prova social. Quem está na tela decide se vale.
 */
export async function mudarTexto(opts: {
  clientId: string;
  quemId: string;
  adId: string;
  mudancas: Mudancas;
  confirmadoCriarNovo: boolean;
}): Promise<ResultadoDoTexto> {
  const { clientId, quemId, adId, mudancas, confirmadoCriarNovo } = opts;

  if (!escritaLiberada()) {
    return {
      ok: false,
      erro: "A chave de escrita da Meta não está configurada no sistema.",
    };
  }

  const atual = await textoDoAnuncio(clientId, adId);
  if (!atual)
    return { ok: false, erro: "Este anúncio não está no cadastro desta loja." };
  if (!atual.creativeId) {
    return {
      ok: false,
      erro: "Ainda não sabemos qual é o criativo deste anúncio. Atualize a loja.",
    };
  }

  const { campos, limpo, erro } = mudancasDeVerdade(atual, mudancas);
  if (erro) return { ok: false, erro };
  if (campos.length === 0) return { ok: false, erro: "Nada mudou no texto." };

  const postAntes = atual.postId;

  // ── caminho 1 ───────────────────────────────────────────────────────────
  let noLugar = true;
  let resposta = await tentarNoLugar(atual.creativeId, limpo);
  let creativeIdFinal = atual.creativeId;

  // ── caminho 2 ───────────────────────────────────────────────────────────
  if (!resposta.ok) {
    if (!confirmadoCriarNovo) {
      return { ok: false, precisaCriarNovo: true, motivo: resposta.erro };
    }
    noLugar = false;
    const novo = await criarNovoEReapontar(atual, limpo);
    resposta = novo.ok
      ? { ok: true, dados: {} }
      : { ok: false, erro: novo.erro };
    if (novo.ok) creativeIdFinal = novo.creativeId;
  }

  // Pergunta à Meta em que post o anúncio está agora. É o dado que responde,
  // sem achismo, se a prova social sobreviveu — e é o que faltava pra saber.
  const postDepois = resposta.ok ? await postAgora(adId) : null;

  const resumo = (t: TextoDoAnuncio | Mudancas) =>
    campos
      .map((c) => `${c}: ${(t as Record<string, unknown>)[c] ?? ""}`)
      .join("\n");

  await prisma.metaAcao.create({
    data: {
      clientId,
      quemId,
      tipo: "texto",
      nivel: "anuncio",
      objetoId: adId,
      nome: atual.nome,
      // Mesma convenção da verba: aqui vai o que se pediu à Meta — quais
      // campos, e por qual caminho.
      statusPedido: `${campos.join("+")}${noLugar ? "" : " (criativo novo)"}`,
      statusAntes: null,
      textoAntes: resumo(atual),
      textoDepois: resumo(limpo),
      postAntes,
      postDepois,
      ok: resposta.ok,
      erro: resposta.ok ? null : resposta.erro,
    },
  });

  if (!resposta.ok) return { ok: false, erro: resposta.erro };

  // Grava no cadastro na hora. A varredura só passa daqui a quinze minutos,
  // e sem isto a tela recarregaria com o texto velho — e alguém editaria de
  // novo achando que não pegou, criando um segundo criativo à toa.
  await prisma.metaAdCreative.updateMany({
    where: { adId, adAccount: { clientId } },
    data: {
      ...limpo,
      creativeId: creativeIdFinal,
      ...(postDepois ? { postId: postDepois } : {}),
    },
  });

  return {
    ok: true,
    nome: atual.nome,
    campos,
    noLugar,
    postTrocou: postDepois === null ? null : postDepois !== postAntes,
  };
}
