import "server-only";

import { prisma } from "@/lib/prisma";
import { diaDaCasaComoData } from "@/lib/dia-da-casa";
import { ehAndrielli } from "@/lib/permissions";
import { enviarTexto } from "@/lib/whatsapp/zapi";
import { falarDoPrazo } from "./regras";
import { listaDoDia, textoDaLista, type ItemDaLista } from "./dados";

// O robô das tarefas, duas vezes por dia (ver vercel.json e /api/tarefas/rodar):
//
//   manhã (8h30)  → cada pessoa recebe a lista do DIA dela, se tiver alguma coisa aberta. Nada pra fazer = nada de mensagem.
//   tarde (17h)   → cada pessoa com tarefa ainda aberta recebe "está feito?" com a lista e o jeito de dar baixa
//                   ("feito 2"). Quem tem tarefa ATRASADA (prazo que passou) vê isso na lista, e o dono e a Andrielli
//                   recebem uma mensagem só com o quadro das atrasadas da equipe.
//
// Cada aviso é reservado na tabela antes de sair (pessoa + dia + tipo): chamar a rota dez vezes manda um. Se o WhatsApp
// falhar, a reserva é desfeita e a próxima passada tenta de novo. Domingo não manda nada. Fora da janela de cada hora
// (manhã 7h–12h, tarde 15h–20h) também não: ninguém quer a lista às 3h.

export type Hora = "manha" | "tarde";

export interface ResultadoDaRotina {
  hora: Hora;
  avisos: string[];
  atrasadasPara: string[];
  pulou?: "fora-do-horario" | "domingo";
}

const primeiroNome = (n: string) => n.trim().split(/\s+/)[0];
const soDigitos = (s: string) => s.replace(/\D/g, "");

async function reservar(userId: string, dia: Date, tipo: string): Promise<boolean> {
  try {
    await prisma.avisoDeTarefaEnviado.create({ data: { userId, dia, tipo } });
    return true;
  } catch {
    return false; // já foi
  }
}

async function mandar(userId: string, dia: Date, tipo: string, telefone: string, texto: string): Promise<boolean> {
  if (!(await reservar(userId, dia, tipo))) return false;
  try {
    const r = await enviarTexto(soDigitos(telefone), texto);
    if (r.ok) return true;
  } catch {
    /* cai no desfazer */
  }
  await prisma.avisoDeTarefaEnviado.deleteMany({ where: { userId, dia, tipo } });
  return false;
}

/** A mensagem da manhã de uma pessoa, ou null se ela não tem nada aberto hoje. */
export function mensagemDaManha(nome: string, itens: ItemDaLista[], hoje: Date, extras?: string | null): string | null {
  const abertas = itens.filter((i) => !i.feita);
  if (abertas.length === 0 && !extras) return null;
  const partes = [`☀️ *Bom dia, ${primeiroNome(nome)}!*`];
  if (abertas.length > 0) {
    partes.push(`\n📋 *Suas tarefas de hoje:*\n${textoDaLista(itens, hoje)}`, `\nQuando terminar, responde *feito 1* (ou *feito 1 e 3*, *feito tudo*).`);
  }
  if (extras) partes.push(`\n${extras}`);
  return partes.join("\n");
}

/** A pergunta das 17h, ou null se está tudo feito. */
export function mensagemDaTarde(nome: string, itens: ItemDaLista[], hoje: Date): string | null {
  const abertas = itens.filter((i) => !i.feita);
  if (abertas.length === 0) return null;
  return (
    `🕔 *${primeiroNome(nome)}, como estão as tarefas de hoje?*\n\n${textoDaLista(itens, hoje)}\n\n` +
    `Ainda ${abertas.length === 1 ? "falta 1" : `faltam ${abertas.length}`}. Responde *feito 2* (ou *feito 1 e 3*, *feito tudo*) pra dar baixa. ` +
    `O que não der pra hoje fica na lista de amanhã.`
  );
}

/** O quadro das atrasadas da equipe, ou null se ninguém está atrasado. */
export function mensagemDasAtrasadas(porPessoa: { nome: string; itens: ItemDaLista[] }[], hoje: Date): string | null {
  const com = porPessoa.filter((p) => p.itens.length > 0);
  if (com.length === 0) return null;
  const total = com.reduce((s, p) => s + p.itens.length, 0);
  const linhas = com.map((p) => `*${primeiroNome(p.nome)}* (${p.itens.length}):\n${p.itens.map((i) => `  • ${i.titulo}${i.prazo ? ` — era pra ${falarDoPrazo(i.prazo, hoje)}` : ""}`).join("\n")}`);
  return `⚠️ *Tarefas atrasadas da equipe* (${total})\n\n${linhas.join("\n\n")}`;
}

/** Roda a rotina de uma das horas. `extrasDaManha` deixa o resumo da gestora (Etapa 3) entrar na MESMA mensagem. */
export async function rodarRotinaDeTarefas(
  hora: Hora,
  agora: Date = new Date(),
  extrasDaManha?: (userId: string, agora: Date) => Promise<string | null>,
): Promise<ResultadoDaRotina> {
  const horaBr = Number(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }));
  const janela = hora === "manha" ? horaBr >= 7 && horaBr < 12 : horaBr >= 15 && horaBr < 20;
  if (!janela) return { hora, avisos: [], atrasadasPara: [], pulou: "fora-do-horario" };
  const hoje = diaDaCasaComoData(agora);
  if (hoje.getUTCDay() === 0) return { hora, avisos: [], atrasadasPara: [], pulou: "domingo" };

  const gente = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true, role: true, whatsapp: true },
    orderBy: { name: "asc" },
  });
  const resultado: ResultadoDaRotina = { hora, avisos: [], atrasadasPara: [] };
  const listas = new Map<string, ItemDaLista[]>();

  for (const p of gente) {
    const itens = await listaDoDia(p.id, hoje);
    listas.set(p.id, itens);
    if (!p.whatsapp || soDigitos(p.whatsapp).length < 10) continue;
    const texto =
      hora === "manha"
        ? mensagemDaManha(p.name, itens, hoje, extrasDaManha ? await extrasDaManha(p.id, agora).catch(() => null) : null)
        : mensagemDaTarde(p.name, itens, hoje);
    if (texto && (await mandar(p.id, hoje, hora, p.whatsapp, texto))) resultado.avisos.push(primeiroNome(p.name));
  }

  if (hora === "tarde") {
    const quadro = gente.map((p) => ({ id: p.id, nome: p.name, itens: (listas.get(p.id) ?? []).filter((i) => i.atrasada && !i.feita) }));
    for (const dest of gente.filter((g) => (g.role === "ADMIN" || ehAndrielli(g.email)) && g.whatsapp && soDigitos(g.whatsapp).length >= 10)) {
      // O próprio destinatário já viu as dele na lista dele.
      const texto = mensagemDasAtrasadas(quadro.filter((q) => q.id !== dest.id), hoje);
      if (texto && (await mandar(dest.id, hoje, "atrasadas", dest.whatsapp!, texto))) resultado.atrasadasPara.push(primeiroNome(dest.name));
    }
  }
  return resultado;
}
