// Datas ditas em conversa ("amanhã", "sexta", "dia 25", "25/11"), no relógio de Brasília. Arquivo puro: serve ao robô
// do WhatsApp (comandos-do-dia.ts, tarefas) e aos testes.

/** Dobra acento e caixa SEM mudar o tamanho do texto (dá pra usar a posição no texto original). Pura. */
export const dobrar = (s: string) =>
  [...s.normalize("NFC")]
    .map((c) => (c.length === 1 ? (c.normalize("NFD")[0] ?? c) : c))
    .join("")
    .toLowerCase();

export const NOMES_DOS_DIAS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

/** O dia de hoje no relógio de Brasília. */
export function diaDeBrasilia(agora: Date): { y: number; m: number; d: number; dow: number } {
  const b = new Date(agora.getTime() - 3 * 3600_000);
  return { y: b.getUTCFullYear(), m: b.getUTCMonth() + 1, d: b.getUTCDate(), dow: b.getUTCDay() };
}

export function somarDias(x: { y: number; m: number; d: number }, dias: number) {
  const n = new Date(Date.UTC(x.y, x.m - 1, x.d + dias));
  return { y: n.getUTCFullYear(), m: n.getUTCMonth() + 1, d: n.getUTCDate(), dow: n.getUTCDay() };
}

/** O dia de uma reunião marcada: "dia 25", "25/11", "amanhã", "sexta". Sempre HOJE ou DEPOIS. Pura. */
export function lerDiaFuturo(texto: string, agora: Date): { y: number; m: number; d: number; dow: number } | null {
  const t = dobrar(texto);
  const hoje = diaDeBrasilia(agora);
  if (/\bdepois de amanha\b/.test(t)) return somarDias(hoje, 2);
  if (/\bamanha\b/.test(t)) return somarDias(hoje, 1);
  if (/\bhoje\b/.test(t)) return { ...hoje };

  const dm = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (dm) {
    const d = Number(dm[1]);
    const mes = Number(dm[2]);
    if (d < 1 || d > 31 || mes < 1 || mes > 12) return null;
    let y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : hoje.y;
    let alvo = new Date(Date.UTC(y, mes - 1, d));
    if (!dm[3] && alvo.getTime() < Date.UTC(hoje.y, hoje.m - 1, hoje.d)) {
      y += 1;
      alvo = new Date(Date.UTC(y, mes - 1, d));
    }
    if (alvo.getUTCMonth() !== mes - 1) return null;
    return { y, m: mes, d, dow: alvo.getUTCDay() };
  }

  const dia = t.match(/\bdia\s+(\d{1,2})\b(?!\s*[/:])/);
  if (dia) {
    const d = Number(dia[1]);
    if (d < 1 || d > 31) return null;
    let y = hoje.y;
    let mes = hoje.m;
    if (d < hoje.d) {
      mes += 1;
      if (mes > 12) {
        mes = 1;
        y += 1;
      }
    }
    const alvo = new Date(Date.UTC(y, mes - 1, d));
    if (alvo.getUTCMonth() !== mes - 1) return null;
    return { y, m: mes, d, dow: alvo.getUTCDay() };
  }

  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${NOMES_DOS_DIAS[i]}\\b`).test(t)) {
      const avanco = ((i - hoje.dow + 7) % 7) || 7;
      return somarDias(hoje, avanco);
    }
  }
  return null;
}
