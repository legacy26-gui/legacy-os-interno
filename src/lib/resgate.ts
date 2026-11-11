import { DIAS_VERMELHO, DIAS_CRITICO } from "@/lib/controle-vendas";

// O que fazer quando uma loja para de vender.
//
// São três motivos, e a casa trata os três: falta de vídeo novo, arte gasta e
// comercial travado. Esta é a escada do comercial — a parte que não deixa
// rastro em lugar nenhum e por isso precisava virar registro.
//
// Os prazos são do Guilherme:
//   até 14 dias .... trabalho normal, não precisa falar nada
//   15 ou mais ..... primeiro contato
//   30 ou mais ..... reunião
//
// Sem "server-only": a tela mostra o passo e o servidor confere o mesmo.

export type PassoDoComercial = "tranquilo" | "contato" | "reuniao";

export interface EscadaDoComercial {
  passo: PassoDoComercial;
  titulo: string;
  explicacao: string;
}

export function passoDoComercial(diasSemVender: number): EscadaDoComercial {
  if (diasSemVender >= DIAS_CRITICO) {
    return {
      passo: "reuniao",
      titulo: "Marcar reunião",
      explicacao: `${diasSemVender} dias sem vender. Nesse ponto não é mais ajuste: senta com o dono da loja e o Guilherme entra junto.`,
    };
  }
  if (diasSemVender >= DIAS_VERMELHO) {
    return {
      passo: "contato",
      titulo: "Fazer o primeiro contato",
      explicacao: `${diasSemVender} dias sem vender. Hora de ligar e entender o que mudou na loja antes que vire reunião.`,
    };
  }
  return {
    passo: "tranquilo",
    titulo: "Nada a fazer por enquanto",
    explicacao: `${diasSemVender} dias sem vender. Até ${DIAS_VERMELHO} dias é trabalho normal — cobrar aqui vira ruído.`,
  };
}

/** Há quantos dias foi isso. Null quando nunca aconteceu. */
export function diasDesde(quando: Date | null | undefined, hoje: Date = new Date()): number | null {
  if (!quando) return null;
  const a = Date.UTC(quando.getUTCFullYear(), quando.getUTCMonth(), quando.getUTCDate());
  const b = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * A partir de quantos dias a arte é considerada gasta.
 *
 * O Guilherme disse que não sabia como medir arte. Este número é um ponto de
 * partida, não uma verdade: 30 dias é o ciclo que a casa já usa pra tudo
 * (mensalidade, loja abandonada), então começa igual e se corrige com o uso.
 */
export const DIAS_DE_ARTE = 30;

export type EstadoDaArte = "nova" | "envelhecendo" | "gasta" | "nunca";

export function estadoDaArte(diasComAArte: number | null): EstadoDaArte {
  if (diasComAArte === null) return "nunca";
  if (diasComAArte >= DIAS_DE_ARTE) return "gasta";
  if (diasComAArte >= DIAS_DE_ARTE / 2) return "envelhecendo";
  return "nova";
}

export const ESTILO_DA_ARTE: Record<EstadoDaArte, string> = {
  nova: "bg-emerald-500/15 text-emerald-500",
  envelhecendo: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  gasta: "bg-red-500/25 text-red-400",
  nunca: "bg-surface-muted text-foreground-muted",
};

export const ROTULO_DA_ARTE: Record<EstadoDaArte, string> = {
  nova: "Arte nova",
  envelhecendo: "Começando a cansar",
  gasta: "Arte gasta",
  nunca: "Nunca renovada",
};
