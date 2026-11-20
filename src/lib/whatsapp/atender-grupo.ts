import "server-only";

import { prisma } from "@/lib/prisma";
import { enviarTexto } from "./zapi";
import {
  entenderPedidoComVarios,
  type AnuncioConhecido,
} from "./entender-pedido";
import { foiMencionado, semAMarcacao } from "./mencao";
import { acharPessoaPeloNumero } from "./atender-privado";
import { responderComoPessoa } from "@/lib/copiloto/responder";
import { avisarAEquipeDaLoja } from "./avisar-a-equipe";
import { acharObjetoDaLoja, mudarStatus } from "@/lib/meta/mudar-status";

// O que o robô faz quando alguém escreve no grupo de uma loja.
//
// ── A ordem das travas, da mais barata pra mais cara ─────────────────────
//
// 1. É grupo conhecido? Mensagem de grupo que não é de nenhuma loja é
//    ignorada sem nem ler. É isso que impede que alguém crie um grupo,
//    adicione o robô e mande "desliga tudo".
// 2. FALARAM COM ELE? Sem o @, a mensagem não é dele. Ver mencao.ts.
// 3. A loja autorizou o robô a agir? Nasce desligado, loja por loja.
// 4. A frase é um pedido pra tirar do ar? Quase nenhuma é.
// 5. Dá pra saber QUAL carro, sem dúvida? Na dúvida, pergunta.
// 6. Só então mexe na Meta.
//
// A trava 2 é a que mudou tudo. Antes dela o robô lia TODA conversa do grupo
// procurando pedido, e num grupo de loja se fala de carro o dia inteiro:
// "vendeu o Compass ontem" era indistinguível de "vendeu o Compass, pode
// tirar". Com o @, quem decide que aquilo é uma ordem é a pessoa — o robô
// parou de adivinhar intenção e passou a obedecer.
//
// ── Por que ele sempre responde no grupo ─────────────────────────────────
//
// Porque é a única coisa que torna o erro corrigível. Um robô que desliga
// calado deixa a loja descobrir em uma semana, pelo lead que não veio. Um
// robô que diz "desliguei o Onix LT 2020 Branco" é corrigido em trinta
// segundos por quem estava ali e leu.

/** Uma mensagem de grupo, já limpa do que a Z-API manda em volta. */
export interface MensagemDoGrupo {
  grupoId: string;
  texto: string;
  /** Nome de quem escreveu, como o WhatsApp mostra. */
  quem: string | null;
  /** Telefone de quem escreveu, dentro do grupo. */
  telefone: string | null;
  /**
   * O número conectado na instância — o próprio robô.
   *
   * Vem do recado da Z-API (`connectedPhone`), não de configuração: é o que
   * permite saber se o @ da mensagem era pra ele. Sem isto o robô não age,
   * porque não tem como provar que foi chamado.
   */
  numeroDoRobo?: string | null;
  /** A lista de marcados, quando a Z-API manda uma. */
  mencionados?: string[];
}

export type Desfecho =
  /** Grupo que não é de nenhuma loja — nem foi lido. */
  | { tipo: "grupo-desconhecido" }
  /** Grupo interno da agência: a IA respondeu uma pergunta da equipe. */
  | { tipo: "respondeu-interno"; userId: string }
  /** Grupo interno, mas não dava pra saber de quem é a pergunta. */
  | { tipo: "interno-sem-dono" }
  /** Ninguém marcou o robô. O caso de quase toda mensagem do grupo. */
  | { tipo: "sem-mencao"; clientId: string }
  /** A loja não autorizou o robô a desligar sozinho. */
  | { tipo: "loja-nao-autoriza"; clientId: string }
  /** A frase não pedia nada. O caso de quase toda mensagem. */
  | { tipo: "sem-pedido"; clientId: string }
  /** Pediu, mas não dá pra saber qual carro. Perguntou no grupo. */
  | { tipo: "perguntou"; clientId: string; quantos: number }
  /** O carro não está anunciado. A equipe foi avisada no privado. */
  | { tipo: "nao-anunciado"; clientId: string; avisados: number }
  /** Desligou e avisou no grupo. Pode ter sido mais de um carro. */
  | { tipo: "desligou"; clientId: string; adId: string; nome: string }
  /** Mais de um carro na mesma mensagem. */
  | { tipo: "desligou-varios"; clientId: string; quantos: number }
  /** Tentou desligar e a Meta recusou. */
  | { tipo: "falhou"; clientId: string; erro: string };

/**
 * Quantos anúncios no máximo o robô lista quando não sabe qual é.
 *
 * Lista comprida no WhatsApp não é lida. Se há mais que isto parecendo com o
 * que foi pedido, o pedido estava vago demais pra valer uma lista.
 */
const MAXIMO_NA_PERGUNTA = 5;

export async function atenderMensagemDoGrupo(
  m: MensagemDoGrupo,
): Promise<Desfecho> {
  // ── 0. É um grupo INTERNO da agência? ─────────────────────────────────
  //
  // Aqui a conversa é outra: ninguém pede pra desligar carro, a equipe
  // pergunta sobre as lojas. Quem responde é o Copiloto, com a carteira de
  // QUEM ESCREVEU — descoberta pelo telefone dele dentro do grupo.
  //
  // A lista de grupos internos é explícita, e esta é a trava mais importante
  // deste arquivo depois do @: se a IA respondesse pergunta em qualquer
  // grupo, bastaria alguém perguntar "quais lojas estão sem verba?" no grupo
  // de um cliente pra ela listar as lojas dos OUTROS clientes ali dentro.
  const interno = await prisma.grupoInterno.findUnique({
    where: { grupoId: m.grupoId },
    select: { grupoId: true },
  });
  if (interno) return atenderNoGrupoInterno(m);

  // ── 1. O grupo é de alguma loja? ──────────────────────────────────────
  const loja = await prisma.client.findFirst({
    where: { whatsappGrupoId: m.grupoId },
    select: {
      id: true,
      companyName: true,
      whatsappDesligaAuto: true,
      metaAdAccounts: {
        where: { active: true },
        select: { id: true },
      },
    },
  });
  if (!loja) return { tipo: "grupo-desconhecido" };

  // ── 2. Falaram com ele? ───────────────────────────────────────────────
  //
  // Antes de tudo que custa: sem o @ a mensagem não é dele, e o grupo inteiro
  // de conversa normal morre aqui sem gastar consulta de criativo nenhuma.
  if (!foiMencionado(m.texto, m.numeroDoRobo, m.mencionados)) {
    return { tipo: "sem-mencao", clientId: loja.id };
  }

  // ── 3. Esta loja deixou o robô agir? ──────────────────────────────────
  //
  // Antes de ler a frase, porque loja que não autorizou não deve nem ter a
  // mensagem interpretada — e porque assim desligar o interruptor desliga
  // o robô de verdade, não só a última etapa.
  //
  // ── Por que isto deixou de ser silêncio ───────────────────────────────
  //
  // Porque era. O Guilherme marcou o robô no grupo da R2 duas vezes, em uma
  // hora diferente cada, e não recebeu nada — nem no grupo, nem no privado.
  // Do lado de fora, "o robô decidiu que não pode agir" e "o robô está
  // quebrado" são a mesma coisa: nenhuma resposta.
  //
  // O interruptor continua mandando: a loja que não autorizou segue sem ter
  // anúncio nenhum tocado. O que mudou é que agora alguém fica sabendo que
  // pediram — a equipe no privado, com o nome da loja e onde ligar.
  //
  // No grupo vai uma linha neutra. "Esta loja não me autorizou" seria expor
  // configuração nossa na conversa do cliente; "Anotado, avisei a equipe" diz
  // a verdade que importa pra quem escreveu: foi lido.
  if (!loja.whatsappDesligaAuto) {
    await avisarAEquipeDaLoja(
      loja.id,
      `*${loja.companyName}* — me marcaram no grupo e pediram alguma coisa, ` +
        `mas o robô NÃO está autorizado a mexer em anúncio nessa loja.\n\n` +
        `Quem escreveu: ${m.quem ?? "não identificado"}\n` +
        `A mensagem: "${m.texto.slice(0, 200)}"\n\n` +
        `Pra ele poder agir: Configurações → WhatsApp → na linha da ` +
        `${loja.companyName}, marca "Desligar anúncio sozinho quando pedirem ` +
        `neste grupo".`,
    );
    await responder(
      m.grupoId,
      "Anotado! Já avisei a equipe pra cuidar disso.",
    );
    return { tipo: "loja-nao-autoriza", clientId: loja.id };
  }

  // ── 3. e 4. A frase pede, e dá pra saber qual? ────────────────────────
  const contas = loja.metaAdAccounts.map((c) => c.id);
  const criativos = contas.length
    ? await prisma.metaAdCreative.findMany({
        // Só o que está no ar: pedir pra desligar o que já está desligado é
        // pedido que se atende sozinho, e um anúncio pausado na lista só
        // aumentaria a chance de o robô escolher o errado.
        where: { adAccountId: { in: contas }, effectiveStatus: "ACTIVE" },
        select: { adId: true, adName: true, titulo: true, legenda: true },
      })
    : [];

  const anuncios: AnuncioConhecido[] = criativos.map((c) => ({
    adId: c.adId,
    nome: c.adName,
    textos: [c.titulo, c.legenda].filter((t): t is string => !!t),
  }));

  // Sem a marcação: o número do robô dentro do texto entraria na conta de
  // raridade de palavras e poderia, sozinho, empurrar a escolha pro anúncio
  // errado. Ver semAMarcacao.
  const pedido = entenderPedidoComVarios(semAMarcacao(m.texto), anuncios);
  if (pedido.intencao === "nenhuma") {
    return { tipo: "sem-pedido", clientId: loja.id };
  }

  // ── O carro não está anunciado ────────────────────────────────────────
  //
  // Pedido do Guilherme, e a razão é boa: "não achei esse carro nos anúncios"
  // é um problema NOSSO — ou ele nunca foi anunciado, ou o anúncio tem outro
  // nome, ou já tinha sido pausado. Nenhum dos três o dono da loja resolve, e
  // ler isso no grupo dele só passa a impressão de que o sistema não sabe o
  // que está fazendo.
  //
  // Então o detalhe vai pro privado de quem cuida da loja, e no grupo fica
  // uma linha curta — curta, mas não silêncio: quem escreveu pediu uma coisa
  // e precisa saber que foi lido.
  if (pedido.alvos.length === 0) {
    const emCartaz = anuncios.slice(0, 12).map((a) => `• ${a.nome}`).join("\n");
    const aviso = await avisarAEquipeDaLoja(
      loja.id,
      `*${loja.companyName}* — pediram pra tirar um carro do ar e eu não achei ` +
        `qual.\n\nQuem escreveu: ${m.quem ?? "não identificado"}\n` +
        `A mensagem: "${m.texto.slice(0, 200)}"\n\n` +
        (anuncios.length === 0
          ? "Esta loja não tem nenhum anúncio ativo no momento."
          : `Os ${anuncios.length} anúncios no ar hoje:\n${emCartaz}` +
            (anuncios.length > 12 ? `\n…e mais ${anuncios.length - 12}.` : "")) +
        `\n\nSe for pra tirar algum, faz pelo Legacy OS.`,
    );

    await responder(
      m.grupoId,
      "Anotado! Esse carro não está entre os anúncios que estão no ar agora. " +
        "Já avisei a equipe pra conferir.",
    );

    return {
      tipo: "nao-anunciado",
      clientId: loja.id,
      avisados: aviso.mandados,
    };
  }

  // ── 5. Mexer na Meta, um carro de cada vez ────────────────────────────
  //
  // ── Por que vários ────────────────────────────────────────────────────
  //
  // Porque é como as pessoas escrevem. O primeiro pedido real foi "pausar
  // anúncios mobi 2018 e peugeot 2008" — dois carros numa frase. Atender só
  // o primeiro seria pior que não atender: o segundo continuaria no ar com
  // todo mundo achando que tinha saído.
  //
  // Os duvidosos viram UMA pergunta no fim, não uma por carro: três
  // perguntas seguidas no grupo do cliente é o robô falando sozinho.

  const quem = [m.quem, m.telefone].filter(Boolean).join(" · ") || null;

  const tirados: string[] = [];
  const falhas: string[] = [];
  const emDuvida: AnuncioConhecido[] = [];

  for (const alvo of pedido.alvos) {
    if (!alvo.semDuvida) {
      for (const c of alvo.candidatos) emDuvida.push(c);
      continue;
    }

    // De novo pelo cadastro da loja, e não pelo id que veio da leitura: é a
    // mesma trava que impede um id trocado no navegador de pausar a campanha
    // de outra pessoa. Custa uma consulta e fecha a porta.
    const objeto = await acharObjetoDaLoja(
      loja.id,
      "anuncio",
      alvo.candidatos[0].adId,
    );
    if (!objeto) continue;

    const r = await mudarStatus({
      clientId: loja.id,
      quemId: null,
      nivel: "anuncio",
      objeto,
      ligar: false,
      origem: "whatsapp",
      pedidoPor: quem,
      pedidoTexto: m.texto,
    });

    if (r.ok) tirados.push(objeto.nome);
    else falhas.push(`${objeto.nome} (${r.erro})`);
  }

  // ── Uma resposta só, com tudo que aconteceu ───────────────────────────
  const partes: string[] = [];
  if (tirados.length === 1) {
    partes.push(`Pronto, tirei *${tirados[0]}* do ar.`);
  } else if (tirados.length > 1) {
    partes.push(
      `Pronto, tirei do ar:\n${tirados.map((n) => `• *${n}*`).join("\n")}`,
    );
  }
  if (falhas.length > 0) {
    partes.push(
      `Não consegui tirar ${falhas.join("; ")}. Já avisei a equipe — ` +
        `alguém vai fazer na mão.`,
    );
  }
  if (emDuvida.length > 0) {
    partes.push(textoDaPergunta(emDuvida));
  }
  if (tirados.length > 0 && falhas.length === 0 && emDuvida.length === 0) {
    partes.push("Se não era esse, me avisa aqui que a gente liga de volta na hora.");
  }

  if (partes.length > 0) await responder(m.grupoId, partes.join("\n\n"));

  if (falhas.length > 0 && tirados.length === 0) {
    return { tipo: "falhou", clientId: loja.id, erro: falhas.join("; ") };
  }
  if (tirados.length === 0) {
    return { tipo: "perguntou", clientId: loja.id, quantos: emDuvida.length };
  }
  if (tirados.length === 1) {
    return {
      tipo: "desligou",
      clientId: loja.id,
      adId: pedido.alvos[0].candidatos[0].adId,
      nome: tirados[0],
    };
  }
  return { tipo: "desligou-varios", clientId: loja.id, quantos: tirados.length };
}

/**
 * A IA respondendo a equipe dentro de um grupo interno.
 *
 * ── Por que a carteira é de quem ESCREVEU ────────────────────────────────
 *
 * Porque é a pergunta dela. Se a Giovana pergunta "quais lojas minhas estão
 * sem verba?", a resposta certa é sobre as lojas da Giovana — num grupo ou no
 * privado, dá no mesmo. Usar a carteira "do grupo" não existe: grupo não tem
 * carteira.
 *
 * Consequência que vale saber: a resposta aparece pra TODOS do grupo. Num
 * grupo interno isso é o esperado — é a equipe. E é mais um motivo pra a
 * lista de grupos internos ser explícita.
 *
 * ── Por que também exige o @ ─────────────────────────────────────────────
 *
 * Mesma razão do grupo de loja, e mais uma: grupo interno tem conversa o dia
 * inteiro, e uma IA que responde tudo que parece pergunta vira ruído — e cada
 * palpite dela custa duas chamadas ao modelo.
 */
async function atenderNoGrupoInterno(m: MensagemDoGrupo): Promise<Desfecho> {
  if (!foiMencionado(m.texto, m.numeroDoRobo, m.mencionados)) {
    return { tipo: "interno-sem-dono" };
  }

  // Quem escreveu, pelo telefone dele dentro do grupo. Sem telefone ou sem
  // cadastro não há carteira pra usar — e responder com a de outra pessoa
  // seria o erro exato que todas estas travas existem pra evitar.
  const pessoa = m.telefone ? await acharPessoaPeloNumero(m.telefone) : null;

  if (!pessoa) {
    await responder(
      m.grupoId,
      "Oi! Eu respondo sobre as lojas, mas só pra quem está cadastrado no " +
        "Legacy OS — e não reconheci este número. Fala com o Guilherme.",
    );
    return { tipo: "interno-sem-dono" };
  }

  const r = await responderComoPessoa(
    pessoa,
    semAMarcacao(m.texto),
    [],
    "whatsapp",
  );

  if (r.erro || r.resposta === undefined) {
    await responder(
      m.grupoId,
      `Não consegui responder agora: ${r.erro ?? "não veio resposta."}`,
    );
    return { tipo: "interno-sem-dono" };
  }

  // Ação proposta vira texto, não botão: executar daqui ainda não existe.
  const acoes = r.acoes ?? [];
  await responder(
    m.grupoId,
    r.resposta +
      (acoes.length > 0
        ? "\n\nAbre o Legacy OS pra executar o que eu sugeri."
        : ""),
  );
  return { tipo: "respondeu-interno", userId: pessoa.id };
}

/**
 * A pergunta de quando não dá pra ter certeza.
 *
 * Ela PEDE que marquem de novo, e isso não é formalidade: a regra do @ vale
 * pra toda mensagem, inclusive pra resposta desta pergunta. Um robô que
 * perguntasse "qual desses?" e ignorasse calado a resposta pareceria quebrado
 * — então a pergunta tem que ensinar como responder.
 */
function textoDaPergunta(candidatos: AnuncioConhecido[]): string {
  const comoResponder =
    "Me marca com @ de novo junto com o nome e eu desligo.";

  // A lista vazia não chega mais aqui: ela virou o caminho do "não está
  // anunciado", que avisa a equipe no privado em vez de discutir no grupo do
  // cliente. Ficou a guarda, porque função que confia em quem a chama é
  // função que quebra no dia em que alguém a chamar de outro lugar.
  if (candidatos.length === 0) return comoResponder;
  const lista = candidatos
    .slice(0, MAXIMO_NA_PERGUNTA)
    .map((c) => `• ${c.nome}`)
    .join("\n");
  const sobrando = candidatos.length - MAXIMO_NA_PERGUNTA;
  return (
    `Qual desses eu tiro do ar?\n\n${lista}` +
    (sobrando > 0 ? `\n…e mais ${sobrando}.` : "") +
    `\n\n${comoResponder}`
  );
}

/**
 * Fala no grupo.
 *
 * Falha de resposta NUNCA derruba o atendimento: se o anúncio já foi
 * desligado e o aviso não saiu, o estrago de estourar aqui seria a Z-API
 * tentando de novo e o robô desligando duas vezes.
 */
async function responder(grupoId: string, texto: string): Promise<void> {
  try {
    await enviarTexto(grupoId, texto);
  } catch {
    // Silêncio de propósito — ver acima.
  }
}
