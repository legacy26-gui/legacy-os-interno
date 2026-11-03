// Como ler a última visita: há quantos dias foi, e quando isso vira aviso.
//
// Sem "server-only": o botão roda no navegador e precisa do mesmo cálculo que
// a tela do servidor, pra não aparecer "há 30 dias" num lugar e "há 31" no
// outro.
//
// Os prazos abaixo são um chute razoável pra visita de loja, não uma regra que
// o Guilherme tenha pedido. Mudar é trocar os dois números daqui.
export const DIAS_PARA_ATENCAO = 30;
export const DIAS_PARA_URGENTE = 60;

export type TomDaVisita = "nunca" | "recente" | "atencao" | "urgente";

export interface EstadoDaVisita {
  dias: number | null;
  texto: string;
  tom: TomDaVisita;
}

/** Dias cheios entre a visita e hoje, contados por data e não por hora. */
export function diasDesde(iso: string | null | undefined, hoje: Date = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const visita = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const agora = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.max(0, Math.round((agora - visita) / 86_400_000));
}

export function estadoDaVisita(iso: string | null | undefined, hoje: Date = new Date()): EstadoDaVisita {
  const dias = diasDesde(iso, hoje);

  if (dias === null) {
    // Vazio não quer dizer "nunca foi" — quer dizer que ninguém marcou.
    return { dias: null, texto: "Sem visita registrada", tom: "nunca" };
  }
  if (dias === 0) return { dias, texto: "Hoje", tom: "recente" };
  if (dias === 1) return { dias, texto: "Ontem", tom: "recente" };

  const texto = `há ${dias} dias`;
  if (dias >= DIAS_PARA_URGENTE) return { dias, texto, tom: "urgente" };
  if (dias >= DIAS_PARA_ATENCAO) return { dias, texto, tom: "atencao" };
  return { dias, texto, tom: "recente" };
}

export const COR_DA_VISITA: Record<TomDaVisita, string> = {
  nunca: "text-foreground-muted",
  recente: "text-emerald-500",
  atencao: "text-amber-500",
  urgente: "text-red-500",
};
