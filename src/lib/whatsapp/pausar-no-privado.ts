import "server-only";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { CARTEIRA_NO_META, escopoDaCarteira, type PessoaDaCasa } from "@/lib/carteira";
import { acharObjetoDaLoja, mudarStatus } from "@/lib/meta/mudar-status";
import {
  conjuntosNoAr,
  pausarConjuntosVazios,
  pedeConjunto,
  semPalavraConjunto,
  textoDosConjuntosVazios,
} from "./conjuntos";
import {
  achatar,
  entenderPedidoComVarios,
  palavraSemForca,
  pedeParaDesligar,
  type AnuncioConhecido,
  type Sugestao,
} from "./entender-pedido";

// Pausar anúncio pelo privado, com confirmação.
//
// ── A regra que o Guilherme deu ──────────────────────────────────────────
//
//   "só deve executar se for pedido a execução, e com confirmação"
//
// Duas coisas, e as duas aqui:
//
//   1. PEDIDO. A IA recomendando ("esse anúncio está gastando sem resultado")
//      não é pedido. Só vira ação quando a pessoa MANDA: "pausa o Virtus da R2".
//      E quem decide isso é uma regra escrita (pedidoDeExecucao), não o modelo:
//      um modelo que decide se a frase foi uma ordem erra de um jeito diferente
//      a cada vez, e aqui o erro custa um anúncio fora do ar.
//
//   2. CONFIRMAÇÃO. O robô diz exatamente o que vai pausar, e só pausa com um
//      "sim" da MESMA pessoa, na mensagem seguinte, em até 10 minutos.
//
// ── Por que a confirmação é tão estreita ─────────────────────────────────
//
// Valer só pra PRÓXIMA mensagem é de propósito. Uma confirmação que sobrevive a
// outras conversas é uma bomba-relógio: "sim" dito meia hora depois, sobre
// outra coisa ("sim, a Mega também está sem verba"), pausaria um anúncio que a
// pessoa já tinha esquecido de ter pedido. Qualquer outra mensagem cancela.
//
// ── O que NÃO muda de mão ────────────────────────────────────────────────
//
// Quem executa é `mudarStatus`, a MESMA função da tela e do grupo, com o mesmo
// registro em meta_acoes. Este arquivo não ganhou caminho próprio pra Meta. E a
// carteira é conferida duas vezes: ao montar o pedido, e de novo na hora do
// "sim" — porque em dez minutos a loja pode ter mudado de gestor.

/** Quanto tempo o "sim" vale. */
export const CONFIRMACAO_VALE_MS = 10 * 60 * 1000;

export interface AlvoPendente {
  clientId: string;
  loja: string;
  /** O id do anúncio — ou do CONJUNTO, quando `nivel` é "conjunto". */
  adId: string;
  nome: string;
  /** Ausente nas pendências antigas, que eram sempre de anúncio. */
  nivel?: "conjunto";
}

export interface AcaoDePausa {
  tipo: "pausar-anuncios";
  alvos: AlvoPendente[];
  /** A frase que a pessoa escreveu — vai pro registro da ação. */
  pedido: string;
}

/**
 * "Vilela vendeu o Versa": registrar a venda no Controle de Vendas e tirar o carro do ar,
 * depois de a pessoa conferir loja e carro. Só o dono (ADMIN) usa — ver venda-no-privado.ts.
 */
export interface AcaoDeVenda {
  tipo: "registrar-venda";
  clientId: string;
  loja: string;
  carro: string;
  /** Todos os anúncios do carro, de qualquer status (a venda vem depois da pausa, às vezes). */
  ids: string[];
  /** O valor que a pessoa disse. */
  valorCents: number | null;
  /** O preço que o anúncio traz — usado quando ninguém disse o valor. */
  precoDoAnuncioCents: number | null;
  /** `null` = ainda não se sabe, e o robô pergunta. */
  origemLead: boolean | null;
  /** Aviso a repetir na confirmação (a venda já estava registrada, a loja não usa o controle…). */
  observacao?: string;
  pedido: string;
}

/**
 * "Envie um aviso à Tatiana e à Giovana": o texto exato e os números, guardados enquanto se espera o "sim". Só o dono
 * (ADMIN) usa — ver aviso-para-equipe.ts.
 */
export interface AcaoDeAviso {
  tipo: "avisar-equipe";
  destinatarios: { id: string; nome: string; telefone: string }[];
  /** Quem foi citado e não tem WhatsApp cadastrado: dito na confirmação e no resultado. */
  semNumero: string[];
  texto: string;
  pedido: string;
}

/**
 * "Reunião com a Garagem Y dia 25 às 15h" / "fechei a Garagem Y, R$ 1.800 por mês": o que vai pro funil e pra agenda,
 * guardado enquanto se espera o "sim". Só o dono (ADMIN) usa — ver comandos-do-dia.ts.
 */
export interface AcaoDeComercial {
  tipo: "comercial";
  acao: "reuniao" | "fechamento";
  /** O lead que já existe no funil; `null` = criar um novo. */
  leadId: string | null;
  nome: string;
  /** Só reunião: o momento, em ISO (UTC). */
  quandoISO: string | null;
  /** Só fechamento: o valor mensal. */
  valorMensal: number | null;
  pedido: string;
}

/**
 * "Pede pra Tatiana conferir a verba até sexta": a tarefa que o dono/gerência vai passar pra outra pessoa, guardada
 * enquanto se espera o "sim" (o robô avisa a pessoa pelo WhatsApp). Ver tarefas-no-privado.ts.
 */
export interface AcaoDeTarefa {
  tipo: "atribuir-tarefa";
  responsavel: { id: string; nome: string; telefone: string | null };
  titulo: string;
  recorrencia: "NENHUMA" | "DIARIA" | "SEMANAL" | "MENSAL";
  /** aaaa-mm-dd, só pra tarefa única. */
  prazo: string | null;
  diaDaSemana: number | null;
  diaDoMes: number | null;
  pedido: string;
}

export type AcaoPendente = AcaoDePausa | AcaoDeVenda | AcaoDeAviso | AcaoDeComercial | AcaoDeTarefa;

// ───────────────────────── Ler a resposta do "sim" ─────────────────────────

const SIM = new Set([
  "sim", "s", "simm", "confirmo", "confirma", "confirmado", "pode", "pode sim",
  "pode pausar", "pode tirar", "isso", "isso mesmo", "ok", "okay", "manda",
  "manda ver", "vai", "positivo", "pode ser", "claro", "com certeza", "yes", "y",
]);
const NAO = new Set([
  "nao", "n", "nao pausa", "nao pause", "cancela", "cancelar", "cancelado",
  "deixa", "deixa pra la", "esquece", "errado", "nada", "nao quero", "negativo",
]);

/**
 * A mensagem é um "sim", um "não" ou outra coisa?
 *
 * Só vale mensagem CURTA e inteira: "sim mas tira só o 2020" não é um "sim" —
 * é um pedido novo, e o robô trata como pedido novo. Confirmar por uma palavra
 * solta no meio de uma frase é como se pausa o anúncio errado.
 */
export function respostaDeConfirmacao(texto: string): "sim" | "nao" | null {
  const t = achatar(texto);
  if (!t || t.length > 24) return null;
  if (SIM.has(t)) return "sim";
  if (NAO.has(t)) return "nao";
  return null;
}

// ──────────────────────── Isto é um pedido de execução? ────────────────────

/**
 * Os verbos de ORDEM. Mais estreito que o do grupo, de propósito.
 *
 * No grupo, "vendeu o Virtus" vale como pedido, porque a pessoa já marcou o
 * robô com @ e a loja inteira lê. No privado o robô conversa, e "o Virtus da R2
 * vendeu" é uma frase que a pessoa pode estar só contando. Aqui só ordem
 * explícita ativa a execução; o resto vai pra conversa, onde a IA pode dizer
 * "dá pra pausar, é só pedir".
 */
const VERBO_DE_ORDEM =
  /(^|\s)(paus\w*|tir\w*|retir\w*|deslig\w*|desativ\w*|encerr\w*|suspend\w*|suspens\w*)(\s|$)/;

export function pedidoDeExecucao(texto: string): boolean {
  if (!pedeParaDesligar(texto)) return false;
  return VERBO_DE_ORDEM.test(achatar(texto));
}

// ─────────────────────────── Qual loja a pessoa disse ──────────────────────

/** Palavras que aparecem em nome de loja e não distinguem loja nenhuma. */
const GENERICAS_DE_LOJA = new Set([
  "loja", "lojas", "veiculos", "veiculo", "motors", "motor", "multimarcas",
  "automoveis", "automovel", "carros", "carro", "auto", "autos", "center",
  "automotivo", "automotiva", "cars", "car", "de", "da", "do", "dos", "das", "e",
]);

export interface LojaDaPessoa {
  id: string;
  nome: string;
}

export interface LojaNoTexto {
  /** A loja que a frase cita, quando UMA só é citada. */
  loja: LojaDaPessoa | null;
  /** Mais de uma loja citada na mesma frase: é pra perguntar, uma por vez. */
  ambiguas: LojaDaPessoa[];
  /** A frase sem o nome da loja, pra ele não atrapalhar a busca do carro. */
  restante: string;
}

/**
 * Qual loja a frase cita.
 *
 * Pelo nome inteiro, ou por uma palavra do nome que só ESTA loja tem entre as
 * da pessoa: "R2", "point", "mega". Palavra que várias lojas dividem
 * ("motors", "multimarcas") não identifica nenhuma, e nem entra na conta.
 *
 * Sem citar loja nenhuma, devolve `null` — e aí quem chama procura o carro nas
 * lojas todas e só segue se ele existir em UMA.
 */
export function acharLojaNoTexto(texto: string, lojas: LojaDaPessoa[]): LojaNoTexto {
  const t = achatar(texto);
  const palavrasDoTexto = new Set(t.split(" ").filter(Boolean));

  const nomes = lojas.map((l) => ({
    loja: l,
    inteiro: achatar(l.nome),
    palavras: achatar(l.nome).split(" ").filter(Boolean),
  }));

  // Em quantas lojas cada palavra de nome aparece.
  const emQuantas = new Map<string, number>();
  for (const n of nomes) {
    for (const p of new Set(n.palavras)) emQuantas.set(p, (emQuantas.get(p) ?? 0) + 1);
  }

  const pontos = nomes
    .map((n) => {
      // O nome inteiro, como palavra solta: "r2" não casa dentro de "carro2".
      const inteiroCita = n.inteiro.length > 0 && ` ${t} `.includes(` ${n.inteiro} `);
      if (inteiroCita) return { loja: n.loja, nota: 100, usadas: n.palavras };

      const usadas = n.palavras.filter(
        (p) =>
          p.length >= 2 &&
          !GENERICAS_DE_LOJA.has(p) &&
          emQuantas.get(p) === 1 &&
          palavrasDoTexto.has(p),
      );
      return {
        loja: n.loja,
        nota: usadas.length ? 10 + usadas.reduce((s, p) => s + p.length, 0) : 0,
        usadas,
      };
    })
    .filter((p) => p.nota > 0)
    .sort((a, b) => b.nota - a.nota);

  if (pontos.length === 0) return { loja: null, ambiguas: [], restante: texto };

  // Duas lojas citadas, com notas diferentes ou não: é pra perguntar.
  //
  // O caminho curto seria ficar com a de maior nota — e então "pausa o Virtus
  // da R2 e o Onix da Mega" pausaria só o da R2, e o Onix seria ignorado sem
  // ninguém ser avisado. Num robô que pausa anúncio, ignorar metade de um
  // pedido em silêncio é pior que recusar o pedido inteiro.
  if (pontos.length > 1) {
    return { loja: null, ambiguas: pontos.map((m) => m.loja), restante: texto };
  }

  // Tira do texto o que identificou a loja.
  let restante = ` ${t} `;
  for (const u of pontos[0].usadas) restante = restante.replaceAll(` ${u} `, " ");
  return { loja: pontos[0].loja, ambiguas: [], restante: restante.trim() };
}

// ───────────────── "…da Point": uma loja que não é dela ───────────────────

const PREPOSICAO = new Set(["da", "do", "na", "no", "das", "dos", "nas", "nos"]);

/** Depois de "da/do": tempo e lugar físico. Nada disso é loja. */
const NEUTRAS = new Set([
  "semana", "mes", "dia", "dias", "hoje", "ontem", "amanha", "manha", "tarde",
  "noite", "lista", "frente", "fundo", "vitrine", "patio", "garagem", "salao",
  "foto", "video", "post", "story", "stories", "feed", "reels", "cliente",
  "pessoal", "galera", "grupo", "sistema", "meta", "facebook", "instagram",
]);

/**
 * Palavras que vêm depois de "da/do/na/no" e não são nada que o sistema conheça.
 *
 * ── O defeito que isto fecha ─────────────────────────────────────────────
 *
 * A Giovana escreve "pausa o Onix da Point". A Point é loja da Tatiana, então
 * pra Giovana ela não existe — e "point" não casa com nenhuma loja DELA. Sem
 * esta conferência o robô ignorava a palavra, achava um Onix na Mega (que é da
 * Giovana) e propunha pausar ESSE. Ela diria "sim" achando que era o da Point, e
 * o anúncio de outro cliente sairia do ar.
 *
 * Palavra que a pessoa pôs depois de "da" e que não é loja dela, nem carro, nem
 * palavra qualquer do idioma de anúncio, é provavelmente uma loja que ela não
 * tem — e o certo é perguntar, não substituir.
 *
 * Erra pro lado seguro: "pausa o Ka da frente" também cai aqui, e custa uma
 * pergunta. O contrário custa o anúncio errado.
 */
export function palavrasDeLojaDesconhecida(
  texto: string,
  lojas: LojaDaPessoa[],
  anuncios: AnuncioConhecido[],
): string[] {
  const conhecidas = new Set<string>();
  for (const l of lojas) for (const p of achatar(l.nome).split(" ")) conhecidas.add(p);
  for (const a of anuncios) {
    for (const p of achatar([a.nome, ...a.textos].join(" ")).split(" ")) conhecidas.add(p);
  }

  const t = achatar(texto).split(" ").filter(Boolean);
  const achadas: string[] = [];
  for (let i = 0; i < t.length - 1; i++) {
    if (!PREPOSICAO.has(t[i])) continue;
    const p = t[i + 1];
    if (p.length < 3) continue;
    if (/^\d+$/.test(p)) continue; // "do 2021"
    if (PREPOSICAO.has(p) || palavraSemForca(p) || GENERICAS_DE_LOJA.has(p) || NEUTRAS.has(p)) continue;
    if (conhecidas.has(p)) continue;
    achadas.push(p);
  }
  return achadas;
}

// ─────────────────────────── Montar o pedido ───────────────────────────────

export interface PedidoMontado {
  /** O que sai na mensagem de volta. */
  resposta: string;
  /** Se há algo certo pra pausar, é isto que o "sim" executa. */
  pendente: AcaoDePausa | null;
}

interface AnuncioDaLoja extends AnuncioConhecido {
  clientId: string;
}

function negrito(s: string): string {
  return `*${s}*`;
}

function lista(nomes: string[]): string {
  return nomes.map((n) => `• ${n}`).join("\n");
}

function textoDaSugestao(sugestoes: Sugestao[]): string {
  return sugestoes
    .slice(0, 2)
    .map((sg) => {
      const quis = sg.quis.charAt(0).toUpperCase() + sg.quis.slice(1);
      return `"${sg.digitado}" não existe nos anúncios. Quis dizer ${negrito(quis)}?`;
    })
    .join("\n");
}

/**
 * Entende um pedido de pausa e devolve o que responder.
 *
 * Devolve `null` quando a frase NÃO é pedido de execução, e aí a conversa segue
 * pra IA normalmente. Só responde por conta própria quando a pessoa mandou
 * pausar alguma coisa.
 */
export async function montarPedidoDePausa(
  pessoa: PessoaDaCasa,
  texto: string,
  agora: Date = new Date(),
): Promise<PedidoMontado | null> {
  if (!pedidoDeExecucao(texto)) return null;

  // Só as lojas DELA, pela mesma função da tela — um gestor nunca chega no
  // anúncio de outro por aqui, nem escrevendo o nome da loja do colega.
  const lojas = await prisma.client.findMany({
    where: {
      ...CARTEIRA_NO_META,
      ...escopoDaCarteira(pessoa),
      metaAdAccounts: { some: { active: true } },
    },
    select: {
      id: true,
      companyName: true,
      metaAdAccounts: { where: { active: true }, select: { id: true } },
    },
    orderBy: { companyName: "asc" },
  });

  if (lojas.length === 0) {
    return {
      resposta: "Não achei lojas com anúncios no ar na sua carteira.",
      pendente: null,
    };
  }

  const donoDaConta = new Map<string, string>();
  for (const l of lojas) for (const a of l.metaAdAccounts) donoDaConta.set(a.id, l.id);

  const criativos = await prisma.metaAdCreative.findMany({
    where: { adAccountId: { in: [...donoDaConta.keys()] }, effectiveStatus: "ACTIVE" },
    select: { adId: true, adName: true, titulo: true, legenda: true, adAccountId: true },
  });
  const anuncios: AnuncioDaLoja[] = criativos.flatMap((c) => {
    const clientId = donoDaConta.get(c.adAccountId);
    if (!clientId) return [];
    return [
      {
        adId: c.adId,
        nome: c.adName,
        textos: [c.titulo, c.legenda].filter((x): x is string => !!x),
        clientId,
      },
    ];
  });

  const nomeDaLoja = new Map(lojas.map((l) => [l.id, l.companyName]));
  const citada = acharLojaNoTexto(
    texto,
    lojas.map((l) => ({ id: l.id, nome: l.companyName })),
  );

  if (citada.ambiguas.length > 0) {
    return {
      resposta:
        `Você citou mais de uma loja: ` +
        `${citada.ambiguas.map((l) => negrito(l.nome)).join(", ")}.\n\n` +
        `Eu pauso uma loja por vez, pra você conferir o que vai sair do ar. ` +
        `Me manda um pedido para cada loja.`,
      pendente: null,
    };
  }

  // ── Citou uma loja que não é dela? ───────────────────────────────────
  //
  // Sem loja identificada, o robô procura o carro nas lojas todas. Mas se a frase
  // trouxe um "da Point" que não é loja dela, procurar nas outras é trocar a
  // loja sem avisar. Ver palavrasDeLojaDesconhecida.
  if (!citada.loja) {
    const estranhas = palavrasDeLojaDesconhecida(
      texto,
      lojas.map((l) => ({ id: l.id, nome: l.companyName })),
      anuncios,
    );
    if (estranhas.length > 0) {
      return {
        resposta:
          `Não achei "${estranhas[0]}" entre as suas lojas, e não quero pausar ` +
          `o carro na loja errada.\n\nMe manda de novo com o nome da loja certa.`,
        pendente: null,
      };
    }
  }

  // As lojas em que o pedido tem alguma chance: a que ela citou, ou todas.
  const candidatas = citada.loja ? [citada.loja.id] : lojas.map((l) => l.id);
  const frase = citada.loja ? citada.restante : texto;

  // ── "Pausa o CONJUNTO do Versa" ───────────────────────────────────────
  //
  // Só quando a pessoa escreve "conjunto". Se nenhum conjunto tem esse nome, cai no
  // pedido de sempre (os anúncios do carro) e a resposta avisa que foi assim.
  let avisoDeConjunto = "";
  if (pedeConjunto(frase)) {
    const contasDe = new Map(lojas.map((l) => [l.id, l.metaAdAccounts.map((a) => a.id)]));
    const achados: { clientId: string; pedido: Awaited<ReturnType<typeof entenderPedidoComVarios>> }[] = [];
    for (const clientId of candidatas) {
      const conjuntos = await conjuntosNoAr(contasDe.get(clientId) ?? []);
      const pedido = entenderPedidoComVarios(semPalavraConjunto(frase), conjuntos);
      if (pedido.intencao === "desligar" && pedido.alvos.length > 0) achados.push({ clientId, pedido });
    }
    if (achados.length > 1) {
      const onde = achados.map((r) => negrito(nomeDaLoja.get(r.clientId) ?? "")).join(", ");
      return {
        resposta:
          `Achei esse conjunto em mais de uma loja sua: ${onde}.\n\n` +
          `Me manda de novo dizendo de qual: *pausa o conjunto NOME da LOJA*.`,
        pendente: null,
      };
    }
    if (achados.length === 1) {
      const { clientId, pedido } = achados[0];
      const loja = nomeDaLoja.get(clientId) ?? "";
      const alvos: AlvoPendente[] = [];
      const linhas: string[] = [];
      const vistos = new Set<string>();
      for (const a of pedido.alvos.filter((x) => x.semDuvida)) {
        for (const c of a.mesmoCarro) {
          if (vistos.has(c.adId)) continue;
          vistos.add(c.adId);
          const objeto = await acharObjetoDaLoja(clientId, "conjunto", c.adId);
          if (!objeto) continue;
          alvos.push({ clientId, loja, adId: c.adId, nome: c.nome, nivel: "conjunto" });
          linhas.push(
            objeto.levaJunto > 0
              ? `${c.nome} (com ${objeto.levaJunto} ${objeto.levaJunto === 1 ? "anúncio" : "anúncios"} dentro)`
              : c.nome,
          );
        }
      }
      const duvidas = pedido.alvos.filter((x) => !x.semDuvida);
      const partes: string[] = [];
      if (alvos.length > 0) partes.push(`Vou pausar na ${negrito(loja)} o conjunto:\n${lista(linhas)}`);
      if (duvidas.length > 0) {
        const nomes = duvidas.flatMap((d) => d.candidatos.slice(0, 4).map((c) => c.nome));
        partes.push(
          (alvos.length > 0 ? "Ficou de fora, sem certeza:\n" : "") +
            `Qual destes conjuntos da ${negrito(loja)}?\n${lista(nomes)}`,
        );
      }
      if (alvos.length > 0) {
        const minutos = Math.round(CONFIRMACAO_VALE_MS / 60000);
        partes.push(
          `Responde ${negrito("sim")} pra eu pausar${
            duvidas.length > 0 ? " só o que está na lista" : ""
          } (vale ${minutos} minutos) ou ${negrito("não")} pra cancelar.`,
        );
      } else {
        partes.push("Me manda de novo com o nome certo e eu confirmo com você antes de pausar.");
      }
      return {
        resposta: partes.join("\n\n"),
        pendente:
          alvos.length > 0 ? { tipo: "pausar-anuncios", alvos, pedido: texto.slice(0, 300) } : null,
      };
    }
    avisoDeConjunto = "Não achei um conjunto com esse nome, então olhei os anúncios do carro.\n\n";
  }

  const resultados = candidatas
    .map((clientId) => {
      const dela = anuncios.filter((a) => a.clientId === clientId);
      return { clientId, pedido: entenderPedidoComVarios(frase, dela) };
    })
    .filter((r) => r.pedido.alvos.length > 0 || r.pedido.sugestoes.length > 0);

  // ── Nada achado ──────────────────────────────────────────────────────
  if (resultados.length === 0) {
    const onde = citada.loja
      ? `entre os anúncios no ar da ${negrito(citada.loja.nome)}`
      : "entre os anúncios no ar das suas lojas";
    return { resposta: `${avisoDeConjunto}Não achei esse carro ${onde}.`, pendente: null };
  }

  // ── O mesmo carro em mais de uma loja ────────────────────────────────
  //
  // "pausa o Virtus" sem dizer a loja, e o Virtus existe na R2 e na Mega: não
  // dá pra adivinhar, e errar de loja é pausar o anúncio de outro cliente.
  if (resultados.length > 1) {
    const onde = resultados.map((r) => negrito(nomeDaLoja.get(r.clientId) ?? "")).join(", ");
    return {
      resposta:
        `Achei esse carro em mais de uma loja sua: ${onde}.\n\n` +
        `Me manda de novo dizendo de qual: *pausa o NOME da LOJA*.`,
      pendente: null,
    };
  }

  const { clientId, pedido } = resultados[0];
  const loja = nomeDaLoja.get(clientId) ?? "";

  const certos = pedido.alvos.filter((a) => a.semDuvida);
  const emDuvida = pedido.alvos.filter((a) => !a.semDuvida);

  const alvos: AlvoPendente[] = [];
  const vistos = new Set<string>();
  for (const a of certos) {
    // Todos os anúncios do carro: o Ka tinha dois no ar, e pausar um deixa o
    // outro gastando verba de um carro que já saiu.
    for (const c of a.mesmoCarro) {
      if (vistos.has(c.adId)) continue;
      vistos.add(c.adId);
      alvos.push({ clientId, loja, adId: c.adId, nome: c.nome });
    }
  }

  const partes: string[] = [];

  if (alvos.length > 0) {
    partes.push(`Vou pausar na ${negrito(loja)}:\n${lista(alvos.map((a) => a.nome))}`);
  }

  // O que ficou de fora, dito com todas as letras: o "sim" executa SÓ o que está
  // listado acima, e a pessoa não pode achar que ele cobre o resto.
  const deFora: string[] = [];
  for (const a of emDuvida) {
    const nomes = a.candidatos.slice(0, 4).map((c) => c.nome);
    deFora.push(`Qual destes da ${negrito(loja)}?\n${lista(nomes)}`);
  }
  if (pedido.sugestoes.length > 0) deFora.push(textoDaSugestao(pedido.sugestoes));

  if (deFora.length > 0) {
    partes.push(
      (alvos.length > 0 ? "Ficou de fora, sem certeza:\n" : "") + deFora.join("\n\n"),
    );
  }

  if (alvos.length > 0) {
    const minutos = Math.round(CONFIRMACAO_VALE_MS / 60000);
    partes.push(
      `Responde ${negrito("sim")} pra eu pausar${
        deFora.length > 0 ? " só o que está na lista" : ""
      } (vale ${minutos} minutos) ou ${negrito("não")} pra cancelar.`,
    );
  } else {
    partes.push("Me manda de novo com o nome certo e eu confirmo com você antes de pausar.");
  }

  void agora;
  return {
    resposta: avisoDeConjunto + partes.join("\n\n"),
    pendente:
      alvos.length > 0 ? { tipo: "pausar-anuncios", alvos, pedido: texto.slice(0, 300) } : null,
  };
}

// ───────────────────────── O que fica guardado ─────────────────────────────

/** A confirmação que está esperando, já descartada se venceu. */
export async function lerPendente(
  userId: string,
  agora: Date = new Date(),
): Promise<{ acao: AcaoPendente | null; venceu: boolean }> {
  const c = await prisma.conversaDoCopiloto.findUnique({
    where: { userId },
    select: { acaoPendente: true, propostaEm: true },
  });
  if (!c?.acaoPendente || !c.propostaEm) return { acao: null, venceu: false };

  const venceu = agora.getTime() - c.propostaEm.getTime() > CONFIRMACAO_VALE_MS;
  const bruto = c.acaoPendente as Record<string, unknown> | null;

  // O que vem do banco é JSON livre: validado, não assumido. Pendência torta
  // vira pendência nenhuma — nunca uma pausa feita em cima de dado estranho.
  if (bruto?.tipo === "avisar-equipe") {
    const v = bruto as Partial<AcaoDeAviso>;
    const certa =
      typeof v.texto === "string" &&
      v.texto.length > 0 &&
      typeof v.pedido === "string" &&
      Array.isArray(v.semNumero) &&
      v.semNumero.every((x) => typeof x === "string") &&
      Array.isArray(v.destinatarios) &&
      v.destinatarios.length > 0 &&
      v.destinatarios.every(
        (d) => d && typeof d.id === "string" && typeof d.nome === "string" && typeof d.telefone === "string" && /^\d{10,15}$/.test(d.telefone),
      );
    return certa ? { acao: v as AcaoDeAviso, venceu } : { acao: null, venceu: false };
  }

  if (bruto?.tipo === "atribuir-tarefa") {
    const v = bruto as Partial<AcaoDeTarefa>;
    const certa =
      typeof v.titulo === "string" &&
      v.titulo.length > 0 &&
      typeof v.pedido === "string" &&
      !!v.responsavel &&
      typeof v.responsavel.id === "string" &&
      typeof v.responsavel.nome === "string" &&
      (v.responsavel.telefone === null || typeof v.responsavel.telefone === "string") &&
      (v.recorrencia === "NENHUMA" || v.recorrencia === "DIARIA" || v.recorrencia === "SEMANAL" || v.recorrencia === "MENSAL") &&
      (v.prazo === null || (typeof v.prazo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.prazo))) &&
      (v.diaDaSemana === null || (typeof v.diaDaSemana === "number" && v.diaDaSemana >= 0 && v.diaDaSemana <= 6)) &&
      (v.diaDoMes === null || (typeof v.diaDoMes === "number" && v.diaDoMes >= 1 && v.diaDoMes <= 31)) &&
      (v.recorrencia !== "SEMANAL" || v.diaDaSemana !== null) &&
      (v.recorrencia !== "MENSAL" || v.diaDoMes !== null);
    return certa ? { acao: v as AcaoDeTarefa, venceu } : { acao: null, venceu: false };
  }

  if (bruto?.tipo === "comercial") {
    const v = bruto as Partial<AcaoDeComercial>;
    const certa =
      (v.acao === "reuniao" || v.acao === "fechamento") &&
      (v.leadId === null || typeof v.leadId === "string") &&
      typeof v.nome === "string" &&
      v.nome.length > 0 &&
      typeof v.pedido === "string" &&
      (v.acao === "reuniao" ? typeof v.quandoISO === "string" && !Number.isNaN(new Date(v.quandoISO).getTime()) : typeof v.valorMensal === "number" && v.valorMensal > 0);
    return certa ? { acao: v as AcaoDeComercial, venceu } : { acao: null, venceu: false };
  }

  if (bruto?.tipo === "registrar-venda") {
    const v = bruto as Partial<AcaoDeVenda>;
    const certa =
      typeof v.clientId === "string" &&
      typeof v.loja === "string" &&
      typeof v.carro === "string" &&
      typeof v.pedido === "string" &&
      Array.isArray(v.ids) &&
      v.ids.length > 0 &&
      v.ids.every((x) => typeof x === "string") &&
      (v.valorCents === null || typeof v.valorCents === "number") &&
      (v.precoDoAnuncioCents === null || typeof v.precoDoAnuncioCents === "number") &&
      (v.origemLead === null || typeof v.origemLead === "boolean");
    return certa ? { acao: v as AcaoDeVenda, venceu } : { acao: null, venceu: false };
  }

  const a = bruto as Partial<AcaoDePausa> | null;
  const valida =
    a?.tipo === "pausar-anuncios" &&
    Array.isArray(a.alvos) &&
    a.alvos.length > 0 &&
    a.alvos.every(
      (x) =>
        x &&
        typeof x.clientId === "string" &&
        typeof x.adId === "string" &&
        typeof x.nome === "string" &&
        typeof x.loja === "string" &&
        (x.nivel === undefined || x.nivel === "conjunto"),
    );
  if (!valida) return { acao: null, venceu: false };

  return { acao: a as AcaoDePausa, venceu };
}

export async function guardarPendente(
  userId: string,
  acao: AcaoPendente,
  agora: Date = new Date(),
): Promise<void> {
  const json = acao as unknown as Prisma.InputJsonValue;
  await prisma.conversaDoCopiloto.upsert({
    where: { userId },
    create: { userId, turnos: [], acaoPendente: json, propostaEm: agora },
    update: { acaoPendente: json, propostaEm: agora },
  });
}

// Gravar NULL numa coluna Json pede o valor especial `Prisma.DbNull`: um
// `null` comum, pro Prisma, quer dizer "o JSON null", que é outra coisa.

/**
 * Pega a pendência pra si, atomicamente.
 *
 * Devolve `true` pra UM só chamador. Dois "sim" quase juntos (o dedo duplo, a
 * Z-API reenviando) leem a mesma pendência, e só quem conseguir limpar a linha
 * executa — o outro descobre que já foi tratada. Sem isso, o mesmo anúncio seria
 * pausado duas vezes, e a Meta registraria duas ações.
 */
export async function tomarPendente(userId: string): Promise<boolean> {
  const r = await prisma.conversaDoCopiloto.updateMany({
    where: { userId, propostaEm: { not: null } },
    data: { acaoPendente: Prisma.DbNull, propostaEm: null },
  });
  return r.count === 1;
}

/** Limpa a pendência sem executar nada: o "não", o vencimento, a conversa nova. */
export async function descartarPendente(userId: string): Promise<void> {
  await prisma.conversaDoCopiloto.updateMany({
    where: { userId, propostaEm: { not: null } },
    data: { acaoPendente: Prisma.DbNull, propostaEm: null },
  });
}

// ─────────────────────────── Executar o "sim" ──────────────────────────────

export interface ResultadoDaPausa {
  resposta: string;
  pausados: number;
  falhas: number;
}

/**
 * Pausa o que foi confirmado.
 *
 * Reconfere TUDO na hora: a loja ainda é da pessoa, o anúncio ainda é daquela
 * loja. A confirmação pode ter dez minutos, e nesse tempo a loja pode ter
 * trocado de gestor.
 */
export async function executarPausa(
  pessoa: PessoaDaCasa & { name: string },
  acao: AcaoDePausa,
): Promise<ResultadoDaPausa> {
  const feitos = new Map<string, string[]>();
  const falhas: string[] = [];
  // Os anúncios que saíram, por loja: depois conferimos se o conjunto ficou vazio.
  const anunciosTirados = new Map<string, string[]>();

  for (const alvo of acao.alvos) {
    const daCarteira = await prisma.client.findFirst({
      where: { id: alvo.clientId, ...CARTEIRA_NO_META, ...escopoDaCarteira(pessoa) },
      select: { id: true },
    });
    if (!daCarteira) {
      falhas.push(`${alvo.nome} (a ${alvo.loja} não é mais da sua carteira)`);
      continue;
    }

    // De novo pelo cadastro da loja, e não pelo id que veio guardado: a mesma
    // trava que impede um id trocado de pausar a campanha de outra pessoa.
    const nivel = alvo.nivel ?? "anuncio";
    const objeto = await acharObjetoDaLoja(alvo.clientId, nivel, alvo.adId);
    if (!objeto) {
      falhas.push(`${alvo.nome} (não achei mais ${nivel === "conjunto" ? "esse conjunto" : "esse anúncio"})`);
      continue;
    }

    const r = await mudarStatus({
      clientId: alvo.clientId,
      quemId: pessoa.id,
      nivel,
      objeto,
      ligar: false,
      origem: "whatsapp",
      pedidoPor: `${pessoa.name} (privado)`,
      pedidoTexto: acao.pedido,
    });

    if (r.ok) {
      feitos.set(alvo.loja, [
        ...(feitos.get(alvo.loja) ?? []),
        nivel === "conjunto" ? `conjunto ${objeto.nome}` : objeto.nome,
      ]);
      if (nivel === "anuncio") {
        anunciosTirados.set(alvo.clientId, [...(anunciosTirados.get(alvo.clientId) ?? []), alvo.adId]);
      }
    } else {
      falhas.push(`${objeto.nome} (${r.erro})`);
    }
  }

  // Conjunto que ficou sem anúncio ativo sai junto; com outro carro dentro, fica.
  const vazios: string[] = [];
  for (const [clientId, adIds] of anunciosTirados) {
    const r = await pausarConjuntosVazios({
      clientId,
      adIds,
      quemId: pessoa.id,
      pedidoPor: `${pessoa.name} (privado)`,
      pedidoTexto: acao.pedido,
    });
    vazios.push(...r.pausados);
    falhas.push(...r.falhas);
  }

  const partes: string[] = [];
  for (const [loja, nomes] of feitos) {
    partes.push(`Pronto, pausei na ${negrito(loja)}:\n${lista(nomes)}`);
  }
  if (vazios.length > 0) partes.push(textoDosConjuntosVazios(vazios));
  if (falhas.length > 0) {
    partes.push(`Não consegui pausar:\n${lista(falhas)}\n\nFaz pelo Legacy OS.`);
  }

  const pausados = [...feitos.values()].reduce((s, n) => s + n.length, 0);
  return { resposta: partes.join("\n\n"), pausados, falhas: falhas.length };
}
