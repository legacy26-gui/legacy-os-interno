import "server-only";

import { prisma } from "@/lib/prisma";
import { enviarTexto } from "./zapi";
import { anotar } from "./trilha";
import type { AcaoDeAviso } from "./pausar-no-privado";

// "Envie um aviso à Tatiana, à Giovana e à Andrielli": o dono manda um recado pelo robô, no WhatsApp de cada uma.
//
// ── As travas ───────────────────────────────────────────────────────────
//
//   1. SÓ o dono (ADMIN). Quem chama confere; esta função confere de novo.
//   2. SÓ gente da casa: usuário ativo do sistema com WhatsApp cadastrado. Nunca um número digitado na conversa, nunca
//      cliente, nunca grupo de loja.
//   3. O robô mostra o texto EXATO e quem vai receber, e só manda depois de um "sim" (a mesma confirmação da pausa:
//      vale 10 minutos, só uma vez). Mensagem pra outras pessoas não se desfaz.
//   4. O texto é o que o dono escreveu — o robô não inventa recado. Sem texto dito, só o aviso de teste padrão, e só
//      quando a frase diz "teste". Do contrário, ele pergunta qual é o recado.
//   5. O recado sai com o nome de quem mandou, pra quem recebe saber de quem é.
//   6. Quem não tem WhatsApp cadastrado é dito na confirmação (e de novo no resultado), nunca pulado em silêncio.
//
// Antes disto o Copiloto respondia "Aviso de teste para a Tatiana…" como se tivesse mandado. Não mandava nada.

export interface Remetente {
  id: string;
  name: string;
  role: string;
}

const MAX_DESTINATARIOS = 12;
const MAX_TEXTO = 800;

export const TEXTO_DO_TESTE = "Oi! Este é um teste do sistema de avisos do Legacy OS. Se você recebeu, está tudo certo — não precisa responder.";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const normal = (s: string) => semAcento(s).toLowerCase();
const soDigitos = (s: string) => s.replace(/\D/g, "");
const primeiroNome = (n: string) => n.trim().split(/\s+/)[0];

/** A frase pede pra mandar um aviso/recado/mensagem pra alguém? (Ainda não diz pra QUEM.) Pura. */
export function pedeAvisarEquipe(texto: string): boolean {
  const t = normal(texto).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return false;
  const verbo = /\b(envi\w*|mand\w*|avis\w*|encaminh\w*|pass\w*|dig\w*|fal\w*)\b/.test(t);
  const objeto = /\b(avisos?|recados?|mensagem|mensagens|notificac\w*)\b/.test(t);
  const avisa = /\b(avisa|avise|avisar|avisem|avisando)\b/.test(t);
  // "avisa a Tatiana que…" vale sem a palavra "aviso"; "envie um aviso às…" vale com ela.
  return (verbo && objeto) || avisa;
}

/** A resposta curta que confirma o envio: "sim", "pode", "manda", "envie no número delas". Pura. */
export function confirmaAviso(texto: string): "sim" | "nao" | null {
  const t = normal(texto).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.length > 40) return null;
  if (/^(nao|n|cancela|cancelar|deixa|deixa pra la|esquece|nao quero|nao manda|nao envia|nao envie|nao mande)$/.test(t)) return "nao";
  if (/^(sim|s|ok|okay|pode|pode sim|pode ser|pode mandar|pode enviar|confirmo|confirma|isso|isso mesmo|manda|mande|manda ver|vai|envia|envie|enviar|mandar|positivo|claro)( (agora|sim|pode|ai|ae|no numero delas?|no numero deles?|nos numeros delas?|pra elas?|para elas?|pra eles?|para eles?|pra todas?|pra todos?))*$/.test(t)) {
    return "sim";
  }
  return null;
}

interface Pessoa {
  id: string;
  name: string;
  role: string;
  whatsapp: string | null;
}

/**
 * Quem a frase cita. Nome completo vale primeiro; senão o primeiro nome, inteiro (não pedaço de palavra). Primeiro nome
 * que bate com mais de uma pessoa é AMBÍGUO: o robô pergunta em vez de escolher. "A equipe"/"todas as gestoras" vale pra
 * gestoras e gerência (nunca o dono, que é quem manda). Pura (recebe a lista de gente).
 */
export function acharDestinatarios(
  texto: string,
  gente: Pessoa[],
  remetenteId: string,
): { achados: Pessoa[]; ambiguos: { nome: string; opcoes: Pessoa[] }[] } {
  const t = ` ${normal(texto).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ")} `;
  const outros = gente.filter((p) => p.id !== remetenteId);
  const achados = new Map<string, Pessoa>();
  const ambiguos: { nome: string; opcoes: Pessoa[] }[] = [];

  // Nome completo primeiro.
  for (const p of outros) {
    const cheio = normal(p.name).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (cheio.includes(" ") && t.includes(` ${cheio} `)) achados.set(p.id, p);
  }
  // Depois o primeiro nome, inteiro.
  const porPrimeiro = new Map<string, Pessoa[]>();
  for (const p of outros) {
    const n = normal(primeiroNome(p.name)).replace(/[^a-z0-9]/g, "");
    if (n.length < 3) continue;
    porPrimeiro.set(n, [...(porPrimeiro.get(n) ?? []), p]);
  }
  for (const [n, pessoas] of porPrimeiro) {
    if (!t.includes(` ${n} `)) continue;
    if (pessoas.some((p) => achados.has(p.id))) continue; // já veio pelo nome completo
    if (pessoas.length === 1) achados.set(pessoas[0].id, pessoas[0]);
    else ambiguos.push({ nome: n, opcoes: pessoas });
  }
  // A equipe toda.
  if (/\b(equipe|time|todo mundo|todos|todas|gestoras?|gestores?)\b/.test(t) && !/\b(todos os carros|todas as lojas)\b/.test(t)) {
    for (const p of outros) if (p.role !== "ADMIN") achados.set(p.id, p);
  }
  return { achados: [...achados.values()], ambiguos };
}

/** O recado que a pessoa escreveu: entre aspas, depois de ":" ou de "dizendo que…". `null` = a frase não traz o texto. Pura. */
export function extrairRecado(texto: string): string | null {
  const t = texto.trim();
  const aspas = t.match(/["“”«]([^"“”»]{3,})["“”»]/);
  if (aspas) return aspas[1].trim();
  const doisPontos = t.match(/:\s*([\s\S]{3,})$/);
  if (doisPontos) return doisPontos[1].trim();
  // "avisa a Tatiana que a reunião mudou", "diga pra Giovana que…": o que vem depois de "que".
  const normalizado = semAcento(t);
  const m = normalizado.match(/\b(dizendo|falando|avisando|informando|perguntando|pedindo|lembrando)\b( que| pra| para| de)?\s+/i) ?? normalizado.match(/\bque\s+/i);
  if (m && m.index !== undefined && normalizado.length === t.length) {
    const resto = t.slice(m.index + m[0].length).trim();
    if (resto.length >= 3) return resto;
  }
  return null;
}

/** "como um teste", "de teste", "só um teste". Pura. */
export const ehTeste = (texto: string) => /\btest(e|ando)\b/.test(normal(texto));

export interface AvisoMontado {
  resposta: string;
  pendente: AcaoDeAviso | null;
}

/**
 * Entende o pedido e monta a confirmação. `null` = não é um pedido de aviso pra alguém da casa (segue o fluxo normal).
 */
export async function montarAvisoParaEquipe(pessoa: Remetente, texto: string): Promise<AvisoMontado | null> {
  if (pessoa.role !== "ADMIN") return null;
  if (!pedeAvisarEquipe(texto)) return null;

  const gente = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true, whatsapp: true } });
  const { achados, ambiguos } = acharDestinatarios(texto, gente, pessoa.id);
  if (achados.length === 0 && ambiguos.length === 0) return null; // não citou ninguém da casa: não é pra mim

  if (ambiguos.length > 0) {
    const a = ambiguos[0];
    return {
      resposta: `Tem mais de uma ${a.nome.charAt(0).toUpperCase() + a.nome.slice(1)} no sistema: ${a.opcoes.map((o) => o.name).join(", ")}. Me diz o nome completo e eu monto o aviso.`,
      pendente: null,
    };
  }
  if (achados.length > MAX_DESTINATARIOS) {
    return { resposta: `Isso daria ${achados.length} pessoas. Eu mando pra no máximo ${MAX_DESTINATARIOS} de uma vez; me diz quem.`, pendente: null };
  }

  let recado = extrairRecado(texto);
  if (!recado && ehTeste(texto)) recado = TEXTO_DO_TESTE;
  if (!recado) {
    return {
      resposta: `Pra ${achados.map((p) => primeiroNome(p.name)).join(", ")}: qual é o recado? Escreve assim: *avisa a ${primeiroNome(achados[0].name)}: a reunião mudou pra 15h*.`,
      pendente: null,
    };
  }
  recado = recado.slice(0, MAX_TEXTO);

  const comNumero = achados.filter((p) => p.whatsapp && soDigitos(p.whatsapp).length >= 10);
  const semNumero = achados.filter((p) => !comNumero.includes(p));
  if (comNumero.length === 0) {
    return {
      resposta:
        `Nenhuma dessas pessoas tem WhatsApp cadastrado no sistema (${semNumero.map((p) => primeiroNome(p.name)).join(", ")}), então não tenho pra onde mandar. ` +
        "Cadastra o número no cadastro de cada uma e me pede de novo.",
      pendente: null,
    };
  }

  const linhas = [
    "📣 Vou mandar este recado, agora, pelo WhatsApp:",
    "",
    `“${recado}”`,
    "",
    "Pra:",
    ...comNumero.map((p) => `• ${primeiroNome(p.name)}`),
    ...semNumero.map((p) => `• ${primeiroNome(p.name)} — ⚠️ sem WhatsApp cadastrado, essa eu não consigo mandar`),
    "",
    `Vai com o seu nome (“Recado do ${primeiroNome(pessoa.name)}”). Mando? Responde *sim* ou *não*.`,
  ];
  return {
    resposta: linhas.join("\n"),
    pendente: {
      tipo: "avisar-equipe",
      destinatarios: comNumero.map((p) => ({ id: p.id, nome: p.name, telefone: soDigitos(p.whatsapp!) })),
      semNumero: semNumero.map((p) => p.name),
      texto: recado,
      pedido: texto.slice(0, 300),
    },
  };
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Manda o recado (depois do "sim") e diz quem recebeu e quem não. */
export async function executarAviso(
  pessoa: Remetente,
  acao: AcaoDeAviso,
  messageId?: string | null,
): Promise<{ resposta: string; enviados: number; falhas: number }> {
  if (pessoa.role !== "ADMIN") return { resposta: "Só o dono manda recado pelo robô.", enviados: 0, falhas: 0 };

  const mensagem = `*Recado do ${primeiroNome(pessoa.name)}:*\n${acao.texto}`;
  const ok: string[] = [];
  const falhou: { nome: string; erro: string }[] = [];
  for (const d of acao.destinatarios) {
    try {
      const r = await enviarTexto(d.telefone, mensagem);
      if (r.ok) ok.push(primeiroNome(d.nome));
      else falhou.push({ nome: primeiroNome(d.nome), erro: r.erro ?? "o WhatsApp não aceitou" });
    } catch (e) {
      falhou.push({ nome: primeiroNome(d.nome), erro: e instanceof Error ? e.message.slice(0, 80) : "erro" });
    }
    await esperar(400);
  }
  await anotar(messageId, `privado aviso`, "aviso-equipe", `${ok.length} enviados · ${falhou.length} falhas · de ${primeiroNome(pessoa.name)}`);

  const partes: string[] = [];
  if (ok.length) partes.push(`✅ Mandei pra ${ok.join(", ")}.`);
  if (falhou.length) partes.push(`❌ Não consegui mandar pra ${falhou.map((f) => `${f.nome} (${f.erro})`).join(", ")}.`);
  if (acao.semNumero.length) partes.push(`⚠️ Sem WhatsApp cadastrado, não mandei pra ${acao.semNumero.map(primeiroNome).join(", ")}.`);
  return { resposta: partes.join("\n"), enviados: ok.length, falhas: falhou.length };
}
