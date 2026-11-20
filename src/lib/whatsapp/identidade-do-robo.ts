import "server-only";

import { lidDoNumero } from "./zapi";

// Quem o robô é, além do telefone.
//
// ── Por que isto existe ──────────────────────────────────────────────────
//
// Porque o WhatsApp marca o robô de DUAS formas e o sistema só conhecia uma.
// Ver mencao.ts: num grupo a marcação vem com o telefone (12 dígitos), noutro
// vem com o "@lid" (14), e a Z-API não converte um no outro.
//
// O que ela converte é telefone → lid. Então basta perguntar uma vez, pro
// nosso próprio número, e guardar.
//
// ── Por que só quando precisa ────────────────────────────────────────────
//
// Cada pergunta é uma chamada à Z-API, e grupo de loja tem cem mensagens por
// dia sem marcar ninguém. Por isso o chamador só vem aqui quando o texto TEM
// uma marcação que não bateu com o telefone — a conversa normal não custa
// nada.
//
// ── O cache ──────────────────────────────────────────────────────────────
//
// O lid de um número não muda, então o acerto vale por horas. A falha vale
// por poucos minutos: se a Z-API estava fora do ar, não pode ficar "sem lid"
// até o servidor reiniciar — e também não pode virar uma chamada nova por
// mensagem enquanto ela está fora.
//
// Em memória, por instância do servidor: em serverless cada instância fria
// pergunta de novo, uma vez. Custa uma chamada, não justifica uma tabela.

const ACERTO_VALE_MS = 6 * 60 * 60 * 1000;
const FALHA_VALE_MS = 2 * 60 * 1000;

const guardado = new Map<string, { lid: string | null; ate: number }>();

/** O lid do número do robô, ou null se não deu pra descobrir. Nunca estoura. */
export async function lidDoRobo(numeroDoRobo: string): Promise<string | null> {
  const chave = numeroDoRobo.replace(/\D/g, "");
  if (!chave) return null;

  const visto = guardado.get(chave);
  if (visto && visto.ate > Date.now()) return visto.lid;

  try {
    const r = await lidDoNumero(chave);
    const lid = r.ok ? r.lid : null;
    guardado.set(chave, {
      lid,
      ate: Date.now() + (lid ? ACERTO_VALE_MS : FALHA_VALE_MS),
    });
    return lid;
  } catch {
    guardado.set(chave, { lid: null, ate: Date.now() + FALHA_VALE_MS });
    return null;
  }
}

/** Só pra teste: esquece o que sabia. */
export function esquecerIdentidade(): void {
  guardado.clear();
}
