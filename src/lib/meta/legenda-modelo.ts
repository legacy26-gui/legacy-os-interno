// "Uma legenda pra todos": o texto que a pessoa escreveu, com {carro} {ano} {km} {cor} {preco} {rodape} trocados pelos dados
// de cada carro. Puro (roda na tela e nos testes). Linha cujos campos vieram todos vazios some (não sai "Km: " solto).

export const MODELO_PADRAO = "🚗 {carro}\n📅 {ano} · {km}\n💰 {preco}\n\nChama no WhatsApp e garanta o seu!\n\n{rodape}";

export interface DadosDaLegenda {
  titulo: string;
  anoModelo: number | null;
  km: number | null;
  cor: string | null;
  precoCents: number | null;
}

export function legendaDoModelo(modelo: string, c: DadosDaLegenda, rodape: string): string {
  const valores: Record<string, string> = {
    carro: c.titulo,
    ano: c.anoModelo ? String(c.anoModelo) : "",
    km: c.km !== null ? `${c.km.toLocaleString("pt-BR")} km` : "",
    cor: c.cor ?? "",
    preco: c.precoCents ? (c.precoCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "",
    rodape: rodape.trim(),
  };
  const linhas: string[] = [];
  for (const linha of modelo.split("\n")) {
    const campos = [...linha.matchAll(/\{(\w+)\}/g)].map((m) => m[1].toLowerCase()).filter((k) => k in valores);
    const trocada = linha.replace(/\{(\w+)\}/g, (todo, k: string) => (k.toLowerCase() in valores ? valores[k.toLowerCase()] : todo));
    if (campos.length > 0 && campos.every((k) => !valores[k])) continue;
    // "📅 2021 · " quando o km faltou: tira o separador que sobrou.
    linhas.push(trocada.replace(/\s*[·|•-]\s*$/, "").replace(/^(\S+\s+)?[·|•-]\s*/, "$1"));
  }
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
