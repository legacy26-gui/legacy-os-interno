// Há quanto tempo cada loja não vende, e quando isso vira alarme.
//
// Sem "server-only": a tela do servidor e qualquer componente de navegador
// precisam do mesmo cálculo, pra não aparecer "há 7 dias" num lugar e "há 8"
// no outro.
//
// Os prazos são do Guilherme:
//   até 6 dias  → verde     (vendendo)
//   7 a 14      → amarelo   (esfriou)
//   15 a 29     → vermelho  (parou)
//   30 ou mais  → preto com alerta (abandonou)
export const DIAS_AMARELO = 7;
export const DIAS_VERMELHO = 15;
export const DIAS_PRETO = 30;

export type TomDaVenda = "verde" | "amarelo" | "vermelho" | "preto";

export interface EstadoDaVenda {
  /** Dias desde a última venda. Sem venda nenhuma, conta desde que virou cliente. */
  dias: number;
  tom: TomDaVenda;
  texto: string;
  /** Verdadeiro quando a loja nunca registrou venda — muda o texto, não a cor. */
  nuncaVendeu: boolean;
}

/** Dias cheios entre duas datas, contados por dia de calendário. */
export function diasEntre(de: Date, ate: Date): number {
  const a = Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate());
  const b = Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function tomPorDias(dias: number): TomDaVenda {
  if (dias >= DIAS_PRETO) return "preto";
  if (dias >= DIAS_VERMELHO) return "vermelho";
  if (dias >= DIAS_AMARELO) return "amarelo";
  return "verde";
}

/**
 * O estado da loja.
 *
 * `ultimaVenda` nulo = nunca vendeu. Nesse caso a conta parte de quando ela
 * virou cliente (`desde`), e não de uma data fixa: loja que entrou ontem não
 * pode nascer no vermelho por nunca ter vendido ainda.
 */
export function estadoDaVenda(
  ultimaVenda: Date | null,
  desde: Date,
  hoje: Date = new Date()
): EstadoDaVenda {
  const nuncaVendeu = ultimaVenda === null;
  const dias = diasEntre(ultimaVenda ?? desde, hoje);
  const tom = tomPorDias(dias);

  let texto: string;
  if (nuncaVendeu) texto = dias === 0 ? "Entrou hoje, sem venda" : `Sem venda desde que entrou (${dias} dias)`;
  else if (dias === 0) texto = "Vendeu hoje";
  else if (dias === 1) texto = "Vendeu ontem";
  else texto = `há ${dias} dias sem vender`;

  return { dias, tom, texto, nuncaVendeu };
}

// Cores. O preto é fundo escuro de verdade, com o aviso amarelo por cima —
// é o único estado que tem que saltar da tela de longe.
export const ESTILO_DA_LINHA: Record<TomDaVenda, string> = {
  verde: "hover:bg-surface-muted",
  amarelo: "bg-amber-500/10 hover:bg-amber-500/15",
  vermelho: "bg-red-500/10 hover:bg-red-500/15",
  // Faixa amarela na lateral além do fundo preto: no tema escuro o preto
  // sozinho fica perto demais do fundo da tabela, e essa é justamente a linha
  // que tem que saltar à vista.
  preto: "bg-zinc-950 hover:bg-black text-zinc-100 border-l-4 border-amber-400",
};

export const ESTILO_DO_SELO: Record<TomDaVenda, string> = {
  verde: "bg-emerald-500/15 text-emerald-500",
  amarelo: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  vermelho: "bg-red-500/20 text-red-500",
  preto: "bg-amber-400 text-black font-bold",
};

export const ROTULO_DO_TOM: Record<TomDaVenda, string> = {
  verde: "Vendendo",
  amarelo: "Esfriou",
  vermelho: "Parou",
  preto: "Abandonou",
};
