// Ler e montar o "público" de um conjunto (idade, gênero, localização) a partir do `targeting` da Meta. Arquivo PURO (sem rede,
// sem banco): roda no servidor e no navegador, e é testado sozinho.
//
// ── O que se mexe, e o que NÃO se mexe ───────────────────────────────────
// Mexe: idade (age_min/age_max), gênero (genders), as localizações (países, estados, cidades com raio, pontos com raio) e
// o "alcançar mais pessoas" (Advantage+ público), que SEMPRE fica desligado.
// NÃO mexe: interesses/comportamentos (flexible_spec), públicos personalizados e semelhantes, exclusões, posicionamentos,
// idiomas… Tudo isso é copiado do conjunto como está: a escrita parte do `targeting` que a Meta acabou de devolver e troca só
// os campos acima, porque a Meta exige o objeto inteiro (mandar só a idade apagaria o resto).

export type GeneroDoPublico = "todos" | "homens" | "mulheres";

export interface LocalDoPublico {
  /** Tipo na tela. "ponto" = latitude/longitude com raio. */
  tipo: "pais" | "regiao" | "cidade" | "ponto";
  /** O código da Meta (cidades e estados). Países usam o código ("BR"). Pontos não têm. */
  chave: string | null;
  nome: string;
  /** "Paraná, Brasil", "Estado", "Ponto no mapa"… */
  detalhe: string;
  /** Raio em km. `null` = só a cidade/estado, sem raio. */
  raioKm: number | null;
  /** Só pontos: o objeto original da Meta (latitude, longitude, endereço…), guardado pra ser reenviado sem perda. */
  bruto?: Record<string, unknown>;
}

export interface PublicoDoConjunto {
  idadeMin: number;
  idadeMax: number;
  genero: GeneroDoPublico;
  locais: LocalDoPublico[];
  /** O "alcançar mais pessoas" (Advantage+ público) está ligado agora? `null` = a Meta não disse. */
  expansaoLigada: boolean | null;
  /** O que existe no conjunto e esta tela NÃO mexe ("2 interesses", "1 público personalizado"…). */
  outros: string[];
  /** Locais que esta tela não sabe editar (CEP, praça, mercado) e que ficam como estão. */
  locaisIntocados: string[];
}

export interface EdicaoDoPublico {
  idadeMin: number;
  idadeMax: number;
  genero: GeneroDoPublico;
  locais: LocalDoPublico[];
}

export const IDADE_MINIMA = 18;
export const IDADE_MAXIMA = 65;
/** Os raios que a Meta aceita pra cidade (km). Ponto aceita de 1 a 80. */
export const RAIOS_DA_CIDADE = [17, 25, 30, 40, 50, 65, 80];

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const lista = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj).filter((x): x is Obj => !!x) : []);
const txt = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Raio em km, venha em km ou em milhas. */
function raioEmKm(raio: unknown, unidade: unknown): number | null {
  const r = num(raio);
  if (r === null || r <= 0) return null;
  return txt(unidade) === "mile" ? Math.round(r * 1.609) : Math.round(r);
}

/** Lê o `targeting` da Meta. Pura. */
export function lerPublico(targeting: unknown): PublicoDoConjunto {
  const t = obj(targeting) ?? {};
  const generos = Array.isArray(t.genders) ? t.genders.map(Number) : [];
  const genero: GeneroDoPublico = generos.length === 1 && generos[0] === 1 ? "homens" : generos.length === 1 && generos[0] === 2 ? "mulheres" : "todos";

  const geo = obj(t.geo_locations) ?? {};
  const locais: LocalDoPublico[] = [];
  for (const p of Array.isArray(geo.countries) ? geo.countries : []) {
    locais.push({ tipo: "pais", chave: txt(p), nome: txt(p), detalhe: "País inteiro", raioKm: null });
  }
  for (const r of lista(geo.regions)) {
    locais.push({ tipo: "regiao", chave: txt(r.key), nome: txt(r.name) || txt(r.key), detalhe: ["Estado", txt(r.country)].filter(Boolean).join(" · "), raioKm: null });
  }
  for (const c of lista(geo.cities)) {
    locais.push({
      tipo: "cidade",
      chave: txt(c.key),
      nome: txt(c.name) || txt(c.key),
      detalhe: ["Cidade", txt(c.region)].filter(Boolean).join(" · "),
      raioKm: raioEmKm(c.radius, c.distance_unit),
    });
  }
  for (const p of lista(geo.custom_locations)) {
    locais.push({
      tipo: "ponto",
      chave: null,
      nome: txt(p.name) || txt(p.address_string) || "Ponto no mapa",
      detalhe: "Ponto no mapa",
      raioKm: raioEmKm(p.radius, p.distance_unit),
      bruto: p,
    });
  }

  const locaisIntocados: string[] = [];
  for (const [k, rotulo] of [["zips", "CEP"], ["places", "local"], ["geo_markets", "mercado"], ["electoral_district", "distrito eleitoral"]] as const) {
    const n = lista(geo[k]).length;
    if (n > 0) locaisIntocados.push(`${n} ${rotulo}${n > 1 ? (rotulo === "local" ? "is" : "s") : ""}`);
  }

  const outros: string[] = [];
  const fle = lista(t.flexible_spec);
  const interesses = fle.reduce((s, g) => s + lista(g.interests).length + lista(g.behaviors).length + lista(g.life_events).length + lista(g.work_positions).length, 0);
  if (interesses > 0) outros.push(`${interesses} ${interesses === 1 ? "interesse/comportamento" : "interesses/comportamentos"}`);
  const personalizados = lista(t.custom_audiences).length;
  if (personalizados > 0) outros.push(`${personalizados} ${personalizados === 1 ? "público personalizado" : "públicos personalizados"}`);
  const excluidos = lista(t.excluded_custom_audiences).length + (obj(t.exclusions) ? 1 : 0);
  if (excluidos > 0) outros.push("exclusões de público");
  if (Array.isArray(t.locales) && t.locales.length > 0) outros.push("idiomas");

  const auto = obj(t.targeting_automation);
  const adv = auto ? num(auto.advantage_audience) : null;
  return {
    idadeMin: num(t.age_min) ?? IDADE_MINIMA,
    idadeMax: num(t.age_max) ?? IDADE_MAXIMA,
    genero,
    locais,
    expansaoLigada: adv === null ? null : adv === 1,
    outros,
    locaisIntocados,
  };
}

/** Confere a edição. Devolve a frase do erro, ou null. Pura. */
export function conferirEdicao(e: EdicaoDoPublico): string | null {
  if (!Number.isInteger(e.idadeMin) || !Number.isInteger(e.idadeMax)) return "Idade inválida.";
  if (e.idadeMin < IDADE_MINIMA || e.idadeMax > IDADE_MAXIMA) return `A idade vai de ${IDADE_MINIMA} a ${IDADE_MAXIMA} anos.`;
  if (e.idadeMin > e.idadeMax) return "A idade mínima não pode ser maior que a máxima.";
  if (!["todos", "homens", "mulheres"].includes(e.genero)) return "Gênero inválido.";
  if (e.locais.length === 0) return "Deixe pelo menos uma localização.";
  if (e.locais.length > 25) return "Muitas localizações (máximo 25).";
  for (const l of e.locais) {
    if (l.tipo === "cidade" && l.raioKm !== null && (l.raioKm < 17 || l.raioKm > 80)) return `O raio de ${l.nome} precisa ficar entre 17 e 80 km.`;
    if (l.tipo === "ponto" && l.raioKm !== null && (l.raioKm < 1 || l.raioKm > 80)) return `O raio de ${l.nome} precisa ficar entre 1 e 80 km.`;
    if ((l.tipo === "cidade" || l.tipo === "regiao") && !l.chave) return `Falta o código da Meta de ${l.nome}.`;
    if (l.tipo === "ponto" && !l.bruto) return `O ponto ${l.nome} perdeu as coordenadas.`;
  }
  return null;
}

/**
 * O `targeting` novo: o atual com SÓ a idade, o gênero, as localizações e o "alcançar mais pessoas" trocados. Tudo o mais
 * (interesses, públicos, exclusões, posicionamentos, idiomas, e os tipos de local e os locais que esta tela não edita) segue igual.
 * Pura.
 */
export function montarTargeting(atual: unknown, e: EdicaoDoPublico): Obj {
  const novo: Obj = JSON.parse(JSON.stringify(obj(atual) ?? {}));
  novo.age_min = e.idadeMin;
  novo.age_max = e.idadeMax;
  if (e.genero === "homens") novo.genders = [1];
  else if (e.genero === "mulheres") novo.genders = [2];
  else delete novo.genders;

  const geo: Obj = { ...(obj(novo.geo_locations) ?? {}) };
  const paises = e.locais.filter((l) => l.tipo === "pais").map((l) => l.chave as string);
  const regioes = e.locais.filter((l) => l.tipo === "regiao").map((l) => ({ key: l.chave as string }));
  const cidades = e.locais
    .filter((l) => l.tipo === "cidade")
    .map((l) => (l.raioKm !== null ? { key: l.chave as string, radius: l.raioKm, distance_unit: "kilometer" } : { key: l.chave as string }));
  const pontos = e.locais
    .filter((l) => l.tipo === "ponto")
    .map((l) => ({ ...(l.bruto ?? {}), ...(l.raioKm !== null ? { radius: l.raioKm, distance_unit: "kilometer" } : {}) }));
  for (const [k, v] of [["countries", paises], ["regions", regioes], ["cities", cidades], ["custom_locations", pontos]] as const) {
    if (v.length > 0) geo[k] = v;
    else delete geo[k];
  }
  novo.geo_locations = geo;

  // "Alcançar mais pessoas" (Advantage+ público): SEMPRE desligado, e explícito (a Meta pede 1 ou 0 sem deixar em branco).
  // Com ele desligado, idade e gênero valem como LIMITE (some o "individual_setting", que é só do modo ligado).
  const auto: Obj = { ...(obj(novo.targeting_automation) ?? {}) };
  auto.advantage_audience = 0;
  delete auto.individual_setting;
  novo.targeting_automation = auto;
  return novo;
}

/** Uma frase curta do público, pra conferir antes de salvar e pro registro. Pura. */
export function resumoDoPublico(p: Pick<PublicoDoConjunto, "idadeMin" | "idadeMax" | "genero" | "locais">): string {
  const idade = `${p.idadeMin}–${p.idadeMax}${p.idadeMax >= IDADE_MAXIMA ? "+" : ""} anos`;
  const gen = p.genero === "todos" ? "todos os gêneros" : p.genero === "homens" ? "homens" : "mulheres";
  const locais = p.locais.map((l) => `${l.nome}${l.raioKm !== null ? ` +${l.raioKm} km` : ""}`).join(", ") || "sem localização";
  return `${idade} · ${gen} · ${locais}`;
}
