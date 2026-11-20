import "server-only";

import { prisma } from "@/lib/prisma";
import { avisarPessoas } from "@/lib/push";
import { veTodasAsEmpresas } from "@/lib/empresa";
import { conferirConexao, zapiConfigurado } from "./zapi";

// O vigia do número do robô.
//
// ── O problema ───────────────────────────────────────────────────────────
//
// A Z-API conecta um celular comum pelo mesmo caminho do WhatsApp Web. Se o celular
// fica sem bateria, sem internet ou a sessão expira, o número CAI — e o sistema não
// percebe: relatórios de segunda não saem, os avisos dos gestores não chegam, o robô
// não pausa carro vendido. O primeiro a saber seria um cliente reclamando.
//
// ── Como o vigia sabe ────────────────────────────────────────────────────
//
// Duas fontes, porque nenhuma basta sozinha:
//
//   1. A própria Z-API avisa ("Ao desconectar" / "Ao conectar", no mesmo endereço do
//      webhook). É imediato — quando está configurado e quando chega.
//   2. A varredura de 15 em 15 minutos pergunta à Z-API se está conectado. É a rede
//      de segurança: pega a queda mesmo sem o aviso dela.
//
// Uma conferência que falha não é queda: a Z-API às vezes demora a responder. Só a
// SEGUNDA seguida vira aviso (até 30 minutos). O aviso da própria Z-API vale na hora.
//
// ── Pra quem vai, e como ─────────────────────────────────────────────────
//
// Notificação no celular (push do app) pro dono da casa. NÃO pelo WhatsApp — é ele
// que caiu. E um alerta no sininho do sistema enquanto estiver fora (calcular.ts).
// Avisa quando cai e quando volta; no meio, silêncio.

const FALHAS_PARA_AVISAR = 2;

export type MudancaDeConexao = "caiu" | "voltou" | "nada";

async function donosDaCasa(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true, empresas: true },
  });
  return admins.filter((a) => veTodasAsEmpresas(a.empresas)).map((a) => a.id);
}

function haQuanto(desde: Date, agora: Date): string {
  const min = Math.max(1, Math.round((agora.getTime() - desde.getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h${String(min % 60).padStart(2, "0")}` : `${Math.floor(h / 24)} dia(s)`;
}

/**
 * Registra o que se sabe da conexão e avisa SE mudou.
 * `origem` "zapi" é o aviso da própria Z-API (vale na hora); "conferencia" é a
 * pergunta da varredura (desconectado só conta na segunda seguida).
 */
export async function registrarConexao(
  conectado: boolean,
  origem: "zapi" | "conferencia",
  erro: string | null = null,
  agora: Date = new Date(),
): Promise<MudancaDeConexao> {
  const atual = await prisma.conexaoDoWhatsapp.upsert({
    where: { id: "zapi" },
    create: { id: "zapi", conectado: true, desde: agora, conferidoEm: agora },
    update: {},
  });

  if (conectado) {
    await prisma.conexaoDoWhatsapp.update({
      where: { id: "zapi" },
      data: { conferidoEm: agora, falhasSeguidas: 0, ultimoErro: null, ...(atual.conectado ? {} : { conectado: true, desde: agora }) },
    });
    if (atual.conectado) return "nada";
    const ids = await donosDaCasa();
    await avisarPessoas(ids, {
      titulo: "WhatsApp do robô voltou",
      corpo: `Conectado de novo depois de ${haQuanto(atual.desde, agora)} fora. Relatórios, avisos e pausas voltaram a funcionar.`,
      url: "/configuracoes/whatsapp",
      tag: "whatsapp-conexao",
    });
    return "voltou";
  }

  const falhas = atual.falhasSeguidas + 1;
  const confirmado = origem === "zapi" || falhas >= FALHAS_PARA_AVISAR;
  await prisma.conexaoDoWhatsapp.update({
    where: { id: "zapi" },
    data: {
      conferidoEm: agora,
      falhasSeguidas: falhas,
      ultimoErro: erro?.slice(0, 300) ?? null,
      ...(confirmado && atual.conectado ? { conectado: false, desde: agora } : {}),
    },
  });
  if (!confirmado || !atual.conectado) return "nada";

  const ids = await donosDaCasa();
  await avisarPessoas(ids, {
    titulo: "WhatsApp do robô desconectou",
    corpo:
      "Relatórios, avisos e pausas pelo WhatsApp estão parados. Abra a Z-API e leia o QR Code com o celular do robô." +
      (erro ? ` (${erro.slice(0, 80)})` : ""),
    url: "/configuracoes/whatsapp",
    tag: "whatsapp-conexao",
  });
  return "caiu";
}

/** A conferência da varredura. Sem Z-API configurada, não há o que vigiar. */
export async function conferirEAvisar(agora: Date = new Date()): Promise<MudancaDeConexao> {
  if (!zapiConfigurado()) return "nada";
  const r = await conferirConexao();
  return registrarConexao(r.conectado, "conferencia", r.erro, agora);
}

/** Pro alerta do sininho: fora desde quando, ou `null` se está conectado. */
export async function whatsappForaDesde(): Promise<{ desde: Date; erro: string | null } | null> {
  const c = await prisma.conexaoDoWhatsapp.findUnique({ where: { id: "zapi" } });
  if (!c || c.conectado) return null;
  return { desde: c.desde, erro: c.ultimoErro };
}
