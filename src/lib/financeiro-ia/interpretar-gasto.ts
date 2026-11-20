// O que o Guilherme escreve no grupo "financeiro (gastos)", lido como lançamento.
//
// Arquivo puro de propósito: sem banco, sem rede, sem IA. É aqui que mora a
// regra de dinheiro, e regra de dinheiro tem que dar pra testar frase por frase.
// A IA só entra (em ler-com-ia.ts) quando esta leitura não sabe a categoria ou
// não sabe qual número é o valor.
//
// ── A regra de empresa × pessoal (decisão do Guilherme) ──────────────────
//
//   "Sempre sai da empresa; quando for pessoal eu aviso."
//   "O que ficar na dúvida, pergunta se é pessoal ou empresa."
//
// Então:
//   1. Ele escreveu "pessoal" (ou "particular", "pra casa") → pessoal.
//   2. Ele escreveu "empresa", "agência", "treinamentos" → empresa.
//   3. Nada escrito, e a coisa é típica de empresa ou serve pros dois
//      (software, imposto, almoço, gasolina) → empresa, que é o padrão dele.
//   4. Nada escrito, e a coisa é típica de vida pessoal (mercado, farmácia,
//      roupa, cinema) → PERGUNTA. Lançar mercado como custo da agência sem
//      perguntar é o erro mais comum de quem mistura as contas, e é justamente
//      o que estraga o DRE.
//
// Gasto pessoal pago com dinheiro da empresa é RETIRADA, não custo.

export type Destino = "empresa" | "pessoal" | "duvida";
export type EmpresaDoGasto = "AGENCIA" | "TREINAMENTOS";

/** As categorias de gasto da empresa — as mesmas do lançamento na tela. */
export const CATEGORIAS_EMPRESA = [
  "Salários",
  "Aluguel",
  "Ferramentas/Software",
  "Impostos",
  "Marketing",
  "Comissões",
  "Alimentação",
  "Transporte/Combustível",
  "Equipamentos",
  "Serviços de terceiros",
  "Tarifas bancárias",
  "Outros",
] as const;

/** As categorias da vida pessoal, pra página Pessoal. */
export const CATEGORIAS_PESSOAL = [
  "Mercado",
  "Alimentação",
  "Combustível",
  "Transporte",
  "Moradia",
  "Contas da casa",
  "Saúde",
  "Educação",
  "Lazer",
  "Vestuário",
  "Carro",
  "Assinaturas",
  "Impostos",
  "Cuidados pessoais",
  "Presentes",
  "Pets",
  "Outros",
] as const;

export type CategoriaEmpresa = (typeof CATEGORIAS_EMPRESA)[number];
export type CategoriaPessoal = (typeof CATEGORIAS_PESSOAL)[number];

/** Pra que lado a coisa costuma pender quando ninguém diz. */
export type Tendencia = "empresa" | "pessoal" | "neutro";

interface Regra {
  palavras: RegExp;
  empresa: CategoriaEmpresa;
  pessoal: CategoriaPessoal;
  tendencia: Tendencia;
}

// Ordem importa: a primeira que casar vence. As mais específicas vêm antes
// ("ipva" antes de "carro", "aluguel do carro" seria carro… mas "aluguel" sozinho
// é moradia ou escritório).
//
// As palavras estão sem acento e minúsculas: o texto passa por `normal()` antes.
const REGRAS: Regra[] = [
  // Impostos — os da empresa têm nome próprio; IPVA, IPTU e IR de pessoa física são pessoais.
  { palavras: /\b(ipva|iptu|irpf|licenciamento)\b/, empresa: "Impostos", pessoal: "Impostos", tendencia: "pessoal" },
  { palavras: /\b(imposto|impostos|das|simples nacional|simples|iss|inss|darf|irpj|csll|pis|cofins|guia|tributo|tributos)\b/, empresa: "Impostos", pessoal: "Impostos", tendencia: "empresa" },

  // Pessoas da empresa.
  { palavras: /\b(salario|salarios|folha|funcionario|funcionaria|funcionarios|vale|13o|decimo terceiro|ferias)\b/, empresa: "Salários", pessoal: "Outros", tendencia: "empresa" },
  { palavras: /\b(comissao|comissoes|bonus|premiacao)\b/, empresa: "Comissões", pessoal: "Outros", tendencia: "empresa" },

  // Marketing da própria agência.
  { palavras: /\b(trafego|anuncio|anuncios|ads|impulsionamento|impulsionar|patrocinado|meta ads|google ads|facebook ads|instagram ads)\b/, empresa: "Marketing", pessoal: "Outros", tendencia: "empresa" },

  // Ferramentas.
  { palavras: /\b(software|sistema|ferramenta|ferramentas|canva|chatgpt|openai|claude|anthropic|vercel|zapi|z api|hospedagem|dominio|servidor|notion|workspace|google one|adobe|capcut|figma|hostinger|github|cursor|elevenlabs|heygen|higgsfield|descript|manychat|rd station|kommo|whatsapp business)\b/, empresa: "Ferramentas/Software", pessoal: "Assinaturas", tendencia: "empresa" },

  // Terceiros.
  { palavras: /\b(contador|contadora|contabilidade|advogado|advogada|juridico|designer|editor|editora|freela|freelancer|freelance|terceirizado|consultoria|fotografo|videomaker|filmagem)\b/, empresa: "Serviços de terceiros", pessoal: "Outros", tendencia: "empresa" },

  // Banco.
  { palavras: /\b(tarifa|tarifas|taxa bancaria|iof|juros|anuidade|ted|boleto)\b/, empresa: "Tarifas bancárias", pessoal: "Outros", tendencia: "neutro" },

  // Equipamento.
  { palavras: /\b(notebook|computador|monitor|camera|microfone|iluminacao|ring light|tripe|lente|equipamento|equipamentos|teclado|mouse|hd|ssd|impressora)\b/, empresa: "Equipamentos", pessoal: "Outros", tendencia: "neutro" },

  // Mercado — típico de casa.
  { palavras: /\b(mercado|supermercado|atacadao|atacado|assai|feira|hortifruti|sacolao|acougue|padaria|condor|muffato|carrefour)\b/, empresa: "Alimentação", pessoal: "Mercado", tendencia: "pessoal" },

  // Comer fora — serve pros dois (almoço com cliente é custo).
  { palavras: /\b(almoco|almocos|almocar|janta|jantar|cafe|lanche|lanches|restaurante|ifood|delivery|pizza|hamburguer|burger|comida|marmita|refeicao|sushi|churrasco|salgado|sorvete|acai)\b/, empresa: "Alimentação", pessoal: "Alimentação", tendencia: "neutro" },

  // Carro — o combustível serve pros dois; o resto é do carro dele.
  { palavras: /\b(gasolina|combustivel|etanol|alcool|diesel|posto|abasteci|abastecer|abastecimento)\b/, empresa: "Transporte/Combustível", pessoal: "Combustível", tendencia: "neutro" },
  { palavras: /\b(mecanico|oficina|pneu|pneus|revisao|seguro do carro|lavacao|lava jato|lavagem|troca de oleo|oleo|funilaria|multa)\b/, empresa: "Transporte/Combustível", pessoal: "Carro", tendencia: "pessoal" },
  { palavras: /\b(uber|99pop|taxi|pedagio|estacionamento|onibus|passagem|passagens|voo|aereo|latam|gol linhas|azul linhas)\b/, empresa: "Transporte/Combustível", pessoal: "Transporte", tendencia: "neutro" },

  // Casa.
  { palavras: /\b(aluguel)\b/, empresa: "Aluguel", pessoal: "Moradia", tendencia: "neutro" },
  { palavras: /\b(condominio|financiamento da casa|prestacao da casa)\b/, empresa: "Aluguel", pessoal: "Moradia", tendencia: "pessoal" },
  { palavras: /\b(luz|energia|agua|internet|gas|celular|telefone|copel|sanepar)\b/, empresa: "Outros", pessoal: "Contas da casa", tendencia: "neutro" },

  // Saúde.
  { palavras: /\b(farmacia|remedio|remedios|medico|medica|consulta|dentista|exame|exames|plano de saude|unimed|hospital|academia|psicologo|psicologa|terapia|suplemento|whey)\b/, empresa: "Outros", pessoal: "Saúde", tendencia: "pessoal" },

  // Estudo.
  { palavras: /\b(escola|faculdade|mensalidade escolar|livro|livros|material escolar)\b/, empresa: "Outros", pessoal: "Educação", tendencia: "pessoal" },
  { palavras: /\b(curso|mentoria|imersao|evento|ingresso do evento)\b/, empresa: "Outros", pessoal: "Educação", tendencia: "neutro" },

  // Lazer, roupa, assinatura de casa.
  { palavras: /\b(cinema|show|bar|cerveja|chopp|balada|viagem|hotel|pousada|airbnb|passeio|parque|festa|praia|jogo|ingresso)\b/, empresa: "Outros", pessoal: "Lazer", tendencia: "pessoal" },
  { palavras: /\b(roupa|roupas|tenis|sapato|camisa|camiseta|calca|blusa|vestido|bermuda|shopping|renner|riachuelo|zara)\b/, empresa: "Outros", pessoal: "Vestuário", tendencia: "pessoal" },
  { palavras: /\b(netflix|spotify|youtube premium|prime video|amazon prime|disney|hbo|max|globoplay|deezer|apple music|icloud)\b/, empresa: "Ferramentas/Software", pessoal: "Assinaturas", tendencia: "pessoal" },
  { palavras: /\b(cabelo|barbeiro|barbearia|salao|manicure|unha|estetica|perfume)\b/, empresa: "Outros", pessoal: "Cuidados pessoais", tendencia: "pessoal" },
  { palavras: /\b(presente|presentes|aniversario)\b/, empresa: "Outros", pessoal: "Presentes", tendencia: "pessoal" },
  { palavras: /\b(pet|racao|veterinario|petshop|cachorro|gato)\b/, empresa: "Outros", pessoal: "Pets", tendencia: "pessoal" },
];

const DIZ_PESSOAL = /\b(pessoal|pessoais|particular|pra mim|pra casa|para casa|da casa|familia)\b/;
const DIZ_EMPRESA = /\b(empresa|agencia|firma|legacy|cnpj|treinamento|treinamentos)\b/;
const DIZ_TREINAMENTOS = /\b(treinamento|treinamentos)\b/;

/** Minúsculo, sem acento, sem pontuação estranha — mas mantém dígitos, "," "." "/" e "$". */
export function normal(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s,./$:+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────── Valores ──────────────────────────────────

export interface ValorAchado {
  cents: number;
  /** Tinha "R$" ou "reais" do lado: é dinheiro com certeza. */
  marcado: boolean;
  inicio: number;
  fim: number;
}

/**
 * Os números da frase que podem ser valor em dinheiro.
 *
 * Fica de fora o que é data ("15/11", "dia 15"), hora ("12h", "12:30") e
 * porcentagem. Reconhece "45", "45,90", "1.200", "1.200,50", "R$ 80", "1,5 mil",
 * "2k" e "300 reais".
 */
export function valoresNoTexto(texto: string): ValorAchado[] {
  const t = texto.toLowerCase();
  const achados: ValorAchado[] = [];
  const re =
    /(r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(\s*(?:mil|k)\b)?(\s*(?:reais|real|conto|contos|pila)\b)?/g;
  for (let m: RegExpExecArray | null; (m = re.exec(t)); ) {
    const inicio = m.index;
    const fim = inicio + m[0].length;
    const antes = t.slice(Math.max(0, inicio - 4), inicio);
    const depois = t.slice(fim, fim + 3);

    // Data e hora não são dinheiro.
    if (/^\s*\/\d/.test(depois) || /\d\/\s*$/.test(antes)) continue;
    if (/^\s*(h\b|hs\b|horas?\b|:\d|min\b|%|x\b|ª|º)/.test(t.slice(fim, fim + 6)) && !m[1]) continue;
    if (/\bdia\s*$/.test(t.slice(Math.max(0, inicio - 5), inicio)) && !m[1]) continue;

    let bruto = m[2];
    // "1.200" e "1.200,50": ponto de milhar. "45.90": ponto decimal.
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(bruto)) bruto = bruto.replace(/\./g, "").replace(",", ".");
    else bruto = bruto.replace(",", ".");
    let reais = Number(bruto);
    if (!Number.isFinite(reais)) continue;
    if (m[3]) reais *= 1000;
    const cents = Math.round(reais * 100);
    if (cents <= 0) continue;

    achados.push({ cents, marcado: !!m[1] || !!m[4], inicio, fim });
  }
  return achados;
}

// ─────────────────────────────── Datas ────────────────────────────────────

function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * O dia do gasto, se a frase diz. `hoje` é o dia da casa (America/Sao_Paulo).
 *
 * "dia 25" no dia 20 é o dia 25 do mês PASSADO: ninguém anota gasto do futuro.
 */
export function diaNoTexto(texto: string, hoje: string): string | null {
  const t = normal(texto);
  if (/\banteontem\b/.test(t)) return somarDias(hoje, -2);
  if (/\bontem\b/.test(t)) return somarDias(hoje, -1);
  if (/\bhoje\b/.test(t)) return hoje;

  const [anoHoje, mesHoje, diaHoje] = hoje.split("-").map(Number);
  const montar = (ano: number, mes: number, dia: number): string | null => {
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    const d = new Date(Date.UTC(ano, mes - 1, dia, 12));
    if (d.getUTCMonth() !== mes - 1) return null;
    return d.toISOString().slice(0, 10);
  };

  const barra = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (barra) {
    const dia = Number(barra[1]);
    const mes = Number(barra[2]);
    let ano = barra[3] ? Number(barra[3]) : anoHoje;
    if (ano < 100) ano += 2000;
    let r = montar(ano, mes, dia);
    // "28/12" em janeiro é do ano passado.
    if (r && !barra[3] && r > hoje) r = montar(ano - 1, mes, dia);
    return r;
  }

  const diaX = t.match(/\bdia\s+(\d{1,2})\b/);
  if (diaX) {
    const dia = Number(diaX[1]);
    if (dia <= diaHoje) return montar(anoHoje, mesHoje, dia);
    const mesAntes = mesHoje === 1 ? 12 : mesHoje - 1;
    return montar(mesHoje === 1 ? anoHoje - 1 : anoHoje, mesAntes, dia);
  }
  return null;
}

// ────────────────────────────── A leitura ─────────────────────────────────

export interface GastoLido {
  descricao: string;
  valorCents: number;
  categoriaEmpresa: CategoriaEmpresa;
  categoriaPessoal: CategoriaPessoal;
  destino: Destino;
  empresa: EmpresaDoGasto;
  /** AAAA-MM-DD, no dia da casa. */
  dia: string;
}

export interface PedacoSemCerteza {
  /** O texto do pedaço, pra IA ler de novo. */
  texto: string;
  motivo: "sem-categoria" | "valor-ambiguo";
}

export interface Leitura {
  gastos: GastoLido[];
  /** Pedaços que esta leitura não resolveu e vão pra IA. */
  semCerteza: PedacoSemCerteza[];
}

/** Classifica um texto: categoria e tendência, ou nada. */
export function classificar(texto: string): Regra | null {
  const t = normal(texto);
  // Também no singular: "cafés", "pneus", "lanches" — o plural não pode esconder a categoria.
  const singular = t.replace(/\b([a-z]{3,})s\b/g, "$1");
  for (const r of REGRAS) if (r.palavras.test(t) || r.palavras.test(singular)) return r;
  return null;
}

/** O que a frase diz sobre empresa × pessoal, quando diz. */
export function destinoDito(texto: string): "empresa" | "pessoal" | null {
  const t = normal(texto);
  const p = DIZ_PESSOAL.test(t);
  const e = DIZ_EMPRESA.test(t);
  if (p && !e) return "pessoal";
  if (e && !p) return "empresa";
  return null;
}

/** Decide o destino de UM gasto, pela regra lá de cima. */
export function decidirDestino(dito: "empresa" | "pessoal" | null, tendencia: Tendencia): Destino {
  if (dito) return dito;
  if (tendencia === "pessoal") return "duvida";
  return "empresa";
}

const ENCHIMENTO = new Set([
  "gastei", "gasto", "gastos", "paguei", "pago", "pagamento", "pagar", "comprei", "compra", "compras",
  "foi", "deu", "com", "no", "na", "nos", "nas", "em", "de", "do", "da", "dos", "das_", "o", "a", "os",
  "as", "um", "uma", "r$", "reais", "real", "treinamento", "treinamentos", "pix", "cartao", "debito", "credito", "hoje", "ontem",
  "anteontem", "dia", "pessoal", "pessoais", "particular", "empresa", "agencia", "firma", "e", "mais",
  "tudo", "todos", "todas", "isso", "ai", "lancar", "lanca", "lança", "anota", "anotar", "por", "pra", "para",
  "valor", "conto", "contos", "pila", "mil", "k", "-", ":", "+",
]);

function descricaoDe(pedaco: string, valor: ValorAchado | null): string {
  let t = pedaco;
  if (valor) t = t.slice(0, valor.inicio) + " " + t.slice(valor.fim);
  t = t
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
    .replace(/\bdia\s+\d{1,2}\b/gi, " ")
    .replace(/r\$/gi, " ")
    .replace(/\b(pra mim|pra casa|para casa)\b/gi, " ");
  const palavras = t.split(/\s+/).filter(Boolean);
  // Tira o enchimento só das pontas: "almoço com cliente" mantém o "com".
  const fora = (p: string) => ENCHIMENTO.has(normal(p).replace(/[.,;]+$/, "")) || /^[.,;:+-]+$/.test(p);
  while (palavras.length && fora(palavras[0])) palavras.shift();
  while (palavras.length && fora(palavras[palavras.length - 1])) palavras.pop();
  const d = palavras.join(" ").replace(/[.,;:]+$/, "").trim();
  if (!d) return "";
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/**
 * Os pedaços da mensagem, um por gasto.
 *
 * Quebra em linha e ";" sempre, e em ", " / " e " / " + " quando os dois lados
 * têm número. Pedaço sem número gruda no seguinte ("almoço com cliente, 120");
 * se for o último, gruda no anterior.
 */
export function pedacos(texto: string): string[] {
  const linhas = texto.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  const brutos: string[] = [];
  for (const l of linhas) brutos.push(...l.split(/,\s+|\s+e\s+|\s+\+\s+|\s+-\s+/i).map((x) => x.trim()).filter(Boolean));

  const comValor = (p: string) => valoresNoTexto(p).length > 0;
  const saida: string[] = [];
  let guardado = "";
  for (const p of brutos) {
    if (!comValor(p)) {
      guardado = guardado ? `${guardado} ${p}` : p;
      continue;
    }
    saida.push(guardado ? `${guardado} ${p}` : p);
    guardado = "";
  }
  if (guardado && saida.length) saida[saida.length - 1] += ` ${guardado}`;
  return saida;
}

/**
 * Lê a mensagem inteira.
 *
 * O que vale pra mensagem toda ("tudo pessoal", "ontem", "treinamentos" num pedaço
 * sem valor) vale pra cada gasto que não disser o contrário.
 */
export function lerGastos(texto: string, hoje: string): Leitura {
  const gastos: GastoLido[] = [];
  const semCerteza: PedacoSemCerteza[] = [];

  // O que a mensagem diz no geral: os pedaços SEM valor ("tudo pessoal", "ontem").
  const linhas = texto.split(/\n|;|,\s+/).map((x) => x.trim()).filter(Boolean);
  // "ontem: gasolina 200, almoço 40" — o que vem antes do ":" do começo também é geral.
  const abertura = texto.match(/^([^\d\n:]{2,40}):/);
  const geral = [abertura?.[1] ?? "", ...linhas.filter((l) => valoresNoTexto(l).length === 0)].join(" ");
  const destinoGeral = destinoDito(geral);
  const diaGeral = diaNoTexto(geral, hoje);
  const treinamentosGeral = DIZ_TREINAMENTOS.test(normal(geral));

  for (const p of pedacos(texto)) {
    const valores = valoresNoTexto(p);
    let valor: ValorAchado | null = null;
    if (valores.length === 1) valor = valores[0];
    else {
      const marcados = valores.filter((v) => v.marcado);
      if (marcados.length === 1) valor = marcados[0];
    }
    if (!valor) {
      semCerteza.push({ texto: p, motivo: "valor-ambiguo" });
      continue;
    }

    const regra = classificar(p);
    if (!regra) {
      semCerteza.push({ texto: p, motivo: "sem-categoria" });
      continue;
    }

    const dito = destinoDito(p) ?? destinoGeral;
    const descricao = descricaoDe(p, valor) || regra.pessoal;
    gastos.push({
      descricao,
      valorCents: valor.cents,
      categoriaEmpresa: regra.empresa,
      categoriaPessoal: regra.pessoal,
      destino: decidirDestino(dito, regra.tendencia),
      empresa: DIZ_TREINAMENTOS.test(normal(p)) || treinamentosGeral ? "TREINAMENTOS" : "AGENCIA",
      dia: diaNoTexto(p, hoje) ?? diaGeral ?? hoje,
    });
  }
  return { gastos, semCerteza };
}

/**
 * O gasto que nem a regra nem a IA souberam classificar, mas tem UM valor claro.
 *
 * Não se perde: entra como "Outros", e o destino é o que a frase disse — ou a
 * pergunta, porque sem saber o que é não dá pra presumir que é da empresa.
 */
export function gastoSemCategoria(pedaco: string, hoje: string): GastoLido | null {
  const valores = valoresNoTexto(pedaco);
  const valor = valores.length === 1 ? valores[0] : valores.filter((v) => v.marcado).length === 1 ? valores.find((v) => v.marcado)! : null;
  if (!valor) return null;
  return {
    descricao: descricaoDe(pedaco, valor) || "Gasto",
    valorCents: valor.cents,
    categoriaEmpresa: "Outros",
    categoriaPessoal: "Outros",
    destino: destinoDito(pedaco) ?? "duvida",
    empresa: DIZ_TREINAMENTOS.test(normal(pedaco)) ? "TREINAMENTOS" : "AGENCIA",
    dia: diaNoTexto(pedaco, hoje) ?? hoje,
  };
}

// ───────────────────────── A resposta "pessoal ou empresa?" ─────────────────

/**
 * Lê a resposta à pergunta aberta.
 *
 * "pessoal" / "empresa" (e "p", "e", "é pessoal", "tudo da empresa") vale pra
 * todos. "1 pessoal 2 empresa" vale um por um. Devolve `null` quando a mensagem
 * não é resposta — e aí ela é lida como gasto novo.
 */
export function lerRespostaDeDestino(
  texto: string,
  quantos: number,
): ("empresa" | "pessoal")[] | null {
  const t = normal(texto).replace(/[.,!;]/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.length > 50) return null;

  // Um por um: "1 pessoal 2 empresa", "1 p, 2 e", "1-pessoal 2-empresa".
  if (/^(\d{1,2}\s*[-:=)]?\s*(pessoal|empresa|p|e)\s*)+$/.test(t)) {
    const r: ("empresa" | "pessoal" | null)[] = Array(quantos).fill(null);
    for (const [, n, d] of t.matchAll(/(\d{1,2})\s*[-:=)]?\s*(pessoal|empresa|p|e)\b/g)) {
      const i = Number(n) - 1;
      if (i < 0 || i >= quantos) return null;
      r[i] = d.startsWith("p") ? "pessoal" : "empresa";
    }
    // Resposta pela metade não fecha nada: o robô pergunta de novo.
    if (r.some((x) => x === null)) return null;
    return r as ("empresa" | "pessoal")[];
  }

  // Pra todos: "pessoal", "é pessoal", "tudo da empresa", "p", "e".
  const sem = t.replace(/^(e|eh|foi|tudo|todos|todas|os dois|ambos)\s+/, "").replace(/^(da|de)\s+/, "");
  const PES = /^(p|pess|pessoal|pessoais|particular)$/;
  const EMP = /^(e|emp|empresa|agencia|firma)$/;
  if (PES.test(t) || PES.test(sem)) return Array(quantos).fill("pessoal");
  if (EMP.test(t) || EMP.test(sem)) return Array(quantos).fill("empresa");
  return null;
}

/** "desfaz", "apaga o último", "cancela o último lançamento". */
export function pedeDesfazer(texto: string): boolean {
  const t = normal(texto);
  return /^(desfaz|desfazer|desfaca|apaga o ultimo|apagar o ultimo|apaga ultimo|cancela o ultimo|cancelar o ultimo|errei|apaga|apaga isso|cancela isso)\b/.test(t) && t.length < 40;
}

/** "resumo", "quanto gastei esse mês?" */
export function pedeResumo(texto: string): boolean {
  const t = normal(texto);
  return /\b(resumo|quanto gastei|quanto ja gastei|gastos do mes|total do mes|como estao os gastos|como to de gasto|como estou de gasto)\b/.test(t);
}

// ─────────────────────────────── Escrita ───────────────────────────────────

/** "R$ 1.230,00", com espaço comum (o do Intl aparece estranho no WhatsApp). */
export function reais(cents: number): string {
  return (cents / 100)
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    .replace(/ /g, " ");
}

function diaCurto(dia: string, hoje: string): string {
  if (dia === hoje) return "";
  const [, m, d] = dia.split("-");
  return ` · ${d}/${m}`;
}

export function linhaDoGasto(g: GastoLido, hoje: string): string {
  const onde =
    g.destino === "pessoal"
      ? `${g.categoriaPessoal} · *Pessoal* (retirada)`
      : `${g.categoriaEmpresa} · Empresa${g.empresa === "TREINAMENTOS" ? " (Treinamentos)" : ""}`;
  return `• ${g.descricao} — *${reais(g.valorCents)}* · ${onde}${diaCurto(g.dia, hoje)}`;
}

export function textoDaPergunta(duvidas: GastoLido[]): string {
  if (duvidas.length === 1) {
    const g = duvidas[0];
    return `*${g.descricao} — ${reais(g.valorCents)}*: foi *pessoal* ou da *empresa*?`;
  }
  return (
    "Esses foram *pessoal* ou da *empresa*?\n" +
    duvidas.map((g, i) => `${i + 1}. ${g.descricao} — ${reais(g.valorCents)}`).join("\n") +
    "\n\nResponde *pessoal* ou *empresa* pra todos, ou um por um: *1 pessoal, 2 empresa*."
  );
}
