import "server-only";

import * as z from "zod";
import { gerarJson } from "@/lib/ai/client";
import { ATALHOS } from "@/lib/meta/insights";
import type { PessoaDaCasa } from "@/lib/carteira";
import { rodarConsulta, type NomeDaConsulta } from "./consultas";

// O Copiloto, em duas chamadas ao modelo.
//
// ── Por que duas, e nunca uma ────────────────────────────────────────────
//
//   1ª: "o que o gestor quer saber?" → o modelo escolhe UMA consulta da
//       lista e diz com quais parâmetros. Ele não vê dado nenhum ainda.
//   2ª: o sistema roda a consulta de verdade e devolve ao modelo os números
//       que vieram do banco. Só então ele escreve a resposta.
//
// A razão é uma só: assim ele não tem como inventar número. Na primeira
// chamada não há números pra inventar; na segunda, os únicos que ele tem são
// os de verdade. Um modelo com acesso ao banco escreveria a consulta errada
// e responderia com convicção sobre dados que não existem — e quem lê não
// teria como saber.
//
// Custa duas chamadas em vez de uma. É o preço de uma resposta em que dá pra
// confiar, e é barato perto de uma decisão tomada em cima de número errado.
//
// ── E as ações? ──────────────────────────────────────────────────────────
//
// O modelo NÃO executa nada. Quando a conversa pede pra pausar um anúncio ou
// mexer na verba, ele devolve uma PROPOSTA — o que, onde, por quê — e quem
// aperta o botão é gente. Ver acoes.ts.

/** O que o modelo pode pedir pro sistema buscar. */
const EscolhaDaConsulta = z.object({
  consulta: z.enum([
    "desempenho_das_lojas",
    "desempenho_de_uma_loja",
    "itens_da_loja",
    "desperdicio",
    "comparar_periodos",
    "saldo_das_lojas",
    "acoes_recentes",
    "nenhuma",
  ]),
  loja: z.string().nullable(),
  periodo: z.string().nullable(),
  contra: z.string().nullable(),
  nivel: z.enum(["campanha", "conjunto", "anuncio"]).nullable(),
  minimoReais: z.number().nullable(),
  quantas: z.number().nullable(),
  /** Quando `consulta` é "nenhuma": o que responder sem buscar nada. */
  porQueNenhuma: z.string().nullable(),
});

const AcaoProposta = z.object({
  tipo: z.enum(["pausar_anuncio", "mudar_verba"]),
  loja: z.string(),
  /** O id do anúncio/conjunto, exatamente como veio nos dados. */
  objetoId: z.string(),
  nome: z.string(),
  /** Só em mudar_verba: o novo valor em reais. */
  valorReais: z.number().nullable(),
  porQue: z.string(),
});

const RespostaDoCopiloto = z.object({
  resposta: z.string(),
  acoes: z.array(AcaoProposta),
});

export type AcaoPropostaDoCopiloto = z.infer<typeof AcaoProposta>;

export interface Turno {
  de: "gestor" | "copiloto";
  texto: string;
}

export interface RespostaPronta {
  resposta: string;
  acoes: AcaoPropostaDoCopiloto[];
  /** O que foi consultado, pra mostrar na tela de onde veio o número. */
  fonte: string | null;
}

const COMO_FALAR = `Você é o Copiloto do Legacy OS, o sistema interno de uma agência de
marketing que cuida de contas de Meta Ads de lojas de carro.

Quem fala com você é gestor de tráfego ou a direção da agência. Eles conhecem
o negócio: não explique o que é CPL nem o que é impressão.

Como escrever:
- Português do Brasil, direto, sem floreio e sem "prezado".
- Comece pela resposta. Contexto depois, se precisar.
- Número sempre com a unidade que veio nos dados (R$, %, quantidade).
- Listas curtas quando forem comparação; texto corrido quando for explicação.
- Nada de markdown pesado: no máximo listas com "-" e **negrito** pontual.

Regras que não se quebram:
- NUNCA invente número. Se o dado não veio na consulta, diga que não tem.
- Não arredonde pra parecer melhor. R$ 47,30 é R$ 47,30.
- Zero por falha de leitura NÃO é zero de desempenho. Se os dados disserem
  que a leitura falhou, diga isso em vez de dizer que a loja foi mal.
- Quando recomendar pausar algo ou mexer em verba, devolva também em "acoes"
  — é o que faz aparecer o botão. Sem isso a recomendação é só conversa.
- Recomende no máximo 3 ações de uma vez. Lista grande ninguém executa.`;

/**
 * O que muda quando a resposta vai pro WhatsApp.
 *
 * ── Por que não serve a mesma instrução da tela ──────────────────────────
 *
 * O exemplo abaixo usa <marcadores>, e não nomes de loja de verdade, por um
 * motivo que custou uma investigação: um nome real escrito aqui aparece em
 * TODO prompt, inclusive no de quem não tem aquela loja na carteira. Além de
 * confundir quem for depurar, é um empurrãozinho pro modelo citar uma loja
 * que não é da pessoa.
 *
 * Porque o WhatsApp não é um navegador. Dois asteriscos não viram negrito lá
 * — viram dois asteriscos na cara de quem lê. Tabela não existe. E a
 * mensagem comprida aparece cortada atrás de um "ler mais", que ninguém
 * abre: a informação que importa tem que caber antes do corte.
 *
 * ── Uma linha por loja ───────────────────────────────────────────────────
 *
 * Pedido do Guilherme, e ele tem razão. A resposta em texto corrido ("a
 * Bravos está com R$ 40, a Podium com R$ 120 e a Real...") obriga quem lê a
 * garimpar o nome da loja dele no meio do parágrafo. Uma linha por loja se
 * varre com o olho, e é assim que se usa uma lista dessas: procurando a sua.
 */
const COMO_FALAR_NO_WHATSAPP = `
Esta resposta vai pelo WhatsApp. Escreva para o WhatsApp:
- Negrito é com UM asterisco: *assim*. Dois asteriscos não viram negrito lá,
  aparecem como asterisco na tela.
- Nada de tabela, de cabeçalho com # e de bloco de código.
- Quando a resposta for sobre VÁRIAS lojas, escreva UMA LINHA POR LOJA, com o
  nome da loja em negrito no começo, neste formato:
  *<nome da loja>* — R$ <saldo> · dura ~<n> dias
  Uma linha por loja, nunca várias num parágrafo: quem lê está procurando a
  dele. Use SOMENTE os nomes que vieram nos dados.
- Uma frase curta antes da lista dizendo o que ela é, e no máximo uma depois
  dizendo o que fazer. Nada de introdução nem de despedida.
- Mensagem curta. O WhatsApp esconde o resto atrás de "ler mais", e o que
  fica escondido é como se não tivesse sido dito.`;

/**
 * Primeira chamada: entender a pergunta e escolher o que buscar.
 */
async function escolherConsulta(
  pergunta: string,
  historico: Turno[],
  lojas: string[],
): Promise<z.infer<typeof EscolhaDaConsulta>> {
  const conversa = historico
    .slice(-6)
    .map((t) => `${t.de === "gestor" ? "Gestor" : "Você"}: ${t.texto}`)
    .join("\n");

  const r = await gerarJson({
    system: `Você decide QUAL consulta o sistema deve rodar pra responder a pergunta do gestor.
Você não responde a pergunta agora — só escolhe a consulta. Não invente dados.

As consultas:

- desempenho_das_lojas: como foi cada loja da carteira no período. Use pra
  "quais clientes estão pior", "como foi a semana", comparações entre lojas.
  Parâmetros: periodo.

- desempenho_de_uma_loja: números de UMA loja no período, mais saldo e ritmo
  de gasto. Use pra "como está a loja X". Parâmetros: loja (obrigatório), periodo.

- itens_da_loja: campanhas, conjuntos ou anúncios de uma loja, do que mais
  gastou pro que menos. Use pra "qual campanha gasta mais", "quais anúncios
  tem". Parâmetros: loja (obrigatório), nivel, periodo.

- desperdicio: anúncios que gastaram acima de um mínimo e não trouxeram
  NENHUM resultado. Use pra "onde estou perdendo dinheiro", "o que devo
  otimizar/pausar". Parâmetros: loja (opcional — sem ela, a carteira toda),
  periodo, minimoReais.

- comparar_periodos: uma loja em dois períodos, com a variação calculada.
  Use pra "caiu?", "melhorou?", "essa semana contra a passada".
  Parâmetros: loja (obrigatório), periodo, contra (opcional — vazio compara
  com a janela anterior do mesmo tamanho).

- saldo_das_lojas: saldo das contas pré-pagas e quantos dias ainda dura.
  Use pra "quem vai ficar sem verba", "quem precisa de Pix".

- acoes_recentes: o que foi mexido no sistema (pausas, verbas, textos) e por
  quem. Use pra "o que mudou", "quem pausou isso". Parâmetros: loja, quantas.

- nenhuma: a pergunta não precisa de dado do banco (um "bom dia", uma dúvida
  sobre como o sistema funciona) ou é vaga demais. Preencha porQueNenhuma.

Período aceita só estes valores: ${ATALHOS.join(", ")}. "hoje" é hoje,
"7" são os últimos 7 dias, "mes" é este mês, "tudo" é a vida inteira.
Na dúvida use "7".

O nome da loja tem que ser um destes: ${lojas.join(", ")}.
Se o gestor citar uma loja que não está nessa lista, mande o nome que ele
disse mesmo assim — o sistema devolve o aviso certo.

Campos que não se aplicam vão como null.`,
    user: conversa
      ? `Conversa até agora:\n${conversa}\n\nPergunta nova do gestor: ${pergunta}`
      : `Pergunta do gestor: ${pergunta}`,
    schema: EscolhaDaConsulta,
    maxTokens: 1000,
  });

  return r.dados;
}

/**
 * Segunda chamada: escrever a resposta em cima do que o banco devolveu.
 */
export type Canal = "tela" | "whatsapp";

async function escreverResposta(
  pergunta: string,
  historico: Turno[],
  oQueFoi: string,
  dados: unknown,
  aviso: string | undefined,
  canal: Canal,
): Promise<z.infer<typeof RespostaDoCopiloto>> {
  const conversa = historico
    .slice(-6)
    .map((t) => `${t.de === "gestor" ? "Gestor" : "Você"}: ${t.texto}`)
    .join("\n");

  // Os dados vão como JSON, cortados. Um período grande numa carteira grande
  // passa do que cabe no pedido, e resposta cortada no meio é pior que
  // resposta sobre parte dos dados avisando que é parte.
  const comoTexto = JSON.stringify(dados ?? null, null, 1);
  const CORTE = 60_000;
  const cortado = comoTexto.length > CORTE;

  const r = await gerarJson({
    system:
      canal === "whatsapp" ? COMO_FALAR + COMO_FALAR_NO_WHATSAPP : COMO_FALAR,
    user: [
      conversa ? `Conversa até agora:\n${conversa}\n` : "",
      `Pergunta do gestor: ${pergunta}`,
      "",
      `O sistema consultou: ${oQueFoi}`,
      aviso ? `Aviso da consulta: ${aviso}` : "",
      cortado
        ? "ATENÇÃO: a lista é grande e veio cortada. Responda sobre o que recebeu e diga que há mais."
        : "",
      "",
      "Dados reais, vindos do banco agora:",
      "```json",
      cortado ? comoTexto.slice(0, CORTE) : comoTexto,
      "```",
      "",
      "Responda usando SÓ esses números.",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: RespostaDoCopiloto,
    maxTokens: 4000,
  });

  return r.dados;
}

/**
 * Uma pergunta, uma resposta.
 *
 * Erros do modelo (chave faltando, provedor fora do ar, resposta torta) sobem
 * como exceção com a mensagem já em português — quem chama transforma em
 * recado na tela.
 */
export async function perguntar(
  user: PessoaDaCasa,
  pergunta: string,
  historico: Turno[],
  lojas: string[],
  canal: Canal = "tela",
): Promise<RespostaPronta> {
  const escolha = await escolherConsulta(pergunta, historico, lojas);

  if (escolha.consulta === "nenhuma") {
    const r = await escreverResposta(
      pergunta,
      historico,
      "nada — a pergunta não precisa de dado do sistema",
      null,
      escolha.porQueNenhuma ?? undefined,
      canal,
    );
    return { resposta: r.resposta, acoes: r.acoes, fonte: null };
  }

  const resultado = await rodarConsulta(
    user,
    escolha.consulta as NomeDaConsulta,
    {
      loja: escolha.loja ?? undefined,
      periodo: escolha.periodo ?? undefined,
      contra: escolha.contra ?? undefined,
      nivel: escolha.nivel ?? undefined,
      minimoReais: escolha.minimoReais ?? undefined,
      quantas: escolha.quantas ?? undefined,
    },
  );

  const r = await escreverResposta(
    pergunta,
    historico,
    resultado.oQueFoi,
    resultado.dados,
    resultado.aviso,
    canal,
  );

  return { resposta: r.resposta, acoes: r.acoes, fonte: resultado.oQueFoi };
}
