import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { enviarTexto } from "./zapi";
import { lidDoRobo } from "./identidade-do-robo";
import { anotar } from "./trilha";
import { confirmaAviso, executarAviso, montarAvisoParaEquipe } from "./aviso-para-equipe";
import { responderComoPessoa } from "@/lib/copiloto/responder";
import { canAccessModule } from "@/lib/permissions";
import { ehPerguntaDeGasto, pedeListaDeGastos } from "@/lib/financeiro-ia/interpretar-pergunta";
import { perguntaDeGastoTemAssunto, responderListaDeGastos, responderPerguntaDeGasto } from "@/lib/financeiro-ia/responder-gasto";
import type { Turno } from "@/lib/copiloto/cerebro";
import {
  descartarPendente,
  executarPausa,
  guardarPendente,
  lerPendente,
  montarPedidoDePausa,
  respostaDeConfirmacao,
  tomarPendente,
} from "./pausar-no-privado";
import { executarVendaNoPrivado, lerRespostaDaVenda, montarVendaNoPrivado } from "@/lib/vendas/venda-no-privado";
import { tratarSubirAnuncio } from "./subir-anuncio";
import { executarComercial, tratarComandoDoDia } from "./comandos-do-dia";
import { executarAtribuicao, tratarTarefaNoPrivado } from "./tarefas-no-privado";
import { executarAnuncioDoEstoque, montarAnuncioDoEstoque } from "./anunciar-do-estoque-no-privado";

// A IA atendendo no privado do WhatsApp.
//
// ── Para que isto existe ─────────────────────────────────────────────────
//
// Pra Giovana perguntar "qual loja minha está sem verba?" do celular, no meio
// da rua, e receber a resposta das lojas DELA — sem abrir o sistema.
//
// ── A trava que importa ──────────────────────────────────────────────────
//
// O número diz quem é a pessoa, e quem é a pessoa diz quais lojas ela pode
// ver. É o mesmo recorte de carteira da tela, pela mesma função: ninguém
// descobre por aqui como vai a loja de outro gestor, mesmo perguntando de
// propósito, porque a lista de lojas que o modelo enxerga já sai filtrada.
//
// Número que não é de ninguém da casa recebe um recado curto e NÃO aciona a
// IA. Isso não é só economia: é o que impede que qualquer pessoa com o número
// do robô gaste a nossa chave de IA fazendo perguntas.
//
// ── Por que a memória é curta ────────────────────────────────────────────
//
// Porque "e a outra loja?" precisa de contexto, e porque conversa de chat não
// é registro contábil. Guardar tudo pra sempre seria espalhar os números das
// lojas por mais um lugar sem ninguém precisar deles ali.

/** Quantos turnos de conversa a IA lembra. */
const LEMBRA_TURNOS = 10;

/**
 * Depois disto, a conversa recomeça do zero.
 *
 * Duas horas porque é o intervalo em que "e a outra?" ainda quer dizer alguma
 * coisa. Uma pergunta nova de manhã, respondida com o contexto de ontem à
 * noite, seria pior que uma pergunta sem contexto nenhum.
 */
const MEMORIA_DURA_MS = 2 * 60 * 60 * 1000;

/** Quantas perguntas uma pessoa pode fazer por hora. */
const TETO_POR_HORA = 30;

export const RECADO_PARA_DESCONHECIDO =
  "Oi! Este número é um atendimento interno da Legacy Digital. " +
  "Se você é cliente, fale com o seu gestor no grupo da sua loja. 🦅";

export type DesfechoPrivado =
  /** Não é número de ninguém da casa. Recado padrão, sem IA. */
  | { tipo: "desconhecido" }
  /** É da casa, mas não tem acesso ao módulo de clientes. */
  | { tipo: "sem-acesso"; userId: string }
  /** Perguntou demais na última hora. */
  | { tipo: "teto"; userId: string }
  /** Perguntou quanto gastou com algo: respondido pelo financeiro, sem IA. */
  | { tipo: "respondeu-gasto"; userId: string }
  /** Respondeu. */
  | { tipo: "respondeu"; userId: string; temAcoes: boolean }
  /** Mandou pausar algo: o robô disse o que ia pausar e espera o "sim". */
  | { tipo: "pediu-confirmacao"; userId: string; quantos: number }
  /** Mandou pausar, mas não deu pra saber o quê (ou onde). Perguntou. */
  | { tipo: "pedido-sem-alvo"; userId: string }
  /** Disse "sim" e o robô pausou — pelo menos tentou. */
  | { tipo: "pausou"; userId: string; pausados: number; falhas: number }
  /** O dono avisou uma venda: o robô disse loja e carro e espera o "sim" (ou a origem/valor que falta). */
  | { tipo: "pediu-confirmacao-de-venda"; userId: string }
  /** O dono confirmou a venda: registrou (se foi lead) e pausou o que estava no ar. */
  | { tipo: "vendeu"; userId: string; registrou: boolean; pausados: number; falhas: number }
  /** A conversa de subir anúncio pelo WhatsApp respondeu (ver subir-anuncio.ts). */
  | { tipo: "subir-anuncio"; userId: string }
  /** O dono pediu pra avisar alguém da casa: o robô mostrou o texto e quem recebe, e espera o "sim". */
  | { tipo: "pediu-confirmacao-de-aviso"; userId: string }
  /** O dono confirmou: o robô mandou o recado pelo WhatsApp. */
  | { tipo: "avisou"; userId: string; enviados: number; falhas: number }
  /** Registro do dia a dia (visita, anotação, gravação, entrega, relatório, etapa): feito na hora, ou o robô perguntou o que faltou. */
  | { tipo: "registrou"; userId: string; comando: string }
  /** "Anunciar o Compass da Vilela": o robô mostrou o que vai subir (rascunho pausado) e espera o "sim". */
  | { tipo: "pediu-confirmacao-de-anuncio"; userId: string }
  /** Confirmou: o robô tentou subir o rascunho do estoque (ok = criou). */
  | { tipo: "anunciou-do-estoque"; userId: string; ok: boolean }
  /** Tarefas: lista, criou pra si, concluiu, cancelou — ou perguntou o que faltou. */
  | { tipo: "tarefa"; userId: string; acao: string }
  /** O dono/gerência pediu pra passar tarefa a outra pessoa: o robô mostrou e espera o "sim". */
  | { tipo: "pediu-confirmacao-de-tarefa"; userId: string }
  /** Confirmou: a tarefa foi criada (e a pessoa avisada). */
  | { tipo: "atribuiu-tarefa"; userId: string }
  /** Comercial (só o dono): o robô mostrou o que vai pro funil e pra agenda, e espera o "sim". */
  | { tipo: "pediu-confirmacao-de-comercial"; userId: string }
  /** O dono confirmou e o robô mexeu no funil/agenda. */
  | { tipo: "registrou-comercial"; userId: string }
  /** Disse "não", ou mandou outra coisa: a confirmação foi descartada. */
  | { tipo: "cancelou"; userId: string }
  /** Disse "sim" tarde demais. Nada foi pausado. */
  | { tipo: "confirmacao-vencida"; userId: string }
  /** A IA não está configurada, ou falhou. */
  | { tipo: "falhou"; userId: string; erro: string };

export interface MensagemPrivada {
  /**
   * De quem escreveu, como a Z-API manda: o telefone, ou "…@lid" quando o
   * WhatsApp esconde o número. Ver acharPessoaPeloNumero.
   */
  telefone: string;
  texto: string;
  /** O id da mensagem na Z-API, só pra juntar os passos da trilha. */
  messageId?: string | null;
}

/** Só os dígitos, pra comparar telefone escrito de jeitos diferentes. */
function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Acha a pessoa da casa dona deste número.
 *
 * Compara por sufixo porque o mesmo telefone brasileiro circula com e sem o
 * 55 e com e sem o nono dígito — e porque o que a Z-API manda nem sempre é o
 * que alguém digitou na ficha. Mas o casamento por sufixo só vale quando há
 * UM dono possível: dois números que terminam igual é ambiguidade, e
 * ambiguidade aqui significaria responder a pergunta de uma pessoa com a
 * carteira de outra. Nesse caso ninguém é dono.
 */
export async function acharPessoaPeloNumero(telefone: string) {
  // O WhatsApp está trocando o telefone por um identificador privado ("@lid")
  // em parte das conversas, e a Z-API só repassa — ver mencao.ts. Quem escreve
  // assim chega com 14 dígitos que não batem com NENHUM telefone cadastrado, e
  // sem este caminho seria tratado como desconhecido: uma gestora da casa
  // recebendo "este número é um atendimento interno".
  if (/@lid$/i.test(telefone.trim())) return acharPessoaPeloLid(telefone);

  const digitos = soDigitos(telefone);
  if (digitos.length < 10) return null;

  const gente = await prisma.user.findMany({
    where: { whatsapp: { not: null }, active: true },
    select: { id: true, name: true, role: true, email: true, whatsapp: true },
  });

  const donos = gente.filter((p) => {
    const dele = soDigitos(p.whatsapp!);
    if (dele.length < 10) return false;
    return dele === digitos || dele.endsWith(digitos) || digitos.endsWith(dele);
  });

  return donos.length === 1 ? donos[0] : null;
}

/**
 * Acha a pessoa da casa dona deste "@lid".
 *
 * A Z-API não converte lid em telefone, mas converte telefone em lid. Então o
 * caminho é o inverso: pergunta o lid de cada número cadastrado (com cache, ver
 * identidade-do-robo.ts) e compara. A comparação é por IGUALDADE exata: lid não
 * tem DDI nem nono dígito pra variar, e sufixo só abriria margem pra responder
 * com a carteira de outra pessoa.
 */
async function acharPessoaPeloLid(lid: string) {
  const alvo = soDigitos(lid);
  if (alvo.length < 8) return null;

  const gente = await prisma.user.findMany({
    where: { whatsapp: { not: null }, active: true },
    select: { id: true, name: true, role: true, email: true, whatsapp: true },
  });

  const donos = [];
  for (const p of gente) {
    const dele = soDigitos(p.whatsapp!);
    if (dele.length < 10) continue;
    // A Z-API só acha o número com o 55 na frente, e o WhatsApp guarda uns com o nono dígito e outros sem: a ficha, digitada
    // "(42) 9…", falhava e a pessoa da casa caía no recado de desconhecido. Tenta as formas possíveis (o lid de cada uma, em cache).
    for (const forma of formasDoNumero(dele)) {
      if ((await lidDoRobo(forma)) === alvo) {
        donos.push(p);
        break;
      }
    }
  }
  // Ambiguidade, de novo, é ninguém: o erro que acerta quase sempre é o pior.
  return donos.length === 1 ? donos[0] : null;
}

/**
 * As formas em que o mesmo celular brasileiro pode estar no WhatsApp: com 55 e com/sem o nono dígito. A forma mais provável vem
 * primeiro. Número que não parece brasileiro (começa com outro DDI) segue como veio. Pura.
 */
export function formasDoNumero(digitos: string): string[] {
  let d = digitos.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  const formas = [d];
  if (d.startsWith("55")) {
    const resto = d.slice(2);
    if (resto.length === 11 && resto[2] === "9") formas.push(`55${resto.slice(0, 2)}${resto.slice(3)}`);
    if (resto.length === 10) formas.push(`55${resto.slice(0, 2)}9${resto.slice(2)}`);
  }
  return [...new Set(formas)];
}

/** Só pra o rastro: o fim do número, nunca ele inteiro. */
function pontaDoNumero(telefone: string): string {
  const d = soDigitos(telefone);
  return `${/@lid$/i.test(telefone.trim()) ? "lid" : "tel"}…${d.slice(-4)}`;
}

/** A memória da conversa, já descartada quando velha demais. */
async function lerMemoria(userId: string, agora: Date): Promise<Turno[]> {
  const c = await prisma.conversaDoCopiloto.findUnique({
    where: { userId },
    select: { turnos: true, atualizadoEm: true },
  });
  if (!c) return [];
  if (agora.getTime() - c.atualizadoEm.getTime() > MEMORIA_DURA_MS) return [];

  // O que vem do banco é JSON livre: validado aqui, não assumido. Uma linha
  // estranha vira conversa sem contexto, nunca uma exceção no meio do
  // atendimento.
  if (!Array.isArray(c.turnos)) return [];
  return c.turnos
    .filter(
      (t): t is { de: string; texto: string } =>
        !!t && typeof t === "object" && "de" in t && "texto" in t,
    )
    .map((t) => ({
      de: t.de === "copiloto" ? ("copiloto" as const) : ("gestor" as const),
      texto: String(t.texto).slice(0, 4000),
    }))
    .slice(-LEMBRA_TURNOS);
}

async function guardarMemoria(userId: string, turnos: Turno[]) {
  // O cast existe porque o campo é Json livre no banco e o Prisma não aceita
  // um array tipado direto. O formato é garantido na leitura (lerMemoria
  // valida linha por linha), que é onde ele pode estar errado de verdade:
  // o que sai daqui é sempre nosso, o que entra de lá pode ser qualquer coisa.
  const curtos = turnos.slice(-LEMBRA_TURNOS) as unknown as Prisma.InputJsonValue;
  await prisma.conversaDoCopiloto.upsert({
    where: { userId },
    create: { userId, turnos: curtos },
    update: { turnos: curtos },
  });
}

/**
 * Quantas perguntas esta pessoa fez na última hora.
 *
 * Conta os turnos do gestor guardados na memória. Não é um contador exato —
 * a memória só guarda os últimos — e não precisa ser: o que ele evita é o
 * celular no bolso mandando cinquenta mensagens, não um ataque.
 */
function passouDoTeto(turnos: Turno[]): boolean {
  return turnos.filter((t) => t.de === "gestor").length >= TETO_POR_HORA;
}

/**
 * Atende uma mensagem que chegou no privado do robô.
 *
 * Sempre responde alguma coisa: quem manda mensagem e não recebe nada conclui
 * que está quebrado, e passa a não usar.
 */
export async function atenderMensagemPrivada(
  m: MensagemPrivada,
  agora = new Date(),
): Promise<DesfechoPrivado> {
  const ponta = pontaDoNumero(m.telefone);
  await anotar(m.messageId, `privado ${ponta}`, "privado-chegou", `${m.texto.length} caracteres`);
  const pessoa = await acharPessoaPeloNumero(m.telefone);

  // ── Número de fora ───────────────────────────────────────────────────
  if (!pessoa) {
    // Sem isto, "a gestora não recebeu resposta" e "o número dela não é
    // reconhecido" eram a mesma coisa de fora, e impossíveis de separar.
    await anotar(m.messageId, `privado ${ponta}`, "privado-desconhecido", /@lid$/i.test(m.telefone.trim()) ? "o lid não bateu com nenhum número cadastrado" : "o telefone não bateu com nenhum cadastro (ou bateu com mais de um)");
    await responder(m.telefone, RECADO_PARA_DESCONHECIDO, m.messageId);
    return { tipo: "desconhecido" };
  }

  // ── Pergunta sobre os GASTOS do dono ──────────────────────────────────
  //
  // "Quanto gastei de Uber com o Igor esse mês?" no privado também. Só quem vê o
  // financeiro (ADMIN) — e o pessoal que entra na conta é sempre o DELE, porque a
  // consulta filtra por quem escreveu.
  if (canAccessModule(pessoa.role, "financeiro", pessoa.email) && ehPerguntaDeGasto(m.texto) && perguntaDeGastoTemAssunto(m.texto, agora)) {
    await anotar(m.messageId, `privado ${ponta}`, "privado-pergunta-de-gasto");
    if (pedeListaDeGastos(m.texto)) {
      for (const texto of await responderListaDeGastos(pessoa.id, m.texto, agora)) await responder(m.telefone, texto, m.messageId);
    } else {
      await responder(m.telefone, await responderPerguntaDeGasto(pessoa.id, m.texto, agora), m.messageId);
    }
    return { tipo: "respondeu-gasto", userId: pessoa.id };
  }

  // ── Da casa, mas sem acesso ao módulo ────────────────────────────────
  //
  // A mesma régua da tela. Alguém do financeiro com o número cadastrado não
  // passa a ver carteira de tráfego por falar com o robô.
  if (!canAccessModule(pessoa.role, "clientes", pessoa.email)) {
    await responder(
      m.telefone,
      `Oi, ${primeiroNome(pessoa.name)}! Eu respondo sobre as lojas e os ` +
        `anúncios, e o seu acesso não cobre essa parte. Fala com o Guilherme ` +
        `se precisar.`,
      m.messageId,
    );
    return { tipo: "sem-acesso", userId: pessoa.id };
  }

  const historico = await lerMemoria(pessoa.id, agora);

  if (passouDoTeto(historico)) {
    await responder(
      m.telefone,
      "Você fez muitas perguntas seguidas. Me dá um tempo e volta daqui a pouco.",
      m.messageId,
    );
    return { tipo: "teto", userId: pessoa.id };
  }

  // ── Subir anúncio pelo WhatsApp ───────────────────────────────────────
  //
  // Vem ANTES da confirmação de pausa: se há um anúncio sendo montado, o "sim" é dele. E começar a montar um
  // anúncio descarta uma pausa que estivesse esperando (ver tratarSubirAnuncio).
  // "Anunciar o Compass da Vilela" (carro do ESTOQUE → rascunho pausado): só age se acha UM carro assim; senão segue.
  const doEstoque = await montarAnuncioDoEstoque(pessoa, m.texto);
  if (doEstoque) {
    if (doEstoque.pendente) await guardarPendente(pessoa.id, doEstoque.pendente, agora);
    await responder(m.telefone, doEstoque.resposta, m.messageId);
    await guardarMemoria(pessoa.id, [
      ...historico,
      { de: "gestor", texto: m.texto.slice(0, 4000) },
      { de: "copiloto", texto: doEstoque.resposta.slice(0, 4000) },
    ]);
    return doEstoque.pendente ? { tipo: "pediu-confirmacao-de-anuncio", userId: pessoa.id } : { tipo: "pedido-sem-alvo", userId: pessoa.id };
  }

  const sobe = await tratarSubirAnuncio(pessoa, m.texto, agora);
  if (sobe !== null) {
    await responder(m.telefone, sobe, m.messageId);
    return { tipo: "subir-anuncio", userId: pessoa.id };
  }

  // ── A confirmação que estava esperando ───────────────────────────────
  //
  // Vem ANTES de tudo: um "sim" não é pergunta pra IA, é resposta a uma coisa
  // que o robô perguntou. Mandar pro Copiloto faria ele responder "sim o quê?".
  //
  // E a confirmação vale só pra PRÓXIMA mensagem. Qualquer outra coisa que a
  // pessoa escrever cancela a pendência: um "sim" dito meia hora depois, sobre
  // outro assunto, não pode pausar um anúncio que ela já esqueceu ter pedido.
  const pendente = await lerPendente(pessoa.id, agora);

  // ── Uma venda esperando conferência (só o dono) ───────────────────────
  if (pendente.acao?.tipo === "registrar-venda") {
    const acao = pendente.acao;
    if (pendente.venceu) {
      await descartarPendente(pessoa.id);
      if (respostaDeConfirmacao(m.texto) === "sim") {
        await responder(m.telefone, "Esse pedido venceu (passou de 10 minutos) e eu não fiz nada. Me avisa a venda de novo.", m.messageId);
        return { tipo: "confirmacao-vencida", userId: pessoa.id };
      }
    } else {
      const lida = await lerRespostaDaVenda(acao, m.texto);
      if (lida.tipo === "executar") {
        if (!(await tomarPendente(pessoa.id))) {
          await responder(m.telefone, "Esse pedido já foi tratado.", m.messageId);
          return { tipo: "cancelou", userId: pessoa.id };
        }
        const feito = await executarVendaNoPrivado(pessoa, acao, agora, m.messageId);
        await responder(m.telefone, feito.resposta, m.messageId);
        await guardarMemoria(pessoa.id, [
          ...historico,
          { de: "gestor", texto: m.texto.slice(0, 4000) },
          { de: "copiloto", texto: feito.resposta.slice(0, 4000) },
        ]);
        return { tipo: "vendeu", userId: pessoa.id, registrou: feito.registrou, pausados: feito.pausados, falhas: feito.falhas };
      }
      if (lida.tipo === "atualizar") {
        await guardarPendente(pessoa.id, lida.acao, agora);
        await responder(m.telefone, lida.resposta, m.messageId);
        return { tipo: "pediu-confirmacao-de-venda", userId: pessoa.id };
      }
      await descartarPendente(pessoa.id);
      if (lida.tipo === "cancelar") {
        await responder(m.telefone, "Tudo bem, não registrei nem pausei nada.", m.messageId);
        return { tipo: "cancelou", userId: pessoa.id };
      }
      // "outra-coisa": segue como conversa nova, já sem a pendência.
    }
  } else if (pendente.acao?.tipo === "avisar-equipe") {
    // ── Um recado pra equipe esperando o "sim" (só o dono) ───────────────
    const resposta = confirmaAviso(m.texto);
    if (resposta === "sim" && !pendente.venceu) {
      if (!(await tomarPendente(pessoa.id))) {
        await responder(m.telefone, "Esse pedido já foi tratado.", m.messageId);
        return { tipo: "cancelou", userId: pessoa.id };
      }
      const feito = await executarAviso(pessoa, pendente.acao, m.messageId);
      await responder(m.telefone, feito.resposta, m.messageId);
      await guardarMemoria(pessoa.id, [
        ...historico,
        { de: "gestor", texto: m.texto.slice(0, 4000) },
        { de: "copiloto", texto: feito.resposta.slice(0, 4000) },
      ]);
      return { tipo: "avisou", userId: pessoa.id, enviados: feito.enviados, falhas: feito.falhas };
    }
    await descartarPendente(pessoa.id);
    if (resposta === "sim") {
      await responder(m.telefone, "Esse pedido venceu (passou de 10 minutos) e eu não mandei nada. Me pede de novo.", m.messageId);
      return { tipo: "confirmacao-vencida", userId: pessoa.id };
    }
    if (resposta === "nao") {
      await responder(m.telefone, "Tudo bem, não mandei nada.", m.messageId);
      return { tipo: "cancelou", userId: pessoa.id };
    }
    // Outra mensagem: segue como conversa nova, já sem a pendência.
  } else if (pendente.acao?.tipo === "anunciar-do-estoque") {
    // ── Um carro do estoque esperando o "sim" pra virar rascunho pausado ──
    const resposta = confirmaAviso(m.texto);
    if (resposta === "sim" && !pendente.venceu) {
      if (!(await tomarPendente(pessoa.id))) {
        await responder(m.telefone, "Esse pedido já foi tratado.", m.messageId);
        return { tipo: "cancelou", userId: pessoa.id };
      }
      await responder(m.telefone, "⏳ Pegando as fotos no site e montando o rascunho… leva um minutinho.", m.messageId);
      const feito = await executarAnuncioDoEstoque(pessoa, pendente.acao);
      await responder(m.telefone, feito.resposta, m.messageId);
      await guardarMemoria(pessoa.id, [
        ...historico,
        { de: "gestor", texto: m.texto.slice(0, 4000) },
        { de: "copiloto", texto: feito.resposta.slice(0, 4000) },
      ]);
      return { tipo: "anunciou-do-estoque", userId: pessoa.id, ok: feito.ok };
    }
    await descartarPendente(pessoa.id);
    if (resposta === "sim") {
      await responder(m.telefone, "Esse pedido venceu (passou de 10 minutos) e eu não subi nada. Me pede de novo.", m.messageId);
      return { tipo: "confirmacao-vencida", userId: pessoa.id };
    }
    if (resposta === "nao") {
      await responder(m.telefone, "Tudo bem, não subi nada.", m.messageId);
      return { tipo: "cancelou", userId: pessoa.id };
    }
    // Outra mensagem: segue como conversa nova, já sem a pendência.
  } else if (pendente.acao?.tipo === "atribuir-tarefa") {
    // ── Uma tarefa pra outra pessoa esperando o "sim" ────────────────────
    const resposta = confirmaAviso(m.texto);
    if (resposta === "sim" && !pendente.venceu) {
      if (!(await tomarPendente(pessoa.id))) {
        await responder(m.telefone, "Esse pedido já foi tratado.", m.messageId);
        return { tipo: "cancelou", userId: pessoa.id };
      }
      const feito = await executarAtribuicao(pessoa, pendente.acao, agora, m.messageId);
      await responder(m.telefone, feito.resposta, m.messageId);
      await guardarMemoria(pessoa.id, [
        ...historico,
        { de: "gestor", texto: m.texto.slice(0, 4000) },
        { de: "copiloto", texto: feito.resposta.slice(0, 4000) },
      ]);
      return { tipo: "atribuiu-tarefa", userId: pessoa.id };
    }
    await descartarPendente(pessoa.id);
    if (resposta === "sim") {
      await responder(m.telefone, "Esse pedido venceu (passou de 10 minutos) e eu não criei a tarefa. Me pede de novo.", m.messageId);
      return { tipo: "confirmacao-vencida", userId: pessoa.id };
    }
    if (resposta === "nao") {
      await responder(m.telefone, "Tudo bem, não criei a tarefa.", m.messageId);
      return { tipo: "cancelou", userId: pessoa.id };
    }
    // Outra mensagem: segue como conversa nova, já sem a pendência.
  } else if (pendente.acao?.tipo === "comercial") {
    // ── Reunião/fechamento esperando o "sim" (só o dono) ──────────────────
    const resposta = confirmaAviso(m.texto);
    if (resposta === "sim" && !pendente.venceu) {
      if (!(await tomarPendente(pessoa.id))) {
        await responder(m.telefone, "Esse pedido já foi tratado.", m.messageId);
        return { tipo: "cancelou", userId: pessoa.id };
      }
      const feito = await executarComercial(pessoa, pendente.acao, agora, m.messageId);
      await responder(m.telefone, feito.resposta, m.messageId);
      await guardarMemoria(pessoa.id, [
        ...historico,
        { de: "gestor", texto: m.texto.slice(0, 4000) },
        { de: "copiloto", texto: feito.resposta.slice(0, 4000) },
      ]);
      return { tipo: "registrou-comercial", userId: pessoa.id };
    }
    await descartarPendente(pessoa.id);
    if (resposta === "sim") {
      await responder(m.telefone, "Esse pedido venceu (passou de 10 minutos) e eu não registrei nada. Me manda de novo.", m.messageId);
      return { tipo: "confirmacao-vencida", userId: pessoa.id };
    }
    if (resposta === "nao") {
      await responder(m.telefone, "Tudo bem, não registrei nada.", m.messageId);
      return { tipo: "cancelou", userId: pessoa.id };
    }
    // Outra mensagem: segue como conversa nova, já sem a pendência.
  } else if (pendente.acao?.tipo === "pausar-anuncios") {
    const resposta = respostaDeConfirmacao(m.texto);

    if (resposta === "sim" && !pendente.venceu) {
      // Só um "sim" executa: o dedo duplo e o reenvio da Z-API leem a mesma
      // pendência, e quem não conseguir tomá-la descobre que já foi tratada.
      if (!(await tomarPendente(pessoa.id))) {
        await responder(m.telefone, "Esse pedido já foi tratado.", m.messageId);
        return { tipo: "cancelou", userId: pessoa.id };
      }
      const feito = await executarPausa(pessoa, pendente.acao);
      await responder(m.telefone, feito.resposta, m.messageId);
      await guardarMemoria(pessoa.id, [
        ...historico,
        { de: "gestor", texto: m.texto.slice(0, 4000) },
        { de: "copiloto", texto: feito.resposta.slice(0, 4000) },
      ]);
      return {
        tipo: "pausou",
        userId: pessoa.id,
        pausados: feito.pausados,
        falhas: feito.falhas,
      };
    }

    if (resposta === "sim") {
      await descartarPendente(pessoa.id);
      await responder(
        m.telefone,
        "Esse pedido venceu (passou de 10 minutos) e eu não pausei nada. " +
          "Me pede de novo se ainda quiser.",
        m.messageId,
      );
      return { tipo: "confirmacao-vencida", userId: pessoa.id };
    }

    // "não", ou qualquer outra coisa: a pendência acaba aqui.
    await descartarPendente(pessoa.id);
    if (resposta === "nao") {
      await responder(m.telefone, "Tudo bem, não pausei nada.", m.messageId);
      return { tipo: "cancelou", userId: pessoa.id };
    }
    // Outra mensagem: segue como conversa nova, já sem a pendência.
  }

  // ── "Envie um aviso à Tatiana…" (só o dono) ───────────────────────────
  //
  // Mostra o texto exato e quem recebe, e só manda depois do "sim". Antes disto o Copiloto escrevia o aviso na
  // conversa como se tivesse mandado — e não mandava nada.
  const aviso = await montarAvisoParaEquipe(pessoa, m.texto);
  if (aviso) {
    if (aviso.pendente) await guardarPendente(pessoa.id, aviso.pendente, agora);
    await responder(m.telefone, aviso.resposta, m.messageId);
    await guardarMemoria(pessoa.id, [
      ...historico,
      { de: "gestor", texto: m.texto.slice(0, 4000) },
      { de: "copiloto", texto: aviso.resposta.slice(0, 4000) },
    ]);
    return aviso.pendente ? { tipo: "pediu-confirmacao-de-aviso", userId: pessoa.id } : { tipo: "pedido-sem-alvo", userId: pessoa.id };
  }

  // ── Tarefas: "me lembra de…", "o que tenho hoje?", "feito 2", "pede pra Tatiana…" ──────────────────────────
  //
  // Vem DEPOIS do aviso pra equipe ("avisa a Tatiana que…" é um recado, não uma tarefa) e ANTES dos registros do dia
  // ("feito 2" não é um registro de loja). Ver tarefas-no-privado.ts.
  const tarefa = await tratarTarefaNoPrivado(pessoa, m.texto, agora, m.messageId);
  if (tarefa) {
    if (tarefa.pendente) await guardarPendente(pessoa.id, tarefa.pendente, agora);
    await responder(m.telefone, tarefa.resposta, m.messageId);
    await guardarMemoria(pessoa.id, [
      ...historico,
      { de: "gestor", texto: m.texto.slice(0, 4000) },
      { de: "copiloto", texto: tarefa.resposta.slice(0, 4000) },
    ]);
    return tarefa.pendente ? { tipo: "pediu-confirmacao-de-tarefa", userId: pessoa.id } : { tipo: "tarefa", userId: pessoa.id, acao: tarefa.tipo };
  }

  // ── "Visitei a Vilela", "anota na Vilela: …", "gravei…", "mandei o relatório…" ──────────────────────────────
  //
  // O dia a dia registrado pelo WhatsApp (ver comandos-do-dia.ts). Vem DEPOIS do aviso pra equipe ("avisa o Igor que
  // gravei…" é um aviso, não uma gravação) e ANTES da venda e da pausa.
  const comando = await tratarComandoDoDia(pessoa, m.texto, agora, m.messageId);
  if (comando) {
    if (comando.pendente) await guardarPendente(pessoa.id, comando.pendente, agora);
    await responder(m.telefone, comando.resposta, m.messageId);
    await guardarMemoria(pessoa.id, [
      ...historico,
      { de: "gestor", texto: m.texto.slice(0, 4000) },
      { de: "copiloto", texto: comando.resposta.slice(0, 4000) },
    ]);
    return comando.pendente ? { tipo: "pediu-confirmacao-de-comercial", userId: pessoa.id } : { tipo: "registrou", userId: pessoa.id, comando: comando.tipo };
  }

  // ── "Vilela vendeu o Versa" (só o dono) ───────────────────────────────
  //
  // Registra a venda e tira o carro do ar, depois de o robô dizer loja e carro e
  // receber o "sim". Fora do dono, "vendeu" no privado continua sendo só conversa.
  const venda = await montarVendaNoPrivado(pessoa, m.texto, agora);
  if (venda) {
    if (venda.pendente) await guardarPendente(pessoa.id, venda.pendente, agora);
    await responder(m.telefone, venda.resposta, m.messageId);
    await guardarMemoria(pessoa.id, [
      ...historico,
      { de: "gestor", texto: m.texto.slice(0, 4000) },
      { de: "copiloto", texto: venda.resposta.slice(0, 4000) },
    ]);
    return venda.pendente
      ? { tipo: "pediu-confirmacao-de-venda", userId: pessoa.id }
      : { tipo: "pedido-sem-alvo", userId: pessoa.id };
  }

  // ── Uma ordem de pausar ──────────────────────────────────────────────
  //
  // Só ORDEM ativa isto ("pausa o Virtus da R2"). A IA recomendando pausar não é
  // ordem, e "vendeu o Virtus" no privado é uma frase que a pessoa pode estar só
  // contando: essas vão pra conversa abaixo.
  const ordem = await montarPedidoDePausa(pessoa, m.texto, agora);
  if (ordem) {
    if (ordem.pendente) await guardarPendente(pessoa.id, ordem.pendente, agora);
    await responder(m.telefone, ordem.resposta, m.messageId);
    await guardarMemoria(pessoa.id, [
      ...historico,
      { de: "gestor", texto: m.texto.slice(0, 4000) },
      { de: "copiloto", texto: ordem.resposta.slice(0, 4000) },
    ]);
    return ordem.pendente
      ? { tipo: "pediu-confirmacao", userId: pessoa.id, quantos: ordem.pendente.alvos.length }
      : { tipo: "pedido-sem-alvo", userId: pessoa.id };
  }

  const r = await responderComoPessoa(pessoa, m.texto, historico, "whatsapp");

  if (r.erro !== undefined || r.resposta === undefined) {
    const erro = r.erro ?? "não veio resposta.";
    await responder(m.telefone, `Não consegui responder agora: ${erro}`, m.messageId);
    return { tipo: "falhou", userId: pessoa.id, erro };
  }
  const resposta = r.resposta;

  // ── A resposta ───────────────────────────────────────────────────────
  //
  // Quando a IA RECOMENDA mexer em alguma coisa, ela diz o que faria — e não faz.
  // Recomendação não é ordem: o que a pessoa pede de forma direta ("pausa o X
  // da loja Y") é tratado acima, com confirmação. Pausa de anúncio se pede por
  // aqui; verba continua só pela tela, onde o valor se confere antes.
  const acoes = r.acoes ?? [];
  const texto =
    resposta +
    (acoes.length > 0
      ? "\n\n" +
        acoes
          .map((a) =>
            a.tipo === "pausar_anuncio"
              ? `• Daria pra pausar *${a.nome}* (${a.loja}) — ${a.porQue}`
              : `• Daria pra mudar a verba de *${a.nome}* (${a.loja}) para R$ ${a.valorReais} — ${a.porQue}`,
          )
          .join("\n") +
        "\n\n" +
        (acoes.some((a) => a.tipo === "mudar_verba")
          ? "Verba eu só mudo pelo Legacy OS, onde dá pra conferir o valor. "
          : "") +
        (acoes.some((a) => a.tipo === "pausar_anuncio")
          ? "Pra eu pausar, me peça direto: *pausa o NOME DO CARRO da LOJA*."
          : "")
      : "");

  await responder(m.telefone, texto, m.messageId);

  await guardarMemoria(pessoa.id, [
    ...historico,
    { de: "gestor", texto: m.texto.slice(0, 4000) },
    { de: "copiloto", texto: resposta.slice(0, 4000) },
  ]);

  return { tipo: "respondeu", userId: pessoa.id, temAcoes: acoes.length > 0 };
}

function primeiroNome(nome: string): string {
  return nome.split(" ")[0];
}

/**
 * Fala com a pessoa.
 *
 * Falha de envio NUNCA derruba o atendimento. Se a resposta não saiu, o pior
 * que acontece é a pessoa repetir a pergunta — estourar aqui faria a Z-API
 * reenviar a mensagem e a IA responder duas vezes, cobrando duas vezes.
 */
async function responder(
  telefone: string,
  texto: string,
  messageId?: string | null,
): Promise<void> {
  try {
    const r = await enviarTexto(telefone, texto);
    // `enviarTexto` NÃO estoura quando a Z-API recusa: devolve { ok: false }.
    // Ignorar o retorno foi o buraco que deixou o robô do grupo mudo por dois
    // dias sem ninguém saber — e o privado tinha exatamente o mesmo.
    await anotar(
      messageId,
      `privado ${pontaDoNumero(telefone)}`,
      r.ok ? "privado-respondeu" : "privado-envio-recusado",
      r.ok ? `${texto.length} caracteres` : r.erro,
    );
  } catch (e) {
    await anotar(
      messageId,
      `privado ${pontaDoNumero(telefone)}`,
      "privado-envio-estourou",
      e instanceof Error ? e.message : String(e),
    );
  }
}
