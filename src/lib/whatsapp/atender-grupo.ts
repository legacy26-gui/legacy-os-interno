import "server-only";

import { prisma } from "@/lib/prisma";
import { enviarTexto } from "./zapi";
import {
  achatar,
  entenderPedidoComVarios,
  nomeNormalizado,
  type AnuncioConhecido,
  type PedidoComVarios,
  type Sugestao,
} from "./entender-pedido";
import { foiMencionado, marcacoesDoTexto, mesmoNumero, semAMarcacao } from "./mencao";
import { lidDoRobo } from "./identidade-do-robo";
import { acharPessoaPeloNumero } from "./atender-privado";
import { responderComoPessoa } from "@/lib/copiloto/responder";
import { avisarAEquipeDaLoja } from "./avisar-a-equipe";
import { anotar } from "./trilha";
import { listaDosAnunciosAtivos, pedeListaDeAnuncios } from "./anuncios-ativos";
import { tratarListaNoPrivado } from "./anuncios-ativos-no-privado";
import { donosDosAnuncios, nomeIdentificavel } from "./nome-do-anuncio";
import { apagarPergunta, guardarPergunta, lerPergunta, lerResposta } from "./pergunta-no-grupo";
import { pedeSugestao, semRecomendacao } from "@/lib/copiloto/pede-sugestao";
import { tratarVendaNoGrupo } from "@/lib/vendas/venda-por-lead";
import { atenderGrupoFinanceiro, type DesfechoFinanceiro } from "@/lib/financeiro-ia/atender-financeiro";
import { acharObjetoDaLoja, mudarStatus } from "@/lib/meta/mudar-status";
import {
  conjuntosNoAr,
  pausarConjuntosVazios,
  pedeConjunto,
  semPalavraConjunto,
  textoDosConjuntosVazios,
} from "./conjuntos";

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
  /**
   * O id da mensagem na Z-API, só pra juntar os passos da trilha.
   *
   * Não participa de decisão nenhuma: quem garante atendimento único é o
   * `primeiraVez` na rota, antes daqui.
   */
  messageId?: string | null;
}

export type Desfecho =
  /** O grupo financeiro do dono: gasto anotado virou lançamento (ver atender-financeiro.ts). */
  | { tipo: "financeiro"; desfecho: DesfechoFinanceiro }
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
  /** Pediram "quais anúncios ativos": o robô mandou a lista dos carros no ar (só leitura). */
  | { tipo: "lista-de-anuncios"; clientId: string; carros: number }
  /** A frase não pedia nada. O caso de quase toda mensagem. */
  | { tipo: "sem-pedido"; clientId: string }
  /** Perguntaram sobre a loja no grupo dela, e a IA respondeu ali. */
  | { tipo: "respondeu-da-loja"; clientId: string }
  /** Pediu, mas não dá pra saber qual carro. Perguntou no grupo. */
  | { tipo: "perguntou"; clientId: string; quantos: number }
  /** Uma palavra do pedido lembrava um carro anunciado: perguntou "quis dizer?". */
  | { tipo: "sugeriu"; clientId: string; quantas: number }
  /** O carro não está anunciado. A equipe foi avisada no privado. */
  | { tipo: "nao-anunciado"; clientId: string; avisados: number }
  /** Desligou e avisou no grupo. Pode ter sido mais de um carro. */
  | { tipo: "desligou"; clientId: string; adId: string; nome: string }
  /** Mais de um carro na mesma mensagem. */
  | { tipo: "desligou-varios"; clientId: string; quantos: number }
  /** Tentou desligar e a Meta recusou. */
  | { tipo: "falhou"; clientId: string; erro: string }
  /** Falou de venda: registrou, perguntou o que faltava, ou explicou por que não. */
  | { tipo: "venda"; clientId: string; passo: string };

/**
 * Quantos anúncios no máximo o robô lista quando não sabe qual é.
 *
 * Lista comprida no WhatsApp não é lida. Se há mais que isto parecendo com o
 * que foi pedido, o pedido estava vago demais pra valer uma lista.
 */
const MAXIMO_NA_PERGUNTA = 10;
/** Acima disto, um pedido só tira do ar depois de um "sim" (trava contra entender errado). */
const LIMITE_SEM_CONFIRMAR = 8;

/**
 * Falaram comigo? — pelo telefone OU pelo "@lid".
 *
 * Primeiro o barato: o telefone, que não custa chamada nenhuma. Só se o
 * texto TEM uma marcação e ela não bateu é que se pergunta à Z-API qual é o
 * nosso lid. Conversa de grupo sem marcação nenhuma — a maior parte — nunca
 * chega a custar uma consulta.
 *
 * Devolve também o que foi visto, porque "descartei a mensagem" sem dizer
 * por quê foi o que fez o silêncio da R2 durar dois dias: a trilha precisa
 * poder responder "a marcação tinha 14 dígitos e eu só conhecia 12".
 */
async function fuiChamado(m: MensagemDoGrupo): Promise<{
  chamado: boolean;
  porLid: boolean;
  /** Quantos dígitos tinha cada marcação — o tamanho, nunca o número. */
  tamanhos: number[];
  /** Quantos dígitos tem o lid que a Z-API deu, ou null se não deu. */
  tamanhoDoLid: number | null;
}> {
  const tamanhos = marcacoesDoTexto(m.texto).map((x) => x.digitos.length);

  if (foiMencionado(m.texto, m.numeroDoRobo, m.mencionados)) {
    return { chamado: true, porLid: false, tamanhos, tamanhoDoLid: null };
  }
  // Sem marcação nenhuma, ou sem saber o próprio número: nada a perguntar.
  if (tamanhos.length === 0 || !m.numeroDoRobo) {
    return { chamado: false, porLid: false, tamanhos, tamanhoDoLid: null };
  }

  const lid = await lidDoRobo(m.numeroDoRobo);
  if (!lid) {
    return { chamado: false, porLid: false, tamanhos, tamanhoDoLid: null };
  }
  const chamado = foiMencionado(m.texto, m.numeroDoRobo, m.mencionados, [lid]);
  return { chamado, porLid: chamado, tamanhos, tamanhoDoLid: lid.length };
}

export async function atenderMensagemDoGrupo(
  m: MensagemDoGrupo,
): Promise<Desfecho> {
  // A primeira linha da trilha. Sem ela, não dá pra distinguir "o
  // atendimento nem começou" de "começou e decidiu ficar quieto" — e essa
  // distinção foi o que faltou pra achar o silêncio no grupo da R2.
  await anotar(m.messageId, m.grupoId, "chegou", `${m.texto.length} caracteres`);

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
  // ── 0a. É o grupo FINANCEIRO de alguém? ───────────────────────────────
  //
  // Vem antes de tudo: ali não se pede pra desligar carro nem se pergunta de
  // loja — cada mensagem do dono é um gasto. Ver atender-financeiro.ts.
  const financeiro = await prisma.grupoFinanceiro.findUnique({
    where: { grupoId: m.grupoId },
    select: { donoId: true },
  });
  if (financeiro) {
    await anotar(m.messageId, m.grupoId, "grupo-financeiro");
    const desfecho = await atenderGrupoFinanceiro(
      { grupoId: m.grupoId, texto: semAMarcacao(m.texto), telefone: m.telefone, messageId: m.messageId },
      financeiro,
    );
    return { tipo: "financeiro", desfecho };
  }

  const interno = await prisma.grupoInterno.findUnique({
    where: { grupoId: m.grupoId },
    select: { grupoId: true },
  });
  if (interno) {
    await anotar(m.messageId, m.grupoId, "grupo-interno");
    return atenderNoGrupoInterno(m);
  }

  // ── 1. O grupo é de alguma loja? ──────────────────────────────────────
  const loja = await prisma.client.findFirst({
    where: { whatsappGrupoId: m.grupoId },
    select: {
      id: true,
      companyName: true,
      whatsappDesligaAuto: true,
      controlaVendas: true,
      metaAdAccounts: {
        where: { active: true },
        select: { id: true },
      },
    },
  });
  if (!loja) {
    // Grupo que não é de loja nenhuma: não age, nunca. Mas se alguém DA CASA marcou o robô, ficar calado
    // parece defeito (o robô acabou de entrar no grupo e ninguém ligou o grupo à loja). Aí ele responde
    // dizendo isso — e só isso. Número de fora continua sem resposta nenhuma.
    const chamada = await fuiChamado(m);
    const pessoa = chamada.chamado && m.telefone ? await acharPessoaPeloNumero(m.telefone) : null;
    if (pessoa) {
      await anotar(m.messageId, m.grupoId, "grupo-desconhecido-avisou", pessoa.name);
      await responder(
        m.grupoId,
        `Oi, ${pessoa.name.split(" ")[0]}! Este grupo ainda *não está ligado a nenhuma loja* no Legacy OS, então não mexo em nada aqui. ` +
          "Pra ligar: Legacy OS → Configurações → WhatsApp → na loja certa, escolhe este grupo. Depois é só me chamar de novo.",
        m.messageId,
      );
      return { tipo: "grupo-desconhecido" };
    }
    await anotar(m.messageId, m.grupoId, "grupo-desconhecido");
    return { tipo: "grupo-desconhecido" };
  }

  // ── 2. Falaram com ele? ───────────────────────────────────────────────
  //
  // Antes de tudo que custa: sem o @ a mensagem não é dele, e o grupo inteiro
  // de conversa normal morre aqui sem gastar consulta de criativo nenhuma.
  const chamada = await fuiChamado(m);
  if (!chamada.chamado) {
    await anotar(
      m.messageId,
      m.grupoId,
      "sem-mencao",
      `${loja.companyName} · robô=${m.numeroDoRobo ?? "(não veio)"} · ` +
        `marcações=[${chamada.tamanhos.join(",")}] dígitos · ` +
        `lid=${chamada.tamanhoDoLid ?? "não achei"}`,
    );
    return { tipo: "sem-mencao", clientId: loja.id };
  }
  if (chamada.porLid) {
    // O caso que antes caía em silêncio. Fica registrado pra ser possível
    // ver, depois, que a marcação por lid é o que está acontecendo.
    await anotar(m.messageId, m.grupoId, "marcado-por-lid", loja.companyName);
  }

  // ── 2b. "Quais anúncios ativos?" ───────────────────────────────────────
  //
  // Só LEITURA: lista os carros que estão no ar, de todos os conjuntos. Por não mexer em nada, responde mesmo na
  // loja que ainda não autorizou o robô a desligar anúncio (a trava 3 abaixo é sobre agir, não sobre ler).
  if (pedeListaDeAnuncios(semAMarcacao(m.texto))) {
    const lista = await listaDosAnunciosAtivos({ nome: loja.companyName, contas: loja.metaAdAccounts.map((c) => c.id) });
    await anotar(m.messageId, m.grupoId, "lista-de-anuncios", `${loja.companyName} · ${lista.carros} carros · ${lista.anuncios} anúncios`);
    for (const texto of lista.mensagens) await responder(m.grupoId, texto, m.messageId);
    return { tipo: "lista-de-anuncios", clientId: loja.id, carros: lista.carros };
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
    await anotar(m.messageId, m.grupoId, "loja-nao-autoriza", loja.companyName);
    await avisarAEquipeDaLoja(
      loja.id,
      `*${loja.companyName}* — me marcaram no grupo e pediram alguma coisa, ` +
        `mas o robô NÃO está autorizado a mexer em anúncio nessa loja.\n\n` +
        `Quem escreveu: ${m.quem ?? "não identificado"}\n` +
        `A mensagem: "${semAMarcacao(m.texto).slice(0, 200)}"\n\n` +
        `Pra ele poder agir: Configurações → WhatsApp → na linha da ` +
        `${loja.companyName}, marca "Desligar anúncio sozinho quando pedirem ` +
        `neste grupo".`,
    );
    await responder(
      m.grupoId,
      "Anotado! Já avisei a equipe pra cuidar disso.",
      m.messageId,
    );
    return { tipo: "loja-nao-autoriza", clientId: loja.id };
  }

  // ── Venda por lead ────────────────────────────────────────────────────
  //
  // Vem ANTES de ler a frase como pedido pra desligar, por dois motivos.
  //
  // Um: a resposta à pergunta que o robô deixou aberta ("68 mil, lead") não é
  // pedido de nada, e lida como pedido cairia em "esse carro não está nos
  // anúncios". Dois: quando é um aviso de venda, o robô desliga o anúncio do
  // mesmo jeito que sempre fez — aqui só se decide o que MAIS dizer.
  // ── A resposta a uma pergunta que o robô deixou aberta ──────────────────
  //
  // "Qual desses eu tiro do ar? 1… 2… 3…" → "1 e 3" / "todos" / os nomes. A resposta de QUEM pediu escolhe SÓ dentro da lista
  // guardada (ver pergunta-no-grupo.ts): sem isto, os nomes da resposta eram lidos como pedido novo e casavam com anúncios de
  // outros carros. Vem antes da venda: "1 e 3" não é aviso de venda.
  const aberta = await lerPergunta(m.grupoId);
  const daPessoa = !!aberta && aberta.clientId === loja.id && (!aberta.quem || !m.telefone || mesmoNumero(aberta.quem, m.telefone));
  const resposta = aberta && daPessoa ? lerResposta(semAMarcacao(m.texto), aberta.tipo, aberta.candidatos) : null;
  if (resposta?.tipo === "cancelou") {
    await apagarPergunta(m.grupoId);
    await anotar(m.messageId, m.grupoId, "pergunta-cancelada", loja.companyName);
    await responder(m.grupoId, "Ok, não tirei nenhum.", m.messageId);
    return { tipo: "perguntou", clientId: loja.id, quantos: 0 };
  }

  const venda = resposta
    ? ({ fim: false, recado: null, passo: null } as unknown as Awaited<ReturnType<typeof tratarVendaNoGrupo>>)
    : await tratarVendaNoGrupo({
    loja: {
      id: loja.id,
      companyName: loja.companyName,
      controlaVendas: loja.controlaVendas,
      contas: loja.metaAdAccounts.map((c) => c.id),
    },
    grupoId: m.grupoId,
    texto: semAMarcacao(m.texto),
    quem: m.quem,
    messageId: m.messageId,
  });
  if (venda.fim) {
    if (venda.recado) await responder(m.grupoId, venda.recado, m.messageId);
    return { tipo: "venda", clientId: loja.id, passo: venda.passo ?? "" };
  }

  // ── 3. e 4. A frase pede, e dá pra saber qual? ────────────────────────
  const contas = loja.metaAdAccounts.map((c) => c.id);

  // ── "Pausa o CONJUNTO do Versa" ───────────────────────────────────────
  //
  // Só quando a pessoa escreve "conjunto": pausar um conjunto para todos os
  // anúncios dentro dele, e isso não se faz por adivinhação. Se nenhum conjunto
  // tem esse nome, o robô cai no pedido de sempre (tirar os anúncios do carro) e
  // diz isso na resposta — quem pediu quer o carro parado, e não um "não achei".
  let conjuntoNaoAchado = false;
  if (!resposta && pedeConjunto(semAMarcacao(m.texto))) {
    const conjuntos = await conjuntosNoAr(contas);
    const lidoC = entenderPedidoComVarios(semPalavraConjunto(semAMarcacao(m.texto)), conjuntos);
    if (lidoC.intencao === "desligar" && lidoC.alvos.length > 0) {
      return await tirarConjuntos(m, loja, lidoC, venda.recado);
    }
    conjuntoNaoAchado = true;
  }

  const criativos = contas.length
    ? await prisma.metaAdCreative.findMany({
        // Só o que está no ar: pedir pra desligar o que já está desligado é
        // pedido que se atende sozinho, e um anúncio pausado na lista só
        // aumentaria a chance de o robô escolher o errado.
        where: { adAccountId: { in: contas }, effectiveStatus: "ACTIVE" },
        select: { adId: true, adName: true, titulo: true, legenda: true, adsetId: true, campaignId: true },
      })
    : [];

  // Anúncio de nome só de formato ("Stories", "Video") ganha o nome do conjunto: é ele que diz o carro. Ver nome-do-anuncio.ts.
  const donoDe = await donosDosAnuncios(criativos);
  const anuncios: AnuncioConhecido[] = criativos.map((c) => ({
    adId: c.adId,
    nome: nomeIdentificavel(c.adName, donoDe(c).conjunto, donoDe(c).campanha).nome,
    textos: [c.titulo, c.legenda].filter((t): t is string => !!t),
  }));

  // Sem a marcação: o número do robô dentro do texto entraria na conta de
  // raridade de palavras e poderia, sozinho, empurrar a escolha pro anúncio
  // errado. Ver semAMarcacao.
  let pedido: PedidoComVarios;
  let confirmado = false;
  if (resposta?.tipo === "escolheu") {
    await apagarPergunta(m.grupoId);
    // Só o que AINDA está no ar, e só da lista que foi perguntada.
    const noAr = new Map(anuncios.map((a) => [a.adId, a]));
    const escolhidos = resposta.adIds.map((id) => noAr.get(id)).filter((a): a is AnuncioConhecido => !!a);
    await anotar(m.messageId, m.grupoId, "resposta-da-pergunta", `${aberta!.tipo} · ${escolhidos.length} de ${aberta!.candidatos.length}`);
    if (escolhidos.length === 0) {
      await responder(m.grupoId, "Esses já não estão mais no ar.", m.messageId);
      return { tipo: "perguntou", clientId: loja.id, quantos: 0 };
    }
    pedido = { intencao: "desligar", alvos: [{ trecho: "", candidatos: escolhidos, semDuvida: true, mesmoCarro: escolhidos }], sugestoes: [] };
    confirmado = true;
  } else {
    pedido = entenderPedidoComVarios(semAMarcacao(m.texto), anuncios);
    // "Pausa TODOS os anúncios do Pulse": se a dúvida é só entre anúncios do MESMO carro, "todos" resolve — são todos eles.
    if (/\b(todos|todas)\b/.test(achatar(semAMarcacao(m.texto)))) {
      pedido = {
        ...pedido,
        alvos: pedido.alvos.map((a) =>
          !a.semDuvida && a.candidatos.length > 0 && new Set(a.candidatos.map((c) => nomeNormalizado(c.nome))).size === 1
            ? { ...a, semDuvida: true, mesmoCarro: a.candidatos }
            : a,
        ),
      };
    }
  }
  // O carro vendido já estava pausado (ou nem tinha anúncio no ar): não há o que
  // desligar, e dizer "esse carro não está no ar" seria a resposta errada a um
  // aviso de venda. O que o robô tem a dizer é sobre a venda.
  if (venda.recado && pedido.alvos.length === 0) {
    await responder(m.grupoId, venda.recado, m.messageId);
    return { tipo: "venda", clientId: loja.id, passo: venda.passo ?? "" };
  }

  if (pedido.intencao === "nenhuma") {
    await anotar(
      m.messageId,
      m.grupoId,
      "nao-e-pedido-vira-pergunta",
      `${loja.companyName} · ${anuncios.length} anúncios no ar`,
    );
    // Não é pedido pra tirar carro: então é pergunta sobre a loja, e a IA
    // responde ali mesmo — recortada NAQUELA loja.
    return responderSobreALoja(m, loja.id, loja.companyName);
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
  // ── Erro de digitação, não carro ausente ──────────────────────────────
  //
  // Pediram "virtual" e a loja tem Virtus. O celular trocou a palavra, o carro
  // está no ar — e responder "esse carro não está nos anúncios" seria dizer à
  // pessoa que o robô não conhece o carro dela. Aqui o robô PERGUNTA, no
  // próprio grupo: um erro de digitação é da conversa, não um problema nosso
  // que precise ir pro privado.
  if (pedido.alvos.length === 0 && pedido.sugestoes.length > 0) {
    await anotar(
      m.messageId,
      m.grupoId,
      "sugeriu",
      `${loja.companyName} · ${pedido.sugestoes.map((x) => x.quis).join(", ")}`,
    );
    await responder(m.grupoId, textoDaSugestao(pedido.sugestoes), m.messageId);
    return {
      tipo: "sugeriu",
      clientId: loja.id,
      quantas: pedido.sugestoes.length,
    };
  }

  if (pedido.alvos.length === 0) {
    await anotar(
      m.messageId,
      m.grupoId,
      "carro-nao-anunciado",
      `${loja.companyName} · ${anuncios.length} anúncios no ar`,
    );
    const emCartaz = anuncios.slice(0, 12).map((a) => `• ${a.nome}`).join("\n");
    const aviso = await avisarAEquipeDaLoja(
      loja.id,
      `*${loja.companyName}* — pediram pra tirar um carro do ar e eu não achei ` +
        `qual.\n\nQuem escreveu: ${m.quem ?? "não identificado"}\n` +
        `A mensagem: "${semAMarcacao(m.texto).slice(0, 200)}"\n\n` +
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
      m.messageId,
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

  // ── Trava de quantidade ───────────────────────────────────────────────
  //
  // Um pedido que tiraria muitos anúncios de uma vez PERGUNTA antes. É a rede de segurança pro caso de o robô ter entendido
  // errado: um "sim" a mais custa uma mensagem; uma loja inteira fora do ar custa o dia.
  const aTirar = pedido.alvos.filter((a) => a.semDuvida).flatMap((a) => a.mesmoCarro);
  if (!confirmado && aTirar.length > LIMITE_SEM_CONFIRMAR) {
    const carros = [...new Set(aTirar.map((a) => (a.nome.includes(" — ") ? a.nome.split(" — ")[0] : a.nome)))];
    await guardarPergunta({ grupoId: m.grupoId, clientId: loja.id, quem: m.telefone ?? null, tipo: "confirmar", candidatos: aTirar.map((a) => ({ adId: a.adId, nome: a.nome })) });
    await anotar(m.messageId, m.grupoId, "pediu-confirmacao", `${aTirar.length} anúncios`);
    await responder(
      m.grupoId,
      `Isso tira *${aTirar.length} anúncios* do ar, de ${carros.length === 1 ? "um carro" : `${carros.length} carros`}:\n` +
        carros.slice(0, 10).map((c) => `• ${c}`).join("\n") +
        (carros.length > 10 ? `\n…e mais ${carros.length - 10}.` : "") +
        "\n\nConfirma? Me marca e responde *sim*. Pra não tirar: *não*.",
      m.messageId,
    );
    return { tipo: "perguntou", clientId: loja.id, quantos: aTirar.length };
  }

  const tirados: string[] = [];
  const idsTirados: string[] = [];
  const falhas: string[] = [];
  const emDuvida: AnuncioConhecido[] = [];

  await anotar(
    m.messageId,
    m.grupoId,
    "entendi",
    pedido.alvos
      .map(
        (a) =>
          `${a.semDuvida ? "certo" : "dúvida"}:${a.semDuvida ? a.mesmoCarro.map((c) => c.nome).join(" + ") : `${a.candidatos.length} candidatos`}`,
      )
      .join(" | "),
  );

  for (const alvo of pedido.alvos) {
    if (!alvo.semDuvida) {
      for (const c of alvo.candidatos) emDuvida.push(c);
      continue;
    }

    // ── Todos os anúncios do carro, não só o primeiro ───────────────────
    //
    // A loja anuncia o mesmo carro mais de uma vez: na R2 havia
    // "FORD KA 1.0 – 2016 —" e "FORD KA 1.0 – 2016 — Cópia" no ar juntos.
    // Desligar um e deixar o outro é o pior desfecho possível — o robô
    // responde "pronto, tirei do ar", todo mundo acredita, e o carro vendido
    // continua gastando verba pelo anúncio gêmeo. Ver nomeNormalizado.
    for (const candidato of alvo.mesmoCarro) {
      // De novo pelo cadastro da loja, e não pelo id que veio da leitura: é a
      // mesma trava que impede um id trocado no navegador de pausar a campanha
      // de outra pessoa. Custa uma consulta e fecha a porta.
      const objeto = await acharObjetoDaLoja(loja.id, "anuncio", candidato.adId);
      if (!objeto) {
        await anotar(
          m.messageId,
          m.grupoId,
          "anuncio-nao-e-da-loja",
          candidato.nome,
        );
        continue;
      }

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

      if (r.ok) {
        // O nome que diz o carro ("FIAT PULSE AUDACE — Stories"), não o do anúncio sozinho ("Stories").
        tirados.push(candidato.nome);
        idsTirados.push(candidato.adId);
        await anotar(m.messageId, m.grupoId, "pausou", objeto.nome);
      } else {
        falhas.push(`${objeto.nome} (${r.erro})`);
        await anotar(
          m.messageId,
          m.grupoId,
          "a-meta-recusou",
          `${objeto.nome}: ${r.erro}`,
        );
      }
    }
  }

  // O conjunto onde estavam ficou sem anúncio ativo? Então sai também. Se ainda há
  // outro carro nele, fica como está.
  const vazios = await pausarConjuntosVazios({
    clientId: loja.id,
    adIds: idsTirados,
    quemId: null,
    pedidoPor: quem,
    pedidoTexto: m.texto,
  });
  for (const n of vazios.pausados) await anotar(m.messageId, m.grupoId, "pausou-conjunto-vazio", n);
  falhas.push(...vazios.falhas);

  // ── Uma resposta só, com tudo que aconteceu ───────────────────────────
  const partes: string[] = [];
  if (tirados.length === 1) {
    partes.push(`Pronto, tirei *${tirados[0]}* do ar.`);
  } else if (tirados.length > 1) {
    partes.push(
      `Pronto, tirei do ar:\n${tirados.map((n) => `• *${n}*`).join("\n")}`,
    );
  }
  if (vazios.pausados.length > 0) partes.push(textoDosConjuntosVazios(vazios.pausados));
  // O que o robô tem a dizer sobre a VENDA (parabéns, ou a pergunta do valor)
  // vai na mesma mensagem da pausa: duas mensagens seguidas pra um aviso só é o
  // robô falando sozinho no grupo do cliente.
  if (conjuntoNaoAchado && tirados.length > 0) {
    partes.unshift("Não achei um conjunto com esse nome, então fiz pelos anúncios do carro.");
  }
  if (venda.recado) partes.push(venda.recado);
  if (falhas.length > 0) {
    partes.push(
      `Não consegui tirar ${falhas.join("; ")}. Já avisei a equipe — ` +
        `alguém vai fazer na mão.`,
    );
  }
  if (emDuvida.length > 0) {
    // A lista fica guardada: a próxima resposta de quem pediu escolhe SÓ dentro dela (números, "todos" ou os nomes).
    const unicos = [...new Map(emDuvida.map((a) => [a.adId, a])).values()].slice(0, MAXIMO_NA_PERGUNTA);
    await guardarPergunta({ grupoId: m.grupoId, clientId: loja.id, quem: m.telefone ?? null, tipo: "qual", candidatos: unicos.map((a) => ({ adId: a.adId, nome: a.nome })) });
    partes.push(textoDaPergunta(unicos));
  }
  // Uma palavra que não casou mas lembra um carro, numa mensagem em que o
  // resto foi atendido: "pausar virtual e o gol" tirou o gol e ainda deve
  // perguntar do virtual.
  if (pedido.sugestoes.length > 0) {
    partes.push(textoDaSugestao(pedido.sugestoes));
  }
  if (
    tirados.length > 0 &&
    falhas.length === 0 &&
    emDuvida.length === 0 &&
    pedido.sugestoes.length === 0 &&
    // "Se não era esse, a gente liga de volta" depois de "Parabéns pela venda"
    // seria o robô pedindo desculpa por uma venda que acabou de comemorar.
    !venda.recado
  ) {
    partes.push("Se não era esse, me avisa aqui que a gente liga de volta na hora.");
  }

  if (partes.length > 0) await responder(m.grupoId, partes.join("\n\n"), m.messageId);
  if (falhas.length > 0) await avisarDaFalha(loja, m, falhas);

  if (falhas.length > 0 && tirados.length === 0) {
    return { tipo: "falhou", clientId: loja.id, erro: falhas.join("; ") };
  }
  if (tirados.length === 0) {
    return {
      tipo: "perguntou",
      clientId: loja.id,
      quantos: emDuvida.length + pedido.sugestoes.length,
    };
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

/** O robô disse "já avisei a equipe": aqui é onde ele avisa de verdade. */
async function avisarDaFalha(
  loja: { id: string; companyName: string },
  m: MensagemDoGrupo,
  falhas: string[],
): Promise<void> {
  try {
    await avisarAEquipeDaLoja(
      loja.id,
      `*${loja.companyName}* — pediram no grupo pra tirar do ar e a Meta recusou:\n` +
        `${falhas.map((f) => `• ${f}`).join("\n")}\n\n` +
        `O pedido: "${semAMarcacao(m.texto).slice(0, 200)}"\nFaz na mão pelo Legacy OS.`,
    );
  } catch {
    // O aviso é cortesia: não pode derrubar a resposta que já foi pro grupo.
  }
}

/**
 * Pausa os conjuntos que o pedido citou. Mesma regra dos anúncios: só o que é CERTO
 * sai do ar; o duvidoso vira UMA pergunta no fim.
 */
async function tirarConjuntos(
  m: MensagemDoGrupo,
  loja: { id: string; companyName: string },
  pedido: PedidoComVarios,
  recadoDaVenda: string | null,
): Promise<Desfecho> {
  const quem = [m.quem, m.telefone].filter(Boolean).join(" · ") || null;
  const tirados: { nome: string; anuncios: number }[] = [];
  const falhas: string[] = [];
  const emDuvida: string[] = [];

  for (const alvo of pedido.alvos) {
    if (!alvo.semDuvida) {
      for (const c of alvo.candidatos) emDuvida.push(c.nome);
      continue;
    }
    // Todos os conjuntos do carro (o "Cópia" também): deixar um no ar é deixar
    // o carro vendido gastando verba.
    for (const candidato of alvo.mesmoCarro) {
      // De novo pelo cadastro da loja: a trava que impede um id de outra pessoa.
      const objeto = await acharObjetoDaLoja(loja.id, "conjunto", candidato.adId);
      if (!objeto) {
        await anotar(m.messageId, m.grupoId, "conjunto-nao-e-da-loja", candidato.nome);
        continue;
      }
      const r = await mudarStatus({
        clientId: loja.id,
        quemId: null,
        nivel: "conjunto",
        objeto,
        ligar: false,
        origem: "whatsapp",
        pedidoPor: quem,
        pedidoTexto: m.texto,
      });
      if (r.ok) {
        tirados.push({ nome: objeto.nome, anuncios: objeto.levaJunto });
        await anotar(m.messageId, m.grupoId, "pausou-conjunto", objeto.nome);
      } else {
        falhas.push(`${objeto.nome} (${r.erro})`);
        await anotar(m.messageId, m.grupoId, "a-meta-recusou", `${objeto.nome}: ${r.erro}`);
      }
    }
  }

  const dentro = (n: number) =>
    n > 0 ? ` (com ${n} ${n === 1 ? "anúncio" : "anúncios"} dentro)` : "";
  const partes: string[] = [];
  if (tirados.length === 1) {
    partes.push(`Pronto, tirei o conjunto *${tirados[0].nome}* do ar${dentro(tirados[0].anuncios)}.`);
  } else if (tirados.length > 1) {
    partes.push(
      `Pronto, tirei do ar os conjuntos:\n${tirados
        .map((t) => `• *${t.nome}*${dentro(t.anuncios)}`)
        .join("\n")}`,
    );
  }
  if (recadoDaVenda) partes.push(recadoDaVenda);
  if (falhas.length > 0) {
    partes.push(
      `Não consegui tirar ${falhas.join("; ")}. Já avisei a equipe — alguém vai fazer na mão.`,
    );
  }
  if (emDuvida.length > 0) {
    partes.push(
      `Qual destes conjuntos?\n${emDuvida
        .slice(0, 4)
        .map((n) => `• *${n}*`)
        .join("\n")}\n\nMe marca de novo com o nome certo.`,
    );
  }
  if (partes.length > 0) await responder(m.grupoId, partes.join("\n\n"), m.messageId);

  if (falhas.length > 0) await avisarDaFalha(loja, m, falhas);
  if (falhas.length > 0 && tirados.length === 0) {
    return { tipo: "falhou", clientId: loja.id, erro: falhas.join("; ") };
  }
  if (tirados.length === 0) {
    return { tipo: "perguntou", clientId: loja.id, quantos: emDuvida.length };
  }
  return { tipo: "desligou-varios", clientId: loja.id, quantos: tirados.length };
}

/** Não responde no grupo do cliente (gasto/leads não saem aí) e avisa a equipe, em particular, que ficou sem resposta. */
async function deixarDeResponderPorGastoOuLeads(m: MensagemDoGrupo, clientId: string, nomeDaLoja: string, motivo: string): Promise<Desfecho> {
  await anotar(m.messageId, m.grupoId, "gasto-ou-leads-nao-vai-pro-grupo", `${nomeDaLoja} · ${motivo}`);
  await avisarAEquipeDaLoja(
    clientId,
    `*${nomeDaLoja}* — perguntaram algo no grupo e eu **não respondi**: gasto e leads não saem no grupo do cliente (${motivo}).\n\n` +
      `A pergunta: "${semAMarcacao(m.texto).slice(0, 200)}"\n\nSe precisar responder, é com você.`,
  );
  return { tipo: "sem-pedido", clientId };
}

/**
 * O texto fala de DINHEIRO ou de RESULTADO de anúncio (gasto, investimento, verba, leads, custo, alcance…)? Pura.
 *
 * Isso NUNCA vai pro grupo de um cliente: a regra do Guilherme é que gasto e leads não saem na frente da loja. Por isso é uma
 * trava em CÓDIGO, nos dois lados — na pergunta (nem chama a IA) e na resposta (se a IA escreveu um valor, não sai) —, e não um
 * pedido pro modelo se comportar. O modelo já provou que não basta: mandou a lista de carros "dos últimos 7 dias" com leads e
 * gastos de cada um no grupo da Área 42.
 */
export function falaDeGastoOuResultado(texto: string): boolean {
  const t = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return (
    /r\$|\breais\b/.test(t) ||
    /\b(gast\w*|invest\w*|verba|saldo|orcamento|custo\w*|cpl|cpm|cpc|ctr|roas|leads?|conversa(o|oes)|impress(ao|oes)|alcance|cliques?|resultados?|mensagens? recebidas?|ticket|faturamento|retorno)\b/.test(t) ||
    /\b\d+[.,]?\d*\s*(leads?|conversas?|mensagens)\b/.test(t)
  );
}

/**
 * A IA respondendo uma pergunta DENTRO do grupo de um cliente.
 *
 * ── A diferença que decide tudo ──────────────────────────────────────────
 *
 * No grupo interno a resposta é recortada por QUEM perguntou. Aqui não pode
 * ser: quem escreve no grupo da R2 costuma ser o dono da R2, que não tem
 * carteira nenhuma — e, se fosse alguém da equipe, a carteira dele traria
 * as outras lojas pra dentro da conversa de um cliente.
 *
 * Então o recorte é pela LOJA DO GRUPO, por construção: `soALoja` entra no
 * `where` da única consulta que resolve lojas, e o que não passa por lá não
 * existe pro resto do Copiloto.
 *
 * O Guilherme disse "nenhuma loja vai perguntar de outras lojas, ela deve
 * deduzir isso". A primeira parte é verdade; a segunda é onde eu não
 * obedeço. Pedir pro modelo deduzir que só pode falar daquela loja é apostar
 * o dado do cliente num bom dia dele. Com a trava no banco, "quais lojas
 * estão sem verba?" perguntado no grupo da R2 traz a R2 porque não HÁ outra
 * pra trazer.
 *
 * ── Em nome de quem a consulta roda ──────────────────────────────────────
 *
 * Do gestor da loja. Não é detalhe: as consultas também conferem a carteira,
 * e rodar em nome de alguém que não tem a loja devolveria vazio. Sem gestor,
 * a IA não responde — é o lado seguro de um cadastro incompleto.
 */
async function responderSobreALoja(
  m: MensagemDoGrupo,
  clientId: string,
  nomeDaLoja: string,
): Promise<Desfecho> {
  // Pergunta de gasto/leads/resultado no grupo do cliente: não chega nem na IA.
  if (falaDeGastoOuResultado(semAMarcacao(m.texto))) {
    return deixarDeResponderPorGastoOuLeads(m, clientId, nomeDaLoja, "a pergunta fala de gasto/leads/resultado");
  }

  const dono = await prisma.client.findUnique({
    where: { id: clientId },
    select: { manager: { select: { id: true, role: true, active: true } } },
  });
  const gestor = dono?.manager;
  if (!gestor || !gestor.active) {
    // Sem gestor não há em nome de quem perguntar. Silêncio aqui é melhor que
    // uma resposta vazia que pareceria "esta loja não gastou nada".
    return { tipo: "sem-pedido", clientId };
  }

  const r = await responderComoPessoa(
    { id: gestor.id, role: gestor.role, soALoja: clientId },
    semAMarcacao(m.texto),
    [],
    "whatsapp",
  );

  if (r.erro || r.resposta === undefined) {
    await responder(
      m.grupoId,
      "Não consegui buscar isso agora. Já avisei a equipe.",
      m.messageId,
    );
    await avisarAEquipeDaLoja(
      clientId,
      `*${nomeDaLoja}* — perguntaram no grupo e eu não consegui responder: ` +
        `${r.erro ?? "não veio resposta."}\n\nA pergunta: "${semAMarcacao(m.texto).slice(0, 200)}"`,
    );
    return { tipo: "sem-pedido", clientId };
  }

  // Ação proposta NÃO vira texto aqui: "daria pra pausar o anúncio X" dito no
  // grupo do cliente é a agência sugerindo serviço na frente dele, sem
  // ninguém da casa ter olhado. Quem decide isso é a equipe, no sistema.
  // A resposta também passa pela trava: se a IA escreveu valor, gasto ou leads, NÃO sai no grupo do cliente.
  if (falaDeGastoOuResultado(r.resposta)) {
    return deixarDeResponderPorGastoOuLeads(m, clientId, nomeDaLoja, "a resposta da IA trazia valores/leads");
  }
  await responder(m.grupoId, r.resposta, m.messageId);
  return { tipo: "respondeu-da-loja", clientId };
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
  const chamada = await fuiChamado(m);
  if (!chamada.chamado) {
    await anotar(
      m.messageId,
      m.grupoId,
      "interno-sem-mencao",
      `marcações=[${chamada.tamanhos.join(",")}] dígitos · ` +
        `lid=${chamada.tamanhoDoLid ?? "não achei"}`,
    );
    return { tipo: "interno-sem-dono" };
  }
  if (chamada.porLid) {
    await anotar(m.messageId, m.grupoId, "marcado-por-lid", "grupo interno");
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
      m.messageId,
    );
    return { tipo: "interno-sem-dono" };
  }

  // "Nos envie os carros ativos": a lista, direto (a IA não tem o inventário e respondia "não tenho como listar"). A loja vem da frase
  // ou da única loja da carteira de quem pediu; sem isso, pergunta de qual. Só os ativos, sem gasto.
  const lista = await tratarListaNoPrivado(pessoa, semAMarcacao(m.texto), []);
  if (lista) {
    await anotar(m.messageId, m.grupoId, "lista-de-anuncios", lista.clientId ? "grupo interno" : "perguntou a loja");
    for (const texto of lista.mensagens) await responder(m.grupoId, texto, m.messageId);
    return { tipo: "respondeu-interno", userId: pessoa.id };
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

  // Ação proposta vira texto, não botão: executar daqui ainda não existe. E só quando PEDEM sugestão.
  const pediuSugestao = pedeSugestao(m.texto);
  const acoes = pediuSugestao ? (r.acoes ?? []) : [];
  await responder(
    m.grupoId,
    (pediuSugestao ? r.resposta : semRecomendacao(r.resposta)) +
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
  // Numerada e com o nome que diz o carro ("FIAT PULSE AUDACE — Stories"): a resposta pode ser só o número.
  if (candidatos.length === 0) return "Me marca com @ de novo junto com o nome e eu desligo.";
  const lista = candidatos.slice(0, MAXIMO_NA_PERGUNTA).map((c, i) => `${i + 1}. ${c.nome}`).join("\n");
  return (
    `Qual desses eu tiro do ar?\n\n${lista}\n\n` +
    "Me marca e responde com o número (ex.: *1 e 3*) ou *todos*. Pra não tirar nenhum: *nenhum*."
  );
}

/**
 * "Virtual não existe nos anúncios. Quis dizer Virtus?"
 *
 * Mostra os anúncios com o nome certo pra pessoa conferir se é aquele, e
 * termina ensinando como responder: a regra do @ vale pra toda mensagem,
 * inclusive pra resposta a esta pergunta. Um robô que perguntasse e ignorasse
 * calado o "sim" pareceria quebrado.
 *
 * Não pede "sim" nem guarda estado: refazer o pedido com a palavra certa é a
 * confirmação. É o mesmo caminho do "qual desses?", e é mais seguro que
 * lembrar o que foi perguntado há dez minutos.
 */
function textoDaSugestao(sugestoes: Sugestao[]): string {
  const blocos = sugestoes.slice(0, 2).map((sg) => {
    const mostrar = (palavra: string) =>
      palavra.charAt(0).toUpperCase() + palavra.slice(1);
    const lista = sg.anuncios
      .slice(0, MAXIMO_NA_PERGUNTA)
      .map((a) => `• ${a.nome}`)
      .join("\n");
    return (
      `"${sg.digitado}" não existe nos anúncios. Quis dizer *${mostrar(sg.quis)}*?\n` +
      lista
    );
  });
  return (
    blocos.join("\n\n") +
    "\n\nSe for, me marca com @ de novo com o nome certo e eu desligo."
  );
}

/**
 * Fala no grupo.
 *
 * Falha de resposta NUNCA derruba o atendimento: se o anúncio já foi
 * desligado e o aviso não saiu, o estrago de estourar aqui seria a Z-API
 * tentando de novo e o robô desligando duas vezes.
 *
 * ── Mas agora ela deixa rastro ──────────────────────────────────────────
 *
 * Esta função era o buraco mais fundo do arquivo. Ela fazia
 * `try { await enviarTexto(...) } catch {}` — e `enviarTexto` NÃO estoura
 * quando a Z-API recusa: ela DEVOLVE `{ ok: false, erro }`. O retorno era
 * ignorado, então a recusa não virava nem exceção nem registro.
 *
 * Resultado: a Z-API podia estar proibindo o robô de falar no grupo (sem ser
 * admin, grupo com id trocado, instância fora do ar) e o atendimento
 * registrava sucesso. Do lado de fora era "o robô ficou mudo"; do lado de
 * dentro era "tudo certo". Dois dias de investigação moraram neste `catch`.
 */
async function responder(
  grupoId: string,
  texto: string,
  messageId?: string | null,
): Promise<void> {
  try {
    const r = await enviarTexto(grupoId, texto);
    await anotar(
      messageId,
      grupoId,
      r.ok ? "respondeu" : "envio-recusado",
      r.ok ? `${texto.length} caracteres` : r.erro,
    );
  } catch (e) {
    await anotar(
      messageId,
      grupoId,
      "envio-estourou",
      e instanceof Error ? e.message : String(e),
    );
  }
}
