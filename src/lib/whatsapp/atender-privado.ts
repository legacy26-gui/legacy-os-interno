import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { enviarTexto } from "./zapi";
import { responderComoPessoa } from "@/lib/copiloto/responder";
import { canAccessModule } from "@/lib/permissions";
import type { Turno } from "@/lib/copiloto/cerebro";

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
  /** Respondeu. */
  | { tipo: "respondeu"; userId: string; temAcoes: boolean }
  /** A IA não está configurada, ou falhou. */
  | { tipo: "falhou"; userId: string; erro: string };

export interface MensagemPrivada {
  /** O telefone de quem escreveu, como a Z-API manda. */
  telefone: string;
  texto: string;
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
  const pessoa = await acharPessoaPeloNumero(m.telefone);

  // ── Número de fora ───────────────────────────────────────────────────
  if (!pessoa) {
    await responder(m.telefone, RECADO_PARA_DESCONHECIDO);
    return { tipo: "desconhecido" };
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
    );
    return { tipo: "sem-acesso", userId: pessoa.id };
  }

  const historico = await lerMemoria(pessoa.id, agora);

  if (passouDoTeto(historico)) {
    await responder(
      m.telefone,
      "Você fez muitas perguntas seguidas. Me dá um tempo e volta daqui a pouco.",
    );
    return { tipo: "teto", userId: pessoa.id };
  }

  const r = await responderComoPessoa(pessoa, m.texto, historico);

  if (r.erro !== undefined || r.resposta === undefined) {
    const erro = r.erro ?? "não veio resposta.";
    await responder(m.telefone, `Não consegui responder agora: ${erro}`);
    return { tipo: "falhou", userId: pessoa.id, erro };
  }
  const resposta = r.resposta;

  // ── A resposta ───────────────────────────────────────────────────────
  //
  // Quando a IA propõe mexer em alguma coisa, ela DIZ o que faria e manda
  // abrir o sistema. Executar daqui ainda não existe — ver a parte 2.
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
        "\n\nIsso eu ainda não faço por aqui. Abre o Legacy OS pra executar."
      : "");

  await responder(m.telefone, texto);

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
async function responder(telefone: string, texto: string): Promise<void> {
  try {
    await enviarTexto(telefone, texto);
  } catch {
    // Silêncio de propósito — ver acima.
  }
}
