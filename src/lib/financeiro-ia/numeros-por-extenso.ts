// "quarenta e cinco reais" → "45 reais". Arquivo puro.
//
// A transcrição de áudio devolve o número do jeito que foi falado: às vezes "45",
// às vezes "quarenta e cinco". O leitor de gastos (interpretar-gasto.ts) só entende
// dígitos, então a transcrição passa por aqui antes.
//
// ── Onde isto pode dar errado, e por que as regras são estas ─────────────
//
// Número errado vira dinheiro errado no financeiro, então o conversor é CONSERVADOR:
// na dúvida, deixa a palavra como está — e o leitor, que não acha valor, pede pra
// ele reescrever ou manda pra IA.
//
//   - "um"/"uma" sozinho NUNCA vira 1: "um uber de vinte" tem um valor só (20), e
//     transformar o "um" em 1 criaria um segundo número e um gasto ambíguo.
//   - Número pequeno (até dez) sozinho só vira dígito se vier colado numa palavra de
//     dinheiro ("dois reais") ou de "mil": "dois cafés dezoito reais" tem uma
//     QUANTIDADE (dois) e um valor (dezoito), e o dois fica como palavra.
//   - O "e" só entra no número quando liga duas partes que fazem sentido ("vinte e
//     três", "cento e dez", "mil e duzentos"). "uber vinte e três e almoço quarenta"
//     não vira "vinte e três e almoço".
//   - Centavos: só com a palavra "centavos" ("quarenta e cinco reais e noventa
//     centavos" → 45,90). "vinte e três e cinquenta" fica como está: ninguém sabe se
//     são R$ 23,50 ou dois valores.

const UNIDADES: Record<string, number> = {
  zero: 0, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
};
const UM = new Set(["um", "uma"]);
const DEZ_A_DEZENOVE: Record<string, number> = {
  dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezeseis: 16,
  dezessete: 17, dezesete: 17, dezoito: 18, dezenove: 19, dezanove: 19,
};
const DEZENAS: Record<string, number> = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
};
const CENTENAS: Record<string, number> = {
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400,
  quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700,
  oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
};
const DINHEIRO = new Set(["reais", "real", "conto", "contos", "pila", "pilas"]);

type Tipo = "um" | "unidade" | "dez" | "dezena" | "centena" | "mil";

function semAcento(p: string): string {
  return p.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function classe(p: string): { tipo: Tipo; valor: number } | null {
  if (UM.has(p)) return { tipo: "um", valor: 1 };
  if (p in UNIDADES) return { tipo: "unidade", valor: UNIDADES[p] };
  if (p in DEZ_A_DEZENOVE) return { tipo: "dez", valor: DEZ_A_DEZENOVE[p] };
  if (p in DEZENAS) return { tipo: "dezena", valor: DEZENAS[p] };
  if (p in CENTENAS) return { tipo: "centena", valor: CENTENAS[p] };
  if (p === "mil") return { tipo: "mil", valor: 1000 };
  return null;
}

/** Depois de `anterior`, a palavra `atual` ainda faz parte do MESMO número? */
function continua(anterior: Tipo, atual: Tipo, comE: boolean): boolean {
  switch (anterior) {
    case "centena": // cento e vinte · cento e cinco · duzentos e dez
      return comE && (atual === "dezena" || atual === "dez" || atual === "unidade" || atual === "um");
    case "dezena": // vinte e três (sempre com "e")
      return comE && (atual === "unidade" || atual === "um");
    case "mil": // mil e duzentos · dois mil trezentos · mil duzentos
      return atual === "centena" || (comE && (atual === "dezena" || atual === "dez" || atual === "unidade" || atual === "um")) || (!comE && (atual === "dezena" || atual === "dez"));
    case "um":
    case "unidade":
    case "dez":
      return atual === "mil"; // dois mil · dez mil · um mil
    default:
      return false;
  }
}

interface Token {
  bruto: string; // com a pontuação, pra devolver igual
  p: string; // sem acento, minúsculo, sem pontuação
  fimDeFrase: boolean;
}

function tokenizar(texto: string): { tokens: Token[]; separadores: string[] } {
  const partes = texto.split(/(\s+)/);
  const tokens: Token[] = [];
  const separadores: string[] = [];
  for (let i = 0; i < partes.length; i += 2) {
    const bruto = partes[i];
    if (bruto === "") continue;
    tokens.push({ bruto, p: semAcento(bruto.replace(/[.,;:!?]+$/g, "")), fimDeFrase: /[.,;:!?]+$/.test(bruto) });
    separadores.push(partes[i + 1] ?? "");
  }
  return { tokens, separadores };
}

/** Lê um número por extenso a partir de `i`. Devolve o valor, até onde foi e se tinha "mil". */
function lerNumero(tokens: Token[], i: number): { valor: number; fim: number; sozinhoPequeno: boolean; teveMil: boolean; temUm: boolean } | null {
  const primeiro = classe(tokens[i].p);
  if (!primeiro) return null;

  let total = 0;
  let atualParcial = 0; // o que vem antes do "mil"
  let teveMil = false;
  let ultimo = primeiro;
  let j = i;
  const aplicar = (c: { tipo: Tipo; valor: number }) => {
    if (c.tipo === "mil") {
      total += (atualParcial || 1) * 1000;
      atualParcial = 0;
      teveMil = true;
    } else atualParcial += c.valor;
  };
  aplicar(primeiro);

  while (!tokens[j].fimDeFrase) {
    let k = j + 1;
    let comE = false;
    if (k < tokens.length && tokens[k].p === "e") {
      comE = true;
      k++;
    }
    if (k >= tokens.length) break;
    const prox = classe(tokens[k].p);
    if (!prox || !continua(ultimo.tipo, prox.tipo, comE)) break;
    aplicar(prox);
    ultimo = prox;
    j = k;
  }

  const valor = total + atualParcial;
  return {
    valor,
    fim: j,
    // Só o que vai de 1 a 10: de onze em diante ninguém conta "quantidade" ("doze reais" e "quinze" são valor/dia).
    sozinhoPequeno: j === i && (primeiro.tipo === "unidade" || primeiro.tipo === "um" || (primeiro.tipo === "dez" && primeiro.valor === 10)),
    teveMil,
    temUm: j === i && primeiro.tipo === "um",
  };
}

/**
 * Troca os números por extenso do texto por dígitos.
 *
 * "quarenta e cinco reais"                        → "45 reais"
 * "mercado trezentos e dez pessoal"               → "mercado 310 pessoal"
 * "aluguel mil e duzentos"                        → "aluguel 1200"
 * "quarenta e cinco reais e noventa centavos"     → "45,90 reais"
 * "dois cafés dezoito reais"                      → "dois cafés 18 reais"   (o dois é quantidade)
 */
export function numerosPorExtenso(texto: string): string {
  const { tokens, separadores } = tokenizar(texto);
  const saida: string[] = [];

  for (let i = 0; i < tokens.length; ) {
    // "2 mil", "4,5 mil": o "mil" já está ao lado de um dígito e é do dígito.
    const colaNoDigito = tokens[i].p === "mil" && i > 0 && /\d$/.test(tokens[i - 1].p);
    const n = colaNoDigito ? null : lerNumero(tokens, i);
    if (!n) {
      saida.push(tokens[i].bruto, separadores[i]);
      i++;
      continue;
    }

    const depois = tokens[n.fim + 1]?.p;
    const colado = !!depois && (DINHEIRO.has(depois) || depois === "mil");
    // "um/uma" sozinho nunca vira número; pequeno sozinho só com palavra de dinheiro.
    if (n.temUm || (n.sozinhoPequeno && !colado)) {
      saida.push(tokens[i].bruto, separadores[i]);
      i++;
      continue;
    }

    let valor = String(n.valor);
    let fim = n.fim;

    // "… reais e noventa centavos"
    if (depois && DINHEIRO.has(depois) && tokens[n.fim + 2]?.p === "e") {
      const c = lerNumero(tokens, n.fim + 3);
      if (c && tokens[c.fim + 1]?.p.startsWith("centavo") && c.valor > 0 && c.valor < 100) {
        valor = `${n.valor},${String(c.valor).padStart(2, "0")}`;
        // consome: reais e <centavos> centavos
        const pontuacao = tokens[c.fim + 1].bruto.match(/[.,;:!?]+$/)?.[0] ?? "";
        saida.push(`${valor} ${tokens[n.fim + 1].bruto.replace(/[.,;:!?]+$/, "")}${pontuacao}`, separadores[c.fim + 1]);
        i = c.fim + 2;
        continue;
      }
    }

    const pontuacao = tokens[fim].bruto.match(/[.,;:!?]+$/)?.[0] ?? "";
    saida.push(valor + pontuacao, separadores[fim]);
    i = fim + 1;
  }
  return saida.join("").trimEnd();
}
