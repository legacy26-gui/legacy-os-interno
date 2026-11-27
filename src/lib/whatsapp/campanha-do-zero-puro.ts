// Campanha do zero pelo WhatsApp — a leitura das instruções (puro, testável).
//
// A pessoa escreve do jeito que fala: "campanha do zero DS Multimarcas, leads, um conjunto por carro, R$ 20 por dia,
// idade 25 a 55, Ponta Grossa 30 km, legenda IA". Cada pedaço reconhecido muda UMA coisa do pedido; o que não foi dito
// fica no padrão (e aparece no resumo pra conferir). Depois, linhas soltas ajustam: "orçamento 30", "idade 25 a 50",
// "cidade Curitiba 20 km", "estrutura um conjunto", "objetivo engajamento", "carros todos", "legenda: Oferta! {carro}…".

export type Objetivo = "leads" | "engajamento";
export type EstruturaZap = "por-carro" | "um-conjunto";

export interface InstrucoesLidas {
  objetivo?: Objetivo;
  estrutura?: EstruturaZap;
  /** Reais por dia (por conjunto, ou na campanha se `naCampanha`). */
  orcamentoReais?: number;
  naCampanha?: boolean;
  idadeMin?: number;
  idadeMax?: number;
  genero?: "todos" | "homens" | "mulheres";
  /** Cidade escrita (pra procurar na Meta) e o raio. */
  cidade?: string;
  raioKm?: number;
  /** "ia" = a IA escreve; outro texto = a mesma legenda pra todos ({carro}, {preco}…). */
  legenda?: string;
  /** Quais carros: só os com arte, todos, ou nomes. */
  carros?: "arte" | "todos" | string[];
  nome?: string;
}

export function achatar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** A mensagem pede uma campanha do zero? */
export function pedeCampanhaDoZero(texto: string): boolean {
  return /\bcampanha\s+(do\s+)?zero\b|\bcampanha\s+nova\s+do\s+zero\b|\bcriar\s+campanha\s+(nova\s+)?(pra|para|da|do)\b/.test(achatar(texto));
}

const RAIOS = [17, 25, 30, 40, 50, 65, 80];
/** O raio que a Meta aceita mais perto do pedido. */
export function raioAceito(km: number): number {
  return RAIOS.reduce((a, b) => (Math.abs(b - km) < Math.abs(a - km) ? b : a));
}

export function lerInstrucoes(texto: string): InstrucoesLidas {
  const bruto = texto.trim();
  const t = achatar(bruto);
  const r: InstrucoesLidas = {};

  if (/\bengajamento\b/.test(t)) r.objetivo = "engajamento";
  else if (/\bleads?\b|\bcadastros?\b|\bconversas?\b|\bmensage(m|ns)\b/.test(t)) r.objetivo = "leads";

  if (/\b(um|1|so um|unico)\s+conjunto\b(?!\s+por)|\btudo\s+(num|em um|no mesmo)\s+conjunto\b|\bestrutura:?\s+um conjunto\b/.test(t)) r.estrutura = "um-conjunto";
  if (/\bconjunto\s+por\s+carro\b|\bpor\s+carro\b|\bestrutura:?\s+por carro\b/.test(t)) r.estrutura = "por-carro";

  const orc =
    t.match(/(?:r\$\s*)?(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:reais\s*)?(?:por\s+dia|\/\s*dia|ao\s+dia|diarios?|por\s+conjunto|cada\s+conjunto)/) ??
    t.match(/\borcamento:?\s*(?:de\s*)?(?:r\$\s*)?(\d{1,5}(?:[.,]\d{1,2})?)/);
  if (orc) {
    const v = Number(orc[1].replace(",", "."));
    if (v > 0) r.orcamentoReais = v;
  }
  if (/\bna campanha\b|\borcamento da campanha\b|\bcbo\b/.test(t)) r.naCampanha = true;
  if (/\bpor conjunto\b|\bcada conjunto\b/.test(t)) r.naCampanha = false;

  const idade = t.match(/\b(\d{2})\s*(?:a|ate|-|e)\s*(\d{2})\s*(?:anos)?\b/);
  if (idade && (/\bidade\b|\banos\b/.test(t) || Number(idade[1]) >= 18)) {
    const a = Number(idade[1]);
    const b = Number(idade[2]);
    if (a >= 18 && b <= 65 && a < b) {
      r.idadeMin = a;
      r.idadeMax = b;
    }
  }

  const homens = /\bhomens?\b|\bmasculino\b/.test(t);
  const mulheres = /\bmulheres?\b|\bfeminino\b/.test(t);
  if (homens && !mulheres) r.genero = "homens";
  else if (mulheres && !homens) r.genero = "mulheres";
  else if (/\btodos os generos\b|\bhomens e mulheres\b|\bambos\b/.test(t)) r.genero = "todos";

  // Cidade: "cidade X", "em X 30 km", ou "X 30 km". O raio sozinho também vale ("raio 40 km").
  const raio = t.match(/\b(\d{1,3})\s*km\b/);
  if (raio) r.raioKm = raioAceito(Number(raio[1]));
  const comRotulo = bruto.match(/\bcidade:?\s+([A-Za-zÀ-ÿ' .-]{3,40}?)(?=\s*(?:\d{1,3}\s*km\b|,|;|\n|$))/i);
  const antesDoKm = bruto.match(/(?:^|,|;|\n|\bem\s)\s*([A-Za-zÀ-ÿ' .-]{3,40}?)\s+(?:\+\s*)?\d{1,3}\s*km\b/i);
  const cidade = (comRotulo?.[1] ?? antesDoKm?.[1] ?? "").replace(/^(em|de|raio)\s+/i, "").trim();
  if (cidade && !/^(raio|idade|orcamento)$/i.test(achatar(cidade))) r.cidade = cidade;

  // Legenda: "legenda IA" / "legenda: texto pra todos".
  const leg = bruto.match(/\blegenda\s*[:=]?\s*([\s\S]+)$/i);
  if (leg) {
    const v = leg[1].trim();
    if (/^(ia|i\.a\.?|inteligencia|a ia escreve|automatica)\b/i.test(achatar(v)) && v.length <= 20) r.legenda = "ia";
    else if (v.length >= 10) r.legenda = v.slice(0, 2000);
  }

  // Carros.
  const car = bruto.match(/\bcarros?\s*:\s*([^\n]+)/i) ?? bruto.match(/\bcarros?\s+(todos|s[oó]\s+(?:os\s+)?com\s+arte)\b/i);
  if (car) {
    const v = achatar(car[1]);
    if (/^todos\b/.test(v)) r.carros = "todos";
    else if (/com arte|so arte|arte/.test(v)) r.carros = "arte";
    else {
      const nomes = car[1].split(/,|;|\be\b/).map((x) => x.trim()).filter((x) => x.length >= 2);
      if (nomes.length) r.carros = nomes.slice(0, 60);
    }
  }

  const nome = bruto.match(/\bnome(?:\s+da\s+campanha)?\s*:\s*([^\n,]{3,120})/i);
  if (nome) r.nome = nome[1].trim();
  return r;
}

/** Em quais carros um nome da lista bate (todas as palavras do nome no título). Pura. */
export function carrosPeloNome<T extends { id: string; titulo: string }>(nomes: string[], carros: T[]): { achados: T[]; semCarro: string[] } {
  const achados: T[] = [];
  const semCarro: string[] = [];
  for (const nome of nomes) {
    const palavras = achatar(nome).split(" ").filter((p) => p.length >= 2);
    const bate = carros.filter((c) => palavras.every((p) => achatar(c.titulo).includes(p)));
    if (bate.length === 0) semCarro.push(nome);
    for (const c of bate) if (!achados.includes(c)) achados.push(c);
  }
  return { achados, semCarro };
}
