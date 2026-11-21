// Casar um carro do estoque com a tabela FIPE. Arquivo puro: recebe nomes, devolve a escolha. Sem rede.
//
// ── O problema ───────────────────────────────────────────────────────────
//
// O site da loja diz "CHEVROLET ONIX 1.0 MPFI JOY 8V FLEX 4P MANUAL 2019". A FIPE tem, só de Onix, dezenas de
// versões ("ONIX HATCH Joy 1.0 8V Flex 5p Mec.", "ONIX HATCH LT 1.0 8V FlexPower 5p Mec."…). Não existe código em
// comum: o elo é o nome.
//
// ── Como decide ──────────────────────────────────────────────────────────
//
//   1. Marca: pelo nome, com os apelidos da FIPE ("VW - VolksWagen", "GM - Chevrolet").
//   2. Modelo: as versões da FIPE que começam com o modelo do site (ONIX, VIRTUS…).
//   3. Travas que eliminam: cilindrada (1.0 x 1.6), câmbio (automático x manual) e válvulas (8V x 16V) precisam
//      bater quando os dois lados dizem. Versão de 1.6 nunca é a FIPE de um 1.0.
//   4. Pontos: as palavras da versão que aparecem no nome da FIPE (JOY, LTZ, HIGHLINE, TSI, GRIFFE…).
//   5. Um vencedor claro = preço EXATO. Empate entre versões = FAIXA (do menor ao maior preço delas), dita assim
//      na tela. Nada que sobre = "não achei" — nunca um preço de outro carro.

export interface ModeloFipe {
  code: string;
  name: string;
}

export interface CarroParaFipe {
  marca: string | null;
  modelo: string | null;
  versao: string | null;
  titulo: string;
  anoModelo: number | null;
}

const APELIDOS_DE_MARCA: Record<string, string[]> = {
  volkswagen: ["vw - volkswagen", "volkswagen", "vw"],
  vw: ["vw - volkswagen"],
  chevrolet: ["gm - chevrolet"],
  gm: ["gm - chevrolet"],
  "mercedes-benz": ["mercedes-benz"],
  mercedes: ["mercedes-benz"],
  citroen: ["citroën", "citroen"],
  kia: ["kia motors"],
  chery: ["caoa chery", "caoa chery/chery"],
  "caoa chery": ["caoa chery"],
  land: ["land rover"],
  "land rover": ["land rover"],
};

export function semAcento(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/** Acha o código da marca na lista da FIPE. */
export function acharMarca(marca: string | null, marcas: { code: string; name: string }[]): string | null {
  if (!marca) return null;
  const m = semAcento(marca);
  const alvos = [m, ...(APELIDOS_DE_MARCA[m] ?? [])];
  for (const alvo of alvos) {
    const exata = marcas.find((b) => semAcento(b.name) === alvo);
    if (exata) return exata.code;
  }
  // "VW - VolksWagen" contém "volkswagen"; "Kia Motors" contém "kia".
  const contem = marcas.filter((b) => semAcento(b.name).split(/[\s/-]+/).includes(m));
  return contem.length === 1 ? contem[0].code : null;
}

/** As palavras de um nome de versão, já com os sinônimos resolvidos. */
export function palavras(texto: string): string[] {
  const t = semAcento(texto)
    .replace(/(\d)\.(\d)/g, "$1#$2") // 1.6 vira um token só
    .replace(/[^a-z0-9#\s]/g, " ");
  const saida: string[] = [];
  for (const p0 of t.split(/\s+/).filter(Boolean)) {
    const p = p0.replace("#", ".");
    if (["automatico", "aut", "automatica", "cvt", "at", "dualogic", "dsg", "tiptronic"].includes(p)) saida.push("aut");
    else if (["manual", "mec", "mt"].includes(p)) saida.push("mec");
    else if (["flex", "flexone", "totalflex", "flexpower", "power", "fpower", "flexfuel", "tetrafuel"].includes(p)) saida.push("flex");
    else if (["turbo", "tb"].includes(p)) saida.push("tb");
    else if (["4p", "5p", "2p", "3p"].includes(p)) saida.push(p);
    else saida.push(p);
  }
  return saida;
}

const ehCilindrada = (p: string) => /^\d\.\d$/.test(p);
const ehValvula = (p: string) => /^\d{1,2}v$/.test(p);
const ehCambio = (p: string) => p === "aut" || p === "mec";

/** Palavras que não distinguem versão nenhuma (estão em quase toda linha da FIPE). */
const NEUTRAS = new Set(["flex", "4p", "5p", "2p", "3p", "gasolina", "alcool", "diesel", "mpfi", "mpi", "mi", "fire", "evo", "16v", "8v", "12v"]);

/** Portas: o site escreve "4P" pra hatch de 5 portas, então 4p e 5p são o mesmo grupo; 2p e 3p, o outro. */
const portas = (ps: string[]): "muitas" | "poucas" | null =>
  ps.some((p) => p === "4p" || p === "5p") ? "muitas" : ps.some((p) => p === "2p" || p === "3p") ? "poucas" : null;
const combustivel = (ps: string[]): "diesel" | "flex" | "gasolina" | null =>
  ps.includes("diesel") ? "diesel" : ps.includes("flex") ? "flex" : ps.includes("gasolina") ? "gasolina" : null;

export interface Candidato {
  modelo: ModeloFipe;
  pontos: number;
}

export interface Escolha {
  /** "exato": um vencedor. "faixa": empate entre versões (o preço vira faixa). "nenhum": não achei. */
  tipo: "exato" | "faixa" | "nenhum";
  candidatos: Candidato[];
}

/**
 * As versões da FIPE que podem ser este carro, da mais provável pra menos (as que as travas não eliminaram).
 * Quem chama confere quais têm o ANO do carro e então decide com `decidir` — a versão certa às vezes não
 * existe naquele ano (a FIPE separa por geração), e aí vale a próxima.
 */
export function rankingDeModelos(carro: CarroParaFipe, modelos: ModeloFipe[]): Candidato[] {
  const modelo = semAcento(carro.modelo ?? "").split(/\s+/).filter(Boolean);
  if (modelo.length === 0) return [];
  const versao = palavras(`${carro.versao ?? ""}`);
  const cil = versao.find(ehCilindrada);
  const valv = versao.find(ehValvula);
  const camb = versao.find(ehCambio);

  const doModelo = modelos.filter((m) => {
    const p = semAcento(m.name).split(/[\s/]+/).filter(Boolean);
    return modelo.every((w, i) => p[i] === w);
  });
  if (doModelo.length === 0) return [];
  const portasDoSite = portas(versao);
  const combDoSite = combustivel(palavras(`${carro.versao ?? ""} ${carro.titulo}`));
  const carroceria = versao.includes("sedan") ? "sedan" : versao.includes("hatch") ? "hatch" : null;

  const pontuados: Candidato[] = [];
  for (const m of doModelo) {
    const p = palavras(m.name).slice(modelo.length);
    // Travas: o que os dois lados dizem tem que bater.
    const pc = p.find(ehCilindrada);
    if (cil && pc && cil !== pc) continue;
    const pv = p.find(ehValvula);
    if (valv && pv && valv !== pv) continue;
    const pcb = p.find(ehCambio);
    if (camb && pcb && camb !== pcb) continue;
    if (camb === "mec" && !pcb && p.includes("aut")) continue;
    const combDaFipe = combustivel(p);
    if (combDoSite && combDaFipe && combDoSite !== combDaFipe && !(combDoSite === "gasolina" && combDaFipe === "flex")) continue;
    if (combDoSite === "diesel" && !combDaFipe) continue;
    // Versão turbo só vale pra carro turbo ("TSI", "THP" e "TURBO" no site contam como turbo).
    if (p.includes("tb") && !versao.some((w) => ["tb", "tsi", "tfsi", "thp", "tjet", "ecoboost"].includes(w) || /^\d{3}tsi$/.test(w))) continue;
    if (carroceria === "hatch" && p.includes("sedan")) continue;
    if (carroceria === "sedan" && p.includes("hatch")) continue;
    const portasDaFipe = portas(p);
    // Pontos: palavra de versão em comum (as neutras valem pouco).
    let pontos = 0;
    for (const w of new Set(versao)) {
      if (!p.includes(w)) continue;
      pontos += NEUTRAS.has(w) ? 0.2 : ehCilindrada(w) || ehCambio(w) ? 1 : 2;
    }
    // Palavra da FIPE que o site não tem (outra versão: LTZ quando o site diz LT) tira pontos.
    for (const w of new Set(p)) {
      if (versao.includes(w) || NEUTRAS.has(w) || ehCilindrada(w) || ehValvula(w) || ehCambio(w) || w.length < 2) continue;
      pontos -= 0.5;
    }
    if (portasDoSite && portasDaFipe) pontos += portasDoSite === portasDaFipe ? 0.6 : -1;
    pontuados.push({ modelo: m, pontos });
  }
  return pontuados.sort((a, b) => b.pontos - a.pontos);
}

/** Entre as versões que sobraram (as que têm o ano), um vencedor claro, uma faixa, ou nada. */
export function decidir(candidatos: Candidato[], maxNaFaixa = 4): Escolha {
  if (candidatos.length === 0) return { tipo: "nenhum", candidatos: [] };
  const ordem = [...candidatos].sort((a, b) => b.pontos - a.pontos);
  const melhor = ordem[0].pontos;
  const empatados = ordem.filter((c) => melhor - c.pontos < 0.5);
  if (empatados.length === 1) return { tipo: "exato", candidatos: empatados };
  if (empatados.length <= maxNaFaixa) return { tipo: "faixa", candidatos: empatados };
  // Empate demais é chute: melhor dizer que não achou.
  return { tipo: "nenhum", candidatos: [] };
}

/** Atalho sem conferir ano: o ranking e a decisão juntos. */
export function escolherModelo(carro: CarroParaFipe, modelos: ModeloFipe[], maxNaFaixa = 4): Escolha {
  return decidir(rankingDeModelos(carro, modelos), maxNaFaixa);
}

/** O código do ano na FIPE ("2021-5"), preferindo o combustível que a versão diz. */
export function escolherAno(anos: { code: string; name: string }[], carro: CarroParaFipe): string | null {
  if (!carro.anoModelo) return null;
  const doAno = anos.filter((a) => a.code.startsWith(`${carro.anoModelo}-`));
  if (doAno.length <= 1) return doAno[0]?.code ?? null;
  const v = palavras(`${carro.versao ?? ""} ${carro.titulo}`);
  const quer = v.includes("diesel") ? "diesel" : v.includes("gasolina") ? "gasolina" : v.includes("flex") ? "flex" : null;
  const achado = quer ? doAno.find((a) => semAcento(a.name).includes(quer)) : null;
  return (achado ?? doAno[0]).code;
}

/** "R$ 75.040,00" → 7504000. */
export function precoDaFipe(texto: string | undefined | null): number | null {
  if (!texto) return null;
  const m = /([\d.]+),(\d{2})/.exec(texto);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, "")) * 100 + Number(m[2]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
