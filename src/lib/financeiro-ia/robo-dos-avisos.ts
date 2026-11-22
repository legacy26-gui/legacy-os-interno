import "server-only";

import { prisma } from "@/lib/prisma";
import { diaDaCasa, ehDiaDaFoto } from "@/lib/dia-da-casa";
import { enviarTexto } from "@/lib/whatsapp/zapi";
import { textoDosAlertas, textoDosVencimentos } from "./alertas";

// O robô que manda os avisos do financeiro no grupo do dono, de manhã:
//   - todo dia: conta vencendo hoje/amanhã ou atrasada (se não houver, não manda nada);
//   - segunda: o resumo da semana (que já inclui as contas da semana — aí não manda as duas coisas).
//
// Cada aviso é "reservado" na tabela antes de sair (grupo + chave do dia/semana): chamar a rota
// dez vezes manda uma. Se o WhatsApp falhar, a reserva é desfeita e a próxima passada tenta de novo.
// Fora do horário da casa (7h às 20h) não manda nada: ninguém quer o resumo às 3h da manhã.

export interface ResultadoDosAvisos {
  grupos: number;
  enviados: string[];
  pulou?: "fora-do-horario";
}

async function reservar(grupoId: string, chave: string): Promise<boolean> {
  try {
    await prisma.avisoFinanceiroEnviado.create({ data: { grupoId, chave } });
    return true;
  } catch {
    return false; // já foi (chave repetida)
  }
}

async function mandar(grupoId: string, chave: string, texto: string): Promise<boolean> {
  if (!(await reservar(grupoId, chave))) return false;
  const r = await enviarTexto(grupoId, texto);
  if (!r.ok) {
    await prisma.avisoFinanceiroEnviado.deleteMany({ where: { grupoId, chave } });
    return false;
  }
  return true;
}

export async function rodarAvisosDoFinanceiro(agora: Date = new Date()): Promise<ResultadoDosAvisos> {
  const hora = Number(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }));
  if (hora < 7 || hora >= 20) return { grupos: 0, enviados: [], pulou: "fora-do-horario" };

  const hoje = diaDaCasa(agora);
  const grupos = await prisma.grupoFinanceiro.findMany({ select: { grupoId: true, donoId: true } });
  const enviados: string[] = [];
  for (const g of grupos) {
    if (ehDiaDaFoto(agora)) {
      // Segunda: o resumo da semana (com as contas da semana dentro).
      const texto = `☀️ *Bom dia! O financeiro da semana*\n\n${await textoDosAlertas(g.donoId, agora, { semana: true })}\n\nA qualquer hora: *alertas* mostra isto de novo.`;
      if (await mandar(g.grupoId, `semana:${hoje}`, texto)) enviados.push(`semana:${hoje}`);
      await reservar(g.grupoId, `vencimentos:${hoje}`);
      continue;
    }
    const venc = await textoDosVencimentos(agora);
    if (venc && (await mandar(g.grupoId, `vencimentos:${hoje}`, venc))) enviados.push(`vencimentos:${hoje}`);
  }
  return { grupos: grupos.length, enviados };
}
