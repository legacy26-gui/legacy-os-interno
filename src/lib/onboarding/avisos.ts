import "server-only";

import { prisma } from "@/lib/prisma";
import { ehAndrielli } from "@/lib/permissions";
import { diaDaCasaComoData } from "@/lib/dia-da-casa";
import { TOTAL_DE_ETAPAS } from "@/lib/etapas-implantacao";
import { enviarTexto } from "@/lib/whatsapp/zapi";
import { anotar } from "@/lib/whatsapp/trilha";

// Os avisos do ONBOARDING (cliente novo que respondeu o formulário):
//
//   1. Chegou um formulário respondido → mensagem no WhatsApp do dono e da Andrielli, na hora.
//   2. O onboarding tem prazo de 7 DIAS, contados do dia em que o formulário chegou. Todo dia (8h30, junto da rotina das tarefas)
//      o robô avisa os dois enquanto o onboarding estiver aberto e NADA estiver andando (nenhuma etapa marcada nas últimas 24h),
//      e SEMPRE depois que o prazo estoura — mesmo com coisa andando, porque atrasado é atrasado.
//   3. Terminou (a ficha vai pra "Concluídos", com "Campanha no ar") ou foi concluída à mão: os avisos param.
//
// Cada mensagem sai uma vez por pessoa/dia/ficha (tabela de avisos de tarefa, tipo "onboarding:…"), e falha de envio libera a
// próxima passada. Todo texto é montado em código, com os números reais da ficha.

export const PRAZO_DO_ONBOARDING_DIAS = 7;
const DIA = 86_400_000;
const soDigitos = (s: string) => s.replace(/\D/g, "");
const dd = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const primeiroNome = (n: string) => n.trim().split(/\s+/)[0];

export interface SituacaoDoOnboarding {
  /** Qual dia do prazo é hoje (1 = o dia em que chegou). */
  dia: number;
  /** O último dia do prazo (data). */
  prazo: Date;
  /** Dias que faltam (0 = hoje é o último). Negativo = já passou. */
  restam: number;
  atrasado: boolean;
  diasAtrasado: number;
  etapasFeitas: number;
  /** Nenhuma etapa marcada nas últimas 24 horas. */
  semAvanco: boolean;
  /** Há quantos dias não se marca nada (desde a última etapa, ou desde a chegada). */
  diasParado: number;
}

/** A situação de um onboarding aberto. Pura. */
export function situacaoDoOnboarding(o: { createdAt: Date; etapasFeitas: number; ultimaEtapaEm: Date | null }, agora: Date): SituacaoDoOnboarding {
  const hoje = diaDaCasaComoData(agora).getTime();
  const chegou = diaDaCasaComoData(o.createdAt).getTime();
  const decorridos = Math.max(0, Math.round((hoje - chegou) / DIA));
  const prazo = new Date(chegou + (PRAZO_DO_ONBOARDING_DIAS - 1) * DIA);
  const restam = PRAZO_DO_ONBOARDING_DIAS - 1 - decorridos;
  const ref = o.ultimaEtapaEm ?? o.createdAt;
  return {
    dia: decorridos + 1,
    prazo,
    restam,
    atrasado: restam < 0,
    diasAtrasado: Math.max(0, -restam),
    etapasFeitas: o.etapasFeitas,
    semAvanco: agora.getTime() - (o.ultimaEtapaEm ?? new Date(0)).getTime() > DIA,
    diasParado: Math.max(0, Math.floor((agora.getTime() - ref.getTime()) / DIA)),
  };
}

/** O texto do aviso diário de um onboarding. Pura. */
export function textoDoAvisoDiario(empresa: string, s: SituacaoDoOnboarding): string {
  const andamento = `${s.etapasFeitas} de ${TOTAL_DE_ETAPAS} etapas feitas`;
  const parado = s.semAvanco ? (s.diasParado >= 1 ? `Nada foi marcado há ${s.diasParado} ${s.diasParado === 1 ? "dia" : "dias"}.` : "Nada foi marcado nas últimas 24 horas.") : "Tem coisa andando, mas o prazo estourou.";
  if (s.atrasado) {
    return `🚨 *Onboarding ATRASADO — ${empresa}*\nO prazo de ${PRAZO_DO_ONBOARDING_DIAS} dias acabou em ${dd(s.prazo)} (há ${s.diasAtrasado} ${s.diasAtrasado === 1 ? "dia" : "dias"}). ${andamento}. ${parado}\n\nPrecisa fechar hoje: Formulários → ${empresa}.`;
  }
  const quando = s.restam === 0 ? "O prazo acaba *HOJE*" : `Faltam *${s.restam} ${s.restam === 1 ? "dia" : "dias"}* (prazo até ${dd(s.prazo)})`;
  return `⚠️ *Onboarding sem andamento — ${empresa}*\nDia ${s.dia} de ${PRAZO_DO_ONBOARDING_DIAS}. ${andamento}. ${parado}\n${quando}.\n\nBora tocar: Formulários → ${empresa}.`;
}

/** Quem recebe: o dono (ADMIN) e a Andrielli, com WhatsApp cadastrado. */
async function destinatarios(): Promise<{ id: string; name: string; whatsapp: string }[]> {
  const gente = await prisma.user.findMany({ where: { active: true, whatsapp: { not: null } }, select: { id: true, name: true, email: true, role: true, whatsapp: true } });
  return gente
    .filter((g) => (g.role === "ADMIN" || ehAndrielli(g.email)) && g.whatsapp && soDigitos(g.whatsapp).length >= 10)
    .map((g) => ({ id: g.id, name: g.name, whatsapp: soDigitos(g.whatsapp!) }));
}

async function reservar(userId: string, dia: Date, tipo: string): Promise<boolean> {
  try {
    await prisma.avisoDeTarefaEnviado.create({ data: { userId, dia, tipo } });
    return true;
  } catch {
    return false;
  }
}

async function mandar(userId: string, dia: Date, tipo: string, telefone: string, texto: string): Promise<boolean> {
  if (!(await reservar(userId, dia, tipo))) return false;
  try {
    const r = await enviarTexto(telefone, texto);
    if (r.ok) return true;
  } catch {
    /* cai no desfazer */
  }
  await prisma.avisoDeTarefaEnviado.deleteMany({ where: { userId, dia, tipo } });
  return false;
}

/** Chegou um formulário: avisa o dono e a Andrielli. Nunca estoura (o envio do formulário não pode falhar por causa do aviso). */
export async function avisarFormularioRecebido(onboardingId: string, agora: Date = new Date()): Promise<{ avisados: string[] }> {
  try {
    const o = await prisma.clientOnboarding.findUnique({ where: { id: onboardingId }, select: { id: true, companyName: true, contactName: true, phone: true, city: true, createdAt: true } });
    if (!o) return { avisados: [] };
    const hoje = diaDaCasaComoData(agora);
    const s = situacaoDoOnboarding({ createdAt: o.createdAt, etapasFeitas: 0, ultimaEtapaEm: null }, agora);
    const texto =
      `📝 *Formulário respondido!*\n*${o.companyName}* — ${o.contactName}${o.city ? ` (${o.city})` : ""}${o.phone ? `\n📞 ${o.phone}` : ""}\n\n` +
      `O onboarding precisa ficar pronto em até *${PRAZO_DO_ONBOARDING_DIAS} dias* (até ${dd(s.prazo)}). Abre em Formulários pra começar. Eu aviso todo dia se não estiver andando.`;
    const avisados: string[] = [];
    for (const d of await destinatarios()) {
      if (await mandar(d.id, hoje, `form-novo:${o.id}`, d.whatsapp, texto)) avisados.push(primeiroNome(d.name));
    }
    await anotar(null, "onboarding", "formulario-avisado", `${o.companyName} → ${avisados.join(", ") || "ninguém"}`);
    return { avisados };
  } catch (e) {
    console.error("[onboarding] aviso do formulário falhou:", e instanceof Error ? e.message : e);
    return { avisados: [] };
  }
}

export interface ResultadoDosAvisosDeOnboarding {
  abertos: number;
  enviados: string[];
}

/**
 * Todo dia: os onboardings abertos que estão parados (ou atrasados) viram um aviso pro dono e pra Andrielli. Um onboarding com
 * etapa marcada nas últimas 24h e dentro do prazo fica quieto.
 */
export async function avisarOnboardingsDoDia(agora: Date = new Date()): Promise<ResultadoDosAvisosDeOnboarding> {
  const hoje = diaDaCasaComoData(agora);
  const abertos = await prisma.clientOnboarding.findMany({
    where: { status: { not: "CONCLUIDO" } },
    select: { id: true, companyName: true, createdAt: true, etapas: { select: { concluidoEm: true } } },
    orderBy: { createdAt: "asc" },
  });
  const dests = await destinatarios();
  const enviados: string[] = [];
  for (const o of abertos) {
    const ultima = o.etapas.reduce<Date | null>((m, e) => (!m || e.concluidoEm > m ? e.concluidoEm : m), null);
    const s = situacaoDoOnboarding({ createdAt: o.createdAt, etapasFeitas: o.etapas.length, ultimaEtapaEm: ultima }, agora);
    if (!s.atrasado && !s.semAvanco) continue;
    const texto = textoDoAvisoDiario(o.companyName, s);
    for (const d of dests) {
      if (await mandar(d.id, hoje, `onboarding:${o.id}`, d.whatsapp, texto)) enviados.push(`${o.companyName}→${primeiroNome(d.name)}`);
    }
  }
  return { abertos: abertos.length, enviados };
}
