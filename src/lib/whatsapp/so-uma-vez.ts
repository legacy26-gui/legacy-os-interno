import "server-only";

import { prisma } from "@/lib/prisma";

// "Esta mensagem já foi atendida?"
//
// ── O defeito que isto conserta ──────────────────────────────────────────
//
// A Z-API REENVIA o webhook quando não recebe resposta rápido. E atender uma
// pergunta da IA leva dezenas de segundos: são duas chamadas ao modelo, e só
// depois a rota responde. A Z-API desiste de esperar e manda de novo.
//
// No privado, o sintoma é a pessoa recebendo a mesma resposta duas vezes —
// chato, e o dobro do custo de IA. No GRUPO é mais sério: o mesmo pedido de
// "pode tirar o Compass" seria atendido duas vezes, e a segunda tentaria
// desligar um anúncio que já saiu do ar.
//
// ── Por que o banco decide, e não o código ───────────────────────────────
//
// Porque as duas chegadas podem ser simultâneas. Um "já vi esta?" seguido de
// "então marca" tem uma fresta entre as duas linhas, e é exatamente nessa
// fresta que as duas passam. Criar a linha É a pergunta: quem conseguir
// criar, atende; quem esbarrar na chave primária, vai embora.
//
// ── Por que não guarda pra sempre ────────────────────────────────────────
//
// Porque a janela de reenvio da Z-API é de minutos, não de meses. Guardar um
// id por mensagem para sempre seria uma tabela que só cresce pra responder
// uma pergunta sobre os últimos cinco minutos.

/** Depois disto, o id não serve mais pra nada e pode sumir. */
const GUARDA_POR_DIAS = 2;

/** De quantas em quantas limpezas uma acontece de verdade. */
const CHANCE_DE_LIMPAR = 0.02;

/**
 * Tenta tomar posse da mensagem.
 *
 * Devolve `true` pra quem chegou primeiro — e só pra ele. Quem chegar depois
 * recebe `false` e deve ir embora sem atender.
 *
 * Sem id (a Z-API não mandou, ou mandou vazio) devolve `true`: é melhor
 * atender uma mensagem duas vezes do que deixar de atender todas elas. A
 * trava protege do reenvio, não da ausência de identificação.
 */
export async function primeiraVez(messageId: unknown): Promise<boolean> {
  const id = typeof messageId === "string" ? messageId.trim() : "";
  if (!id) return true;

  try {
    await prisma.mensagemTratada.create({ data: { messageId: id.slice(0, 200) } });
  } catch {
    // Chave primária repetida: alguém já pegou esta. Qualquer outra falha de
    // banco cai aqui também, e o lado seguro de errar é NÃO atender: uma
    // resposta a menos é um incômodo, uma ação repetida na Meta é um estrago.
    return false;
  }

  limparVelhas();
  return true;
}

/**
 * Apaga os ids que já não servem.
 *
 * De vez em quando, e sem esperar: isto não é trabalho do atendimento, e uma
 * limpeza que falhe não pode atrasar nem derrubar a resposta de ninguém.
 */
function limparVelhas() {
  if (Math.random() > CHANCE_DE_LIMPAR) return;
  const limite = new Date(Date.now() - GUARDA_POR_DIAS * 24 * 60 * 60 * 1000);
  void prisma.mensagemTratada
    .deleteMany({ where: { criadoEm: { lt: limite } } })
    .catch(() => {
      // Tabela de ids velhos é problema de ninguém. Fica pra próxima.
    });
}
