import "server-only";

import { prisma } from "@/lib/prisma";
import { canAccessModule } from "@/lib/permissions";
import { CARTEIRA, escopoDaCarteira } from "@/lib/carteira";
import { segundaDaSemana } from "@/lib/dia-da-casa";
import { diaDaEntrega } from "@/lib/gravacoes";
import { ETAPAS as ETAPAS_DE_IMPLANTACAO } from "@/lib/etapas-implantacao";
import { gravarEtapa } from "@/lib/etapas-gravar";
import { ETAPAS, marcosDaEtapa, sincronizarEventoDaVenda } from "@/lib/comercial/funil";
import { avisarMetaDaEtapa } from "@/lib/meta-capi";
import { numerosPorExtenso } from "@/lib/financeiro-ia/numeros-por-extenso";
import { dobrar, NOMES_DOS_DIAS, diaDeBrasilia, somarDias, lerDiaFuturo } from "@/lib/datas-da-conversa";
import { acharLojaNoTexto, type AcaoDeComercial, type LojaDaPessoa } from "./pausar-no-privado";
import { anotar } from "./trilha";

// Registrar o dia a dia pelo WhatsApp, no privado do robô: "visitei a Vilela", "anota na Vilela: …", "gravei na Vilela, 3
// carros", "entreguei", "mandei o relatório da Vilela", "acessos do cliente X completos" e, só pro dono, "reunião com a
// Garagem Y dia 25 às 15h" / "fechei a Garagem Y, R$ 1.800 por mês".
//
// ── As travas ───────────────────────────────────────────────────────────
//
//   1. Só frase AFIRMATIVA, no passado ("visitei", "gravei", "mandei o relatório"), sem "?". Pergunta continua sendo
//      pergunta pro Copiloto.
//   2. A loja sai da CARTEIRA de quem escreveu (a mesma régua da tela): gestora só registra nas lojas dela. Loja que não
//      é achada nunca é adivinhada — o robô pergunta.
//   3. Cada comando exige o mesmo acesso do módulo que ele mexe (gravações = Igor/gerência; implantação = gerência;
//      Comercial = só o dono). Sem acesso, o robô diz de quem é aquilo e não registra nada.
//   4. Registrar e repetir de volta é o que protege do engano: toda resposta diz EXATAMENTE o que foi gravado, e tudo é
//      desfazível na tela. Só o Comercial (muda funil e agenda) pede "sim" antes.
//   5. Mesmo efeito do botão da tela (mesma regra, mesmas tabelas): o autor fica sendo quem escreveu.

/** Dobra acento e caixa SEM mudar o tamanho do texto, pra usar a posição no texto original. Pura. */
export const dobrado = dobrar;
export { diaDeBrasilia, lerDiaFuturo };

export interface PessoaDoComando {
  id: string;
  name: string;
  role: "ADMIN" | "GERENTE" | "GESTOR_TRAFEGO" | string;
  email?: string | null;
}

export interface ComandoRespondido {
  tipo:
    | "visita"
    | "anotacao"
    | "gravacao"
    | "entrega"
    | "relatorio"
    | "etapa"
    | "pergunta"
    | "sem-acesso"
    | "comercial-pediu-confirmacao";
  resposta: string;
  /** Só o Comercial: o que fica esperando o "sim". */
  pendente: AcaoDeComercial | null;
}

// ─────────────────────────── datas e números ───────────────────────────────

const ymd = (x: { y: number; m: number; d: number }) => `${x.y}-${String(x.m).padStart(2, "0")}-${String(x.d).padStart(2, "0")}`;
const doisDigitos = (n: number) => String(n).padStart(2, "0");
const dataCurta = (x: { m: number; d: number }) => `${doisDigitos(x.d)}/${doisDigitos(x.m)}`;

/** Em que dia a visita/gravação aconteceu: hoje (padrão), ontem, anteontem ou o dia da semana que passou. Pura. */
export function diaDoRegistro(texto: string, agora: Date): { y: number; m: number; d: number; rotulo: string } {
  const t = dobrar(texto);
  const hoje = diaDeBrasilia(agora);
  if (/\banteontem\b/.test(t)) return { ...somarDias(hoje, -2), rotulo: "anteontem" };
  if (/\bontem\b/.test(t)) return { ...somarDias(hoje, -1), rotulo: "ontem" };
  for (let i = 0; i < 7; i++) {
    const nome = NOMES_DOS_DIAS[i];
    if (new RegExp(`\\b(na|no|em|do|da)\\s+${nome}\\b`).test(t) || new RegExp(`\\b${nome}(-feira)?\\s+passad`).test(t)) {
      const recuo = ((hoje.dow - i + 7) % 7) || 7;
      return { ...somarDias(hoje, -recuo), rotulo: nome === "sabado" || nome === "domingo" ? `${nome} passado` : `${nome}-feira` };
    }
  }
  return { ...hoje, rotulo: "hoje" };
}

/** Meio-dia UTC do dia: é como o sistema guarda "a data" sem escorregar de fuso. */
const meioDiaUtc = (x: { y: number; m: number; d: number }) => new Date(Date.UTC(x.y, x.m - 1, x.d, 12, 0, 0));

const QUANTIDADES: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
};

/** "3 carros", "três vídeos", "gravei 5". `null` = a frase não diz quantos. Pura. */
export function lerQuantidade(texto: string): number | null {
  const t = dobrar(texto);
  const palavras = Object.keys(QUANTIDADES).join("|");
  const objeto = "(carros?|veiculos?|videos?|reels?|gravacoes|unidades?|anuncios?)";
  const a = t.match(new RegExp(`\\b(\\d{1,2}|${palavras})\\s+${objeto}\\b`));
  const b = t.match(/\bgrav\w*\s+(\d{1,2})\b(?![/:h])/);
  const bruto = a?.[1] ?? b?.[1];
  if (!bruto) return null;
  const n = /^\d+$/.test(bruto) ? Number(bruto) : QUANTIDADES[bruto];
  return n >= 1 && n <= 50 ? n : null;
}

/** "R$ 1.800", "1800 por mês", "mil e oitocentos reais". `null` = sem valor. Pura. */
export function lerValor(texto: string): number | null {
  const t = numerosPorExtenso(texto);
  const re = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/gi;
  let melhor: { v: number; nota: number } | null = null;
  for (const m of t.matchAll(re)) {
    const antes = t.slice(Math.max(0, (m.index ?? 0) - 4), m.index ?? 0).toLowerCase();
    const depois = t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 18).toLowerCase();
    const v = Number(`${m[1].replaceAll(".", "")}${m[2] ? `.${m[2]}` : ""}`);
    if (!Number.isFinite(v) || v <= 0 || v > 500_000) continue;
    // Pedaço de data/hora não é dinheiro.
    if (/^\s*([/:]|h\b|horas?\b)/.test(depois) || /\bdia\s*$/.test(antes)) continue;
    const comRs = /r\$\s*$/i.test(t.slice(Math.max(0, (m.index ?? 0) - 4), (m.index ?? 0) + m[0].indexOf(m[1]))) || /^r\$/i.test(m[0]);
    const comMes = /^\s*(reais|por mes|ao mes|\/mes|mensais|mensal|mes\b)/i.test(dobrar(depois));
    const nota = (comRs ? 2 : 0) + (comMes ? 2 : 0);
    if (nota === 0) continue;
    if (!melhor || nota > melhor.nota) melhor = { v, nota };
  }
  return melhor?.v ?? null;
}

/** "às 15h", "15:30", "15h30", "às 3 da tarde", "meio-dia". `null` = sem hora. Pura. */
export function lerHora(texto: string): { h: number; min: number } | null {
  const t = dobrar(texto);
  if (/\bmeio[- ]?dia\b/.test(t)) return { h: 12, min: 0 };
  let m = t.match(/\b(\d{1,2})\s*(?:h|horas?|:)\s*(\d{2})?(?!\d)/);
  if (!m) m = t.match(/\bas\s+(\d{1,2})(?![\d/:])(?:\s*(?:e\s+)?(\d{2}))?/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (/\bda\s+(tarde|noite)\b/.test(t) && h < 12) h += 12;
  if (h > 23 || min > 59) return null;
  return { h, min };
}

// ─────────────────────────── reconhecer o comando ──────────────────────────

export type Comando = "visita" | "anotacao" | "gravacao" | "entrega" | "relatorio" | "etapa" | "reuniao" | "fechamento";

const ETAPAS_E_FRASES: { id: string; re: RegExp }[] = [
  { id: "ficha_conferida", re: /\bficha\b.*\bconferid|\bconferi\b.*\bficha/ },
  { id: "cliente_cadastrado", re: /\bcliente\b.*\bcadastrad|\bcadastrei\b/ },
  { id: "contrato_enviado", re: /\bcontrato\b.*\b(enviad|mandad)|\b(enviei|mandei)\b.*\bcontrato/ },
  { id: "contrato_assinado", re: /\bcontrato\b.*\bassinad|\bassinou\b.*\bcontrato|\bcontrato\b.*\bassinou/ },
  { id: "primeiro_pagamento", re: /\bprimeiro pagamento|\bpagou\b|\bpagamento\b.*\bconfirmad/ },
  { id: "grupo_criado", re: /\bgrupo\b.*\bcriad|\bcriei\b.*\bgrupo/ },
  { id: "acesso_meta", re: /\bacessos?\b.*\b(meta|business|bm)\b|\b(meta|business)\b.*\bacessos?\b/ },
  { id: "acesso_instagram", re: /\bacessos?\b.*\b(instagram|insta|pagina)\b|\b(instagram|insta)\b.*\bacessos?\b/ },
  { id: "reuniao_alinhamento", re: /\breuniao\b.*\balinhamento|\balinhamento\b/ },
  { id: "criativos_aprovados", re: /\bcriativos?\b.*\baprovad|\baprovou\b.*\bcriativ/ },
  { id: "campanha_no_ar", re: /\bcampanha\b.*\bno ar|\bno ar\b.*\bcampanha|\bsubi\b.*\bcampanha/ },
];

const PALAVRA_DE_FEITO =
  /\b(completo|completos|completa|completas|ok|pronto|prontos|pronta|feito|feita|feitos|recebido|recebidos|recebi|liberado|liberados|liberou|conferid\w*|enviad\w*|enviei|mandad\w*|mandei|assinad\w*|assinou|pagou|criad\w*|criei|aprovad\w*|aprovou|no ar|cadastrad\w*|cadastrei|subi|confirmad\w*)\b/;

/** Quais etapas de implantação a frase diz que ficaram prontas. Pura. */
export function etapasDaFrase(texto: string): string[] {
  const t = dobrar(texto);
  if (/\b(falta|faltam|faltou|ainda nao|nao|pendente|sem)\b/.test(t)) return [];
  if (!PALAVRA_DE_FEITO.test(t)) return [];
  const ids = new Set(ETAPAS_E_FRASES.filter((e) => e.re.test(t)).map((e) => e.id));
  // "acessos do cliente X completos": acesso sem dizer qual = os dois.
  if (ids.size === 0 && /\bacessos?\b/.test(t) && /\b(completo|completos|completa|todos|tudo|recebidos|liberados)\b/.test(t)) {
    ids.add("acesso_meta");
    ids.add("acesso_instagram");
  }
  // Só as que existem na lista de hoje.
  return [...ids].filter((id) => ETAPAS_DE_IMPLANTACAO.some((e) => e.id === id));
}

const PALAVRA_DE_PERGUNTA = /^(quando|qual|quais|quem|quanto|quantos|quantas|como|onde|por que|porque|sera|me diz|me fala|me mostra|mostra|lista)\b/;

/**
 * A frase é um dos comandos do dia a dia? `null` = não, é conversa/pergunta (segue pro Copiloto). Pura: não diz se a loja
 * existe, só que a frase tem a forma de um registro.
 */
export function qualComando(texto: string, agora = new Date()): Comando | null {
  const original = texto.trim();
  if (!original || original.length > 700) return null;
  if (/[?]/.test(original)) return null;
  const t = dobrar(original).replace(/\s+/g, " ").trim();
  if (PALAVRA_DE_PERGUNTA.test(t)) return null;

  if (/^(anota|anote|anotar|anotei)\b/.test(t)) return "anotacao";

  // "não mandei o relatório", "ainda não gravei": é o contrário de um registro.
  if (/\b(nao|nunca|ainda nao|falta|faltou|faltam|esqueci|sem)\b/.test(t) && !/\b(fechei|fechamos|fechou)\b/.test(t)) return null;

  if (/\b(fechei|fechamos|fechou)\b/.test(t) && (/\b(por mes|ao mes|\/mes|mensal|mensalidade|contrato)\b/.test(t) || lerValor(original) !== null)) return "fechamento";

  const dia = lerDiaFuturo(t, agora);
  if (/\breuni(ao|oes)\b/.test(t) && !/\balinhamento\b/.test(t) && /\b(com|na|no|c\/)\b/.test(t) && dia && !/\b(foi|fiz|fizemos|aconteceu|ontem)\b/.test(t)) return "reuniao";

  if (/\b(mandei|enviei|enviamos|mandamos|enviado|mandado)\b/.test(t) && /\brelatorios?\b/.test(t)) return "relatorio";
  if (/\b(gravei|gravamos|gravacao feita|fiz (a |uma )?gravacao)\b/.test(t)) return "gravacao";
  if (/\b(entreguei|entregamos|entrega feita|dei baixa)\b/.test(t) && /\b(video|videos|gravacao|gravacoes|entrega|carro|carros|material)\b|\b(na|no|da|do)\b/.test(t)) return "entrega";
  if (/\b(visitei|visitamos|fiz (a |uma )?visita|fui visitar|estive (na|no|em))\b/.test(t)) return "visita";
  if (etapasDaFrase(original).length > 0) return "etapa";
  return null;
}

// ─────────────────────────── achar a loja ──────────────────────────────────

async function lojasDaPessoa(pessoa: PessoaDoComando): Promise<LojaDaPessoa[]> {
  const clientes = await prisma.client.findMany({
    where: { ...CARTEIRA, ...escopoDaCarteira({ id: pessoa.id, role: pessoa.role as "ADMIN" }) },
    select: { id: true, companyName: true },
    orderBy: { companyName: "asc" },
  });
  return clientes.map((c) => ({ id: c.id, nome: c.companyName }));
}

type Achada = { loja: LojaDaPessoa } | { resposta: string } | null;

async function acharLoja(pessoa: PessoaDoComando, texto: string, perguntar: boolean, oque: string): Promise<Achada> {
  const lojas = await lojasDaPessoa(pessoa);
  const r = acharLojaNoTexto(texto, lojas);
  if (r.ambiguas.length > 0) {
    return { resposta: `Você citou mais de uma loja (${r.ambiguas.map((l) => `*${l.nome}*`).join(", ")}). Me manda uma de cada vez${oque ? ` — ${oque}` : ""}.` };
  }
  if (r.loja) return { loja: r.loja };
  if (!perguntar) return null;
  return {
    resposta:
      `Não achei de qual loja você está falando${oque ? ` (${oque})` : ""}. Ou ela não está na sua carteira, ou faltou o nome.\n` +
      `Me manda de novo com o nome da loja. Ex.: *visitei a ${lojas[0]?.nome ?? "Vilela"}*.`,
  };
}

const negrito = (s: string) => `*${s}*`;
const primeiroNome = (n: string) => n.trim().split(/\s+/)[0];

// ─────────────────────────── os comandos ───────────────────────────────────

/** A nota: o que vem depois do nome da loja ("…a Vilela, conversei com o dono sobre o estoque"). */
export function notaDaVisita(texto: string): string | null {
  const t = dobrar(texto);
  const marcador = t.match(/[:;,]\s+|\s+-\s+|\.\s+|\s(?:e|,)?\s*(?:conversei|falei|combinei|deixei|apresentei|levei|percebi|vi que|o dono|a dona|o gerente|a gerente|ele|ela)\b/);
  if (!marcador || marcador.index === undefined) return null;
  const inicio = /^[:;,.\s-]/.test(marcador[0]) || /^\s*[:;,]/.test(marcador[0]) ? marcador.index + marcador[0].length : marcador.index + (marcador[0].match(/^\s*(?:e|,)?\s*/)?.[0].length ?? 0);
  const nota = texto.slice(inicio).replace(/^[\s,;:.-]+/, "").trim();
  return nota.length >= 12 ? nota.slice(0, 600) : null;
}

async function registrarVisita(pessoa: PessoaDoComando, texto: string, agora: Date): Promise<ComandoRespondido> {
  const achada = await acharLoja(pessoa, texto, true, "qual loja você visitou");
  if (!achada) throw new Error("inalcançável");
  if ("resposta" in achada) return { tipo: "pergunta", resposta: achada.resposta, pendente: null };

  const dia = diaDoRegistro(texto, agora);
  await prisma.client.update({ where: { id: achada.loja.id }, data: { ultimaVisitaEm: meioDiaUtc(dia) } });

  const nota = notaDaVisita(texto);
  if (nota) {
    await prisma.clientHistory.create({
      data: { clientId: achada.loja.id, note: `📍 Visita (pelo WhatsApp): ${nota}`, authorId: pessoa.id },
    });
  }
  return {
    tipo: "visita",
    pendente: null,
    resposta:
      `📍 Visita registrada: ${negrito(achada.loja.nome)} — ${dia.rotulo} (${dataCurta(dia)}).` +
      (nota ? `\n📝 Anotei no histórico da loja: “${nota}”` : "\nSe quiser guardar o que rolou, manda: *anota na " + achada.loja.nome + ": …*"),
  };
}

/** Separa "anota na Vilela: o dono quer trocar o carro" em loja + texto. Pura. */
export function separarAnotacao(texto: string): { cabeca: string; nota: string } | null {
  const t = dobrar(texto);
  const doisPontos = t.match(/[:;]\s*/);
  if (doisPontos && doisPontos.index !== undefined) {
    const nota = texto.slice(doisPontos.index + doisPontos[0].length).trim();
    return nota.length >= 3 ? { cabeca: texto.slice(0, doisPontos.index), nota } : null;
  }
  const que = t.match(/\s(que|dizendo|sobre)\s+/);
  if (que && que.index !== undefined) {
    const nota = texto.slice(que.index + que[0].length).trim();
    return nota.length >= 3 ? { cabeca: texto.slice(0, que.index), nota } : null;
  }
  const virgula = t.match(/,\s*/);
  if (virgula && virgula.index !== undefined) {
    const nota = texto.slice(virgula.index + virgula[0].length).trim();
    return nota.length >= 3 ? { cabeca: texto.slice(0, virgula.index), nota } : null;
  }
  return null;
}

async function registrarAnotacao(pessoa: PessoaDoComando, texto: string): Promise<ComandoRespondido> {
  const partes = separarAnotacao(texto);
  if (!partes) {
    return {
      tipo: "pergunta",
      pendente: null,
      resposta: "Anotar o quê, e em qual loja? Escreve assim: *anota na Vilela: o dono quer trocar o carro da vitrine*.",
    };
  }
  const achada = await acharLoja(pessoa, partes.cabeca, true, "em qual loja anotar");
  if (!achada) throw new Error("inalcançável");
  if ("resposta" in achada) return { tipo: "pergunta", resposta: achada.resposta, pendente: null };

  const nota = partes.nota.slice(0, 1500);
  await prisma.clientHistory.create({ data: { clientId: achada.loja.id, note: nota, authorId: pessoa.id } });
  return { tipo: "anotacao", pendente: null, resposta: `📝 Anotado no histórico da ${negrito(achada.loja.nome)}:\n“${nota}”` };
}

const SO_PRO_IGOR = "Gravação e entrega são lançadas pelo Igor ou pela gerência — não registrei nada. Se foi você que gravou, fala com o Igor pra lançar.";

async function registrarGravacao(pessoa: PessoaDoComando, texto: string, agora: Date): Promise<ComandoRespondido> {
  if (!canAccessModule(pessoa.role as "ADMIN", "gravacoes", pessoa.email)) return { tipo: "sem-acesso", pendente: null, resposta: SO_PRO_IGOR };

  const achada = await acharLoja(pessoa, texto, true, "em qual loja foi a gravação");
  if (!achada) throw new Error("inalcançável");
  if ("resposta" in achada) return { tipo: "pergunta", resposta: achada.resposta, pendente: null };

  const quantidade = lerQuantidade(texto);
  if (!quantidade) {
    return { tipo: "pergunta", pendente: null, resposta: `Quantos carros você gravou na ${negrito(achada.loja.nome)}? Me manda de novo com o número. Ex.: *gravei na ${achada.loja.nome}, 3 carros*.` };
  }

  const dia = diaDoRegistro(texto, agora);
  const hoje = ymd(dia);
  // Mesma gravação (loja + dia + quantidade) mandada duas vezes não vira duas.
  const inicio = new Date(Date.UTC(dia.y, dia.m - 1, dia.d, 3, 0, 0));
  const repetida = await prisma.gravacao.findFirst({
    where: { clientId: achada.loja.id, quantidade, gravadoEm: { gte: inicio, lt: new Date(inicio.getTime() + 86_400_000) } },
    select: { id: true },
  });
  if (repetida) {
    return { tipo: "gravacao", pendente: null, resposta: `Essa gravação já estava lançada: ${negrito(achada.loja.nome)}, ${quantidade} ${quantidade === 1 ? "carro" : "carros"}, ${dia.rotulo}. Não dupliquei.` };
  }

  const entrega = diaDaEntrega(hoje);
  await prisma.gravacao.create({
    data: {
      empresa: "AGENCIA",
      clientId: achada.loja.id,
      loja: achada.loja.nome,
      quantidade,
      gravadoEm: dia.rotulo === "hoje" ? agora : new Date(Date.UTC(dia.y, dia.m - 1, dia.d, 15, 0, 0)),
      entregaEm: new Date(`${entrega}T00:00`),
      observacao: "Lançada pelo WhatsApp",
      ownerId: pessoa.id,
    },
  });
  const [, mes, d] = entrega.split("-");
  return {
    tipo: "gravacao",
    pendente: null,
    resposta: `🎬 Gravação registrada: ${negrito(achada.loja.nome)} — ${quantidade} ${quantidade === 1 ? "carro" : "carros"} (${dia.rotulo}).\nEntrega prevista: ${d}/${mes}. Quando entregar, manda *entreguei ${achada.loja.nome}*.`,
  };
}

async function darBaixaNaEntrega(pessoa: PessoaDoComando, texto: string, agora: Date): Promise<ComandoRespondido | null> {
  if (!canAccessModule(pessoa.role as "ADMIN", "gravacoes", pessoa.email)) {
    // "entreguei" é palavra comum: sem acesso, só responde se a frase deixa claro que é entrega de vídeo.
    return /\b(video|videos|gravacao|gravacoes)\b/.test(dobrar(texto)) ? { tipo: "sem-acesso", pendente: null, resposta: SO_PRO_IGOR } : null;
  }
  const achada = await acharLoja(pessoa, texto, false, "");
  if (!achada) return null; // "entreguei" sem loja conhecida: pode ser outra coisa, segue o fluxo normal
  if ("resposta" in achada) return { tipo: "pergunta", resposta: achada.resposta, pendente: null };

  const pendentes = await prisma.gravacao.findMany({
    where: { clientId: achada.loja.id, entregueEm: null },
    orderBy: { gravadoEm: "asc" },
    select: { id: true, quantidade: true, gravadoEm: true },
  });
  if (pendentes.length === 0) {
    return { tipo: "entrega", pendente: null, resposta: `A ${negrito(achada.loja.nome)} não tem entrega pendente. Nada a dar baixa.` };
  }
  const alvo = pendentes[0];
  await prisma.gravacao.update({ where: { id: alvo.id }, data: { entregueEm: agora } });
  const dia = dataCurta(diaDeBrasilia(alvo.gravadoEm));
  const sobra = pendentes.length - 1;
  return {
    tipo: "entrega",
    pendente: null,
    resposta:
      `📦 Entrega dada como feita: ${negrito(achada.loja.nome)} — gravação de ${dia} (${alvo.quantidade} ${alvo.quantidade === 1 ? "carro" : "carros"}).` +
      (sobra > 0 ? `\nAinda ${sobra === 1 ? "tem 1 gravação" : `tem ${sobra} gravações`} dessa loja esperando entrega.` : ""),
  };
}

async function marcarRelatorio(pessoa: PessoaDoComando, texto: string, agora: Date): Promise<ComandoRespondido> {
  const achada = await acharLoja(pessoa, texto, true, "de qual loja foi o relatório");
  if (!achada) throw new Error("inalcançável");
  if ("resposta" in achada) return { tipo: "pergunta", resposta: achada.resposta, pendente: null };

  const semana = segundaDaSemana(agora);
  const ja = await prisma.relatorioEnviado.findUnique({ where: { clientId_semana: { clientId: achada.loja.id, semana } }, select: { id: true } });
  await prisma.relatorioEnviado.upsert({
    where: { clientId_semana: { clientId: achada.loja.id, semana } },
    update: {},
    create: { clientId: achada.loja.id, semana, quemId: pessoa.id },
  });
  return {
    tipo: "relatorio",
    pendente: null,
    resposta: ja
      ? `O relatório da ${negrito(achada.loja.nome)} já estava marcado como enviado nesta semana.`
      : `📊 Relatório da ${negrito(achada.loja.nome)} marcado como *enviado* nesta semana.`,
  };
}

async function marcarEtapas(pessoa: PessoaDoComando, texto: string): Promise<ComandoRespondido | null> {
  const chaves = etapasDaFrase(texto);
  if (chaves.length === 0) return null;
  if (!canAccessModule(pessoa.role as "ADMIN", "formularios", pessoa.email)) {
    return { tipo: "sem-acesso", pendente: null, resposta: "A implantação de cliente novo é com a Andrielli e a gerência — não marquei nada." };
  }
  const fichas = await prisma.clientOnboarding.findMany({
    where: { status: { not: "CONCLUIDO" } },
    select: { id: true, companyName: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const r = acharLojaNoTexto(texto, fichas.map((f) => ({ id: f.id, nome: f.companyName })));
  if (r.ambiguas.length > 0) {
    return { tipo: "pergunta", pendente: null, resposta: `Achei mais de uma ficha de implantação (${r.ambiguas.map((l) => negrito(l.nome)).join(", ")}). Me manda uma de cada vez.` };
  }
  if (!r.loja) {
    // Só responde se a frase fala de cliente/implantação; do contrário não era comigo.
    return /\b(cliente|implantacao|ficha)\b/.test(dobrar(texto))
      ? { tipo: "pergunta", pendente: null, resposta: "Não achei uma ficha de implantação aberta com esse nome. Confere o nome do cliente (ele precisa estar em *Formulários*, ainda em implantação) e me manda de novo." }
      : null;
  }
  const rotulos: string[] = [];
  for (const chave of chaves) {
    await gravarEtapa(r.loja.id, chave, pessoa.id);
    rotulos.push(ETAPAS_DE_IMPLANTACAO.find((e) => e.id === chave)?.label ?? chave);
  }
  return {
    tipo: "etapa",
    pendente: null,
    resposta:
      `✅ Implantação da ${negrito(r.loja.nome)} — marquei:\n` +
      rotulos.map((x) => `• ${x}`).join("\n") +
      (chaves.includes("campanha_no_ar") ? "\n\n🎉 Com a campanha no ar, a implantação foi encerrada." : ""),
  };
}

// ─────────────────────────── Comercial (só o dono) ─────────────────────────

const CORTE_DO_NOME_DA_REUNIAO =
  /\b(dia\s+\d|amanha|depois de amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo|as\s+\d|\d{1,2}\s*(h\b|horas?|:)|\d{1,2}\/\d{1,2}|meio[- ]?dia)/;

/** O nome da empresa depois de "reunião com …", cortado onde começa a data/hora. Pura. */
export function nomeNaReuniao(texto: string): string | null {
  const t = dobrar(texto);
  const ini = t.match(/\breuni(?:ao|oes)\b(?:\s+\w+){0,2}?\s+(?:com|na|no|c\/)\s+(?:(?:a|o|as|os)\s+)?/);
  if (!ini || ini.index === undefined) return null;
  const comeco = ini.index + ini[0].length;
  const resto = t.slice(comeco);
  const corte = resto.match(CORTE_DO_NOME_DA_REUNIAO);
  const fim = corte?.index !== undefined ? comeco + corte.index : texto.length;
  const nome = texto.slice(comeco, fim).replace(/[\s,.;:–-]+$/g, "").replace(/\s+(para|pra|em|no|na|as|às)$/i, "").trim();
  return nome.length >= 2 ? nome.slice(0, 80) : null;
}

/** O nome da empresa depois de "fechei …". Pura. */
export function nomeNoFechamento(texto: string): string | null {
  const t = dobrar(texto);
  const ini = t.match(/\b(?:fechei|fechamos|fechou)\b\s*(?:(?:o|a)\s+)?(?:contrato|venda|negocio)?\s*(?:com|da|do|de|na|no)?\s*(?:(?:a|o|as|os)\s+)?/);
  if (!ini || ini.index === undefined) return null;
  const comeco = ini.index + ini[0].length;
  const resto = t.slice(comeco);
  const corte = resto.match(/[,;:]|\bpor\b|\br\$|\d|\bem\b|\bmensal|\bao mes\b|\bde\s+mil\b|\bhoje\b|\bagora\b/);
  const fim = corte?.index !== undefined ? comeco + corte.index : texto.length;
  const nome = texto.slice(comeco, fim).replace(/[\s,.;:–-]+$/g, "").trim();
  return nome.length >= 2 ? nome.slice(0, 80) : null;
}

interface LeadAchado {
  id: string;
  companyName: string;
  stage: string;
  monthlyValue: unknown;
}

/** Acha o lead pelo nome: igual ou contido (um no outro). `ambiguos` = mais de um. Pura. */
export function acharLead(nome: string, leads: LeadAchado[]): { lead: LeadAchado | null; ambiguos: LeadAchado[] } {
  const alvo = dobrar(nome).replace(/[^a-z0-9]+/g, " ").trim();
  const limpa = (l: LeadAchado) => dobrar(l.companyName).replace(/[^a-z0-9]+/g, " ").trim();
  const iguais = leads.filter((l) => limpa(l) === alvo);
  if (iguais.length === 1) return { lead: iguais[0], ambiguos: [] };
  if (iguais.length > 1) return { lead: null, ambiguos: iguais };
  const contidos = leads.filter((l) => {
    const n = limpa(l);
    return n.length >= 3 && alvo.length >= 3 && (n.includes(alvo) || alvo.includes(n));
  });
  if (contidos.length === 1) return { lead: contidos[0], ambiguos: [] };
  if (contidos.length > 1) return { lead: null, ambiguos: contidos };
  // Sem "palavra única": "Outra Garagem" não pode cair no lead "Garagem Y" só porque as duas têm "garagem". Na dúvida o robô
  // mostra "vou criar um lead novo" na confirmação, e o dono vê antes do "sim".
  return { lead: null, ambiguos: [] };
}

const NOME_DA_ETAPA: Record<string, string> = {
  LEAD: "Lead",
  QUALIFICADO: "Qualificado",
  REUNIAO_AGENDADA: "Reunião agendada",
  REUNIAO_REALIZADA: "Reunião realizada",
  PROPOSTA: "Proposta",
  NEGOCIACAO: "Negociação",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

const reais = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

const quandoPorExtenso = (iso: string) => {
  const d = new Date(iso);
  const b = new Date(d.getTime() - 3 * 3600_000);
  const dia = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][b.getUTCDay()];
  return `${dia}, ${doisDigitos(b.getUTCDate())}/${doisDigitos(b.getUTCMonth() + 1)} às ${doisDigitos(b.getUTCHours())}:${doisDigitos(b.getUTCMinutes())}`;
};

async function montarReuniao(pessoa: PessoaDoComando, texto: string, agora: Date): Promise<ComandoRespondido> {
  const nome = nomeNaReuniao(texto);
  if (!nome) return { tipo: "pergunta", pendente: null, resposta: "Com quem é a reunião? Escreve assim: *reunião com a Garagem Y dia 25 às 15h*." };
  const dia = lerDiaFuturo(texto, agora);
  const hora = lerHora(texto);
  if (!dia) return { tipo: "pergunta", pendente: null, resposta: `Em que dia é a reunião com ${negrito(nome)}? Ex.: *reunião com ${nome} dia 25 às 15h*.` };
  if (!hora) return { tipo: "pergunta", pendente: null, resposta: `A que horas é a reunião com ${negrito(nome)} (${dataCurta(dia)})? Ex.: *reunião com ${nome} dia ${dia.d} às 15h*.` };

  const quando = new Date(Date.UTC(dia.y, dia.m - 1, dia.d, hora.h + 3, hora.min));
  if (quando.getTime() < agora.getTime() - 30 * 60_000) {
    return { tipo: "pergunta", pendente: null, resposta: `Esse horário (${quandoPorExtenso(quando.toISOString())}) já passou. Me manda a data certa.` };
  }

  const leads = await prisma.lead.findMany({
    where: { empresa: "AGENCIA", stage: { not: "PERDIDO" } },
    select: { id: true, companyName: true, stage: true, monthlyValue: true },
  });
  const { lead, ambiguos } = acharLead(nome, leads);
  if (ambiguos.length > 0) {
    return { tipo: "pergunta", pendente: null, resposta: `Tem mais de um lead parecido com “${nome}”: ${ambiguos.map((l) => negrito(l.companyName)).join(", ")}. Me manda o nome completo.` };
  }

  const linhas = [
    "📅 Vou registrar no Comercial:",
    `• Reunião com ${negrito(lead?.companyName ?? nome)} — ${quandoPorExtenso(quando.toISOString())}`,
    lead
      ? `• Lead que já existe (${NOME_DA_ETAPA[lead.stage] ?? lead.stage})${ETAPAS.indexOf(lead.stage as (typeof ETAPAS)[number]) < ETAPAS.indexOf("REUNIAO_AGENDADA") ? " → vai pra *Reunião agendada*" : " — a etapa continua a mesma"}`
      : "• Não achei esse lead no funil: vou *criar um novo* já em *Reunião agendada*",
    "• Entra na sua Agenda (1 hora)",
    "",
    "Confirma? Responde *sim* ou *não*.",
  ];
  return {
    tipo: "comercial-pediu-confirmacao",
    resposta: linhas.join("\n"),
    pendente: { tipo: "comercial", acao: "reuniao", leadId: lead?.id ?? null, nome: lead?.companyName ?? nome, quandoISO: quando.toISOString(), valorMensal: null, pedido: texto.slice(0, 300) },
  };
}

async function montarFechamento(pessoa: PessoaDoComando, texto: string): Promise<ComandoRespondido> {
  const nome = nomeNoFechamento(texto);
  if (!nome) return { tipo: "pergunta", pendente: null, resposta: "Quem fechou? Escreve assim: *fechei a Garagem Y, R$ 1.800 por mês*." };

  const leads = await prisma.lead.findMany({
    where: { empresa: "AGENCIA" },
    select: { id: true, companyName: true, stage: true, monthlyValue: true },
  });
  const { lead, ambiguos } = acharLead(nome, leads);
  if (ambiguos.length > 0) {
    return { tipo: "pergunta", pendente: null, resposta: `Tem mais de um lead parecido com “${nome}”: ${ambiguos.map((l) => negrito(l.companyName)).join(", ")}. Me manda o nome completo.` };
  }
  const dito = lerValor(texto);
  const doLead = lead ? Number(lead.monthlyValue) : 0;
  const valor = dito ?? (doLead > 0 ? doLead : null);
  if (!valor) {
    return { tipo: "pergunta", pendente: null, resposta: `Fechou com ${negrito(lead?.companyName ?? nome)} por quanto por mês? Ex.: *fechei a ${nome}, R$ 1.800 por mês*.` };
  }
  if (lead?.stage === "FECHADO" && Math.abs(doLead - valor) < 0.005) {
    return { tipo: "comercial-pediu-confirmacao", pendente: null, resposta: `A ${negrito(lead.companyName)} já está como *Fechada* por ${reais(doLead)}/mês. Não mudei nada.` };
  }

  const linhas = [
    "🤝 Vou registrar no Comercial:",
    `• *${lead?.companyName ?? nome}* — fechada por ${negrito(`${reais(valor)}/mês`)}`,
    lead
      ? `• Lead que já existe (${NOME_DA_ETAPA[lead.stage] ?? lead.stage}) → vai pra *Fechado*${dito && doLead > 0 && doLead !== dito ? ` (o valor muda de ${reais(doLead)} pra ${reais(dito)})` : ""}`
      : "• Não achei esse lead no funil: vou *criar um novo* já em *Fechado*",
    "• Conta como venda no painel de metas e avisa a Meta (otimização por venda)",
    "",
    "Confirma? Responde *sim* ou *não*.",
  ];
  void pessoa;
  return {
    tipo: "comercial-pediu-confirmacao",
    resposta: linhas.join("\n"),
    pendente: { tipo: "comercial", acao: "fechamento", leadId: lead?.id ?? null, nome: lead?.companyName ?? nome, quandoISO: null, valorMensal: valor, pedido: texto.slice(0, 300) },
  };
}

/** Executa o que o dono confirmou no Comercial. */
export async function executarComercial(
  pessoa: PessoaDoComando,
  acao: AcaoDeComercial,
  agora: Date,
  messageId?: string | null,
): Promise<{ resposta: string }> {
  if (!canAccessModule(pessoa.role as "ADMIN", "comercial", pessoa.email)) return { resposta: "O Comercial é só do dono. Não registrei nada." };

  if (acao.acao === "reuniao") {
    const quando = new Date(acao.quandoISO ?? "");
    if (Number.isNaN(quando.getTime())) return { resposta: "Não consegui entender a data da reunião. Me manda de novo." };

    let leadId = acao.leadId;
    let criado = false;
    if (leadId) {
      const lead = await prisma.lead.findFirst({ where: { id: leadId, empresa: "AGENCIA" } });
      if (!lead) return { resposta: "Esse lead não existe mais no funil. Me manda a reunião de novo." };
      const antes = ETAPAS.indexOf(lead.stage as (typeof ETAPAS)[number]);
      // Só avança: reunião marcada com quem já está em proposta não faz o cartão voltar de coluna.
      if (antes < ETAPAS.indexOf("REUNIAO_AGENDADA") || lead.stage === "PERDIDO") {
        const marcos = marcosDaEtapa("REUNIAO_AGENDADA", agora);
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            stage: "REUNIAO_AGENDADA",
            qualifiedAt: lead.qualifiedAt ?? marcos.qualifiedAt ?? null,
            meetingSetAt: lead.meetingSetAt ?? marcos.meetingSetAt ?? null,
            lostAt: null,
            lostReason: null,
            noShowAt: null,
          },
        });
      } else if (lead.noShowAt) {
        await prisma.lead.update({ where: { id: lead.id }, data: { noShowAt: null, meetingSetAt: agora } });
      }
    } else {
      const marcos = marcosDaEtapa("REUNIAO_AGENDADA", agora);
      const novo = await prisma.lead.create({
        data: {
          empresa: "AGENCIA",
          companyName: acao.nome,
          contactName: acao.nome,
          channel: "PRESENCIAL",
          stage: "REUNIAO_AGENDADA",
          ownerId: pessoa.id,
          notes: "Criado pelo WhatsApp ao marcar a reunião.",
          qualifiedAt: marcos.qualifiedAt ?? null,
          meetingSetAt: marcos.meetingSetAt ?? null,
        },
      });
      leadId = novo.id;
      criado = true;
    }

    const titulo = `Reunião — ${acao.nome}`;
    const jaTem = await prisma.agendaItem.findFirst({ where: { ownerId: pessoa.id, type: "REUNIAO", title: titulo, startAt: quando }, select: { id: true } });
    if (!jaTem) {
      await prisma.agendaItem.create({
        data: { ownerId: pessoa.id, type: "REUNIAO", title: titulo, startAt: quando, endAt: new Date(quando.getTime() + 3600_000), notes: "Marcada pelo WhatsApp." },
      });
    }
    await avisarMetaDaEtapa(leadId).catch((e) => console.error("[meta] aviso falhou", e));
    await anotar(messageId, "privado comercial", "comercial-reuniao", `${criado ? "lead novo" : "lead existente"}`);
    return {
      resposta: `✅ Reunião com ${negrito(acao.nome)} marcada para ${quandoPorExtenso(quando.toISOString())}.\n• ${criado ? "Criei o lead no funil" : "Funil em dia"} (Reunião agendada)\n• ${jaTem ? "Já estava" : "Entrou"} na sua Agenda`,
    };
  }

  // ── fechamento ──
  const valor = acao.valorMensal;
  if (!valor || valor <= 0) return { resposta: "Faltou o valor mensal. Me manda de novo: *fechei a Garagem Y, R$ 1.800 por mês*." };
  const marcos = marcosDaEtapa("FECHADO", agora);
  let lead;
  if (acao.leadId) {
    const atual = await prisma.lead.findFirst({ where: { id: acao.leadId, empresa: "AGENCIA" } });
    if (!atual) return { resposta: "Esse lead não existe mais no funil. Me manda o fechamento de novo." };
    lead = await prisma.lead.update({
      where: { id: atual.id },
      data: {
        stage: "FECHADO",
        monthlyValue: valor,
        qualifiedAt: atual.qualifiedAt ?? marcos.qualifiedAt ?? null,
        meetingSetAt: atual.meetingSetAt ?? marcos.meetingSetAt ?? null,
        meetingHeldAt: atual.meetingHeldAt ?? marcos.meetingHeldAt ?? null,
        proposalAt: atual.proposalAt ?? marcos.proposalAt ?? null,
        wonAt: atual.wonAt ?? agora,
        lostAt: null,
        lostReason: null,
      },
    });
  } else {
    lead = await prisma.lead.create({
      data: {
        empresa: "AGENCIA",
        companyName: acao.nome,
        contactName: acao.nome,
        channel: "PRESENCIAL",
        stage: "FECHADO",
        ownerId: pessoa.id,
        monthlyValue: valor,
        notes: "Criado pelo WhatsApp ao registrar o fechamento.",
        qualifiedAt: marcos.qualifiedAt ?? null,
        meetingSetAt: marcos.meetingSetAt ?? null,
        meetingHeldAt: marcos.meetingHeldAt ?? null,
        proposalAt: marcos.proposalAt ?? null,
        wonAt: agora,
      },
    });
  }
  await sincronizarEventoDaVenda(lead).catch((e) => console.error("[comercial] evento da venda falhou", e));
  await avisarMetaDaEtapa(lead.id).catch((e) => console.error("[meta] aviso falhou", e));
  await anotar(messageId, "privado comercial", "comercial-fechamento", `${reais(valor)}/mês`);
  return {
    resposta:
      `🎉 Fechamento registrado: ${negrito(lead.companyName)} — ${reais(valor)}/mês.\n• Funil: *Fechado*\n• Entrou no painel de vendas e metas\n` +
      `Falta só cadastrar o cliente e abrir a implantação no sistema (Clientes / Formulários).`,
  };
}

// ─────────────────────────── a porta de entrada ────────────────────────────

/**
 * Trata a mensagem se ela for um comando do dia a dia. `null` = não é, segue o fluxo normal (Copiloto).
 * Nunca estoura por causa de frase estranha: erro de banco sobe (quem chama anota na trilha).
 */
export async function tratarComandoDoDia(
  pessoa: PessoaDoComando,
  texto: string,
  agora: Date,
  messageId?: string | null,
): Promise<ComandoRespondido | null> {
  const comando = qualComando(texto, agora);
  if (!comando) return null;

  let r: ComandoRespondido | null = null;
  switch (comando) {
    case "visita":
      // "estive na loja" sem loja citada pode ser conversa: só responde se achar a loja ou se disse "visitei".
      if (!/\b(visitei|visitamos|visita)\b/.test(dobrar(texto))) {
        const achada = await acharLoja(pessoa, texto, false, "");
        if (!achada) return null;
      }
      r = await registrarVisita(pessoa, texto, agora);
      break;
    case "anotacao":
      r = await registrarAnotacao(pessoa, texto);
      break;
    case "gravacao":
      r = await registrarGravacao(pessoa, texto, agora);
      break;
    case "entrega":
      r = await darBaixaNaEntrega(pessoa, texto, agora);
      break;
    case "relatorio":
      r = await marcarRelatorio(pessoa, texto, agora);
      break;
    case "etapa":
      r = await marcarEtapas(pessoa, texto);
      break;
    case "reuniao":
    case "fechamento":
      // Funil e agenda: só o dono. Pra outras pessoas a frase segue como conversa normal.
      if (!canAccessModule(pessoa.role as "ADMIN", "comercial", pessoa.email)) return null;
      r = comando === "reuniao" ? await montarReuniao(pessoa, texto, agora) : await montarFechamento(pessoa, texto);
      break;
  }
  if (r) await anotar(messageId, `privado ${primeiroNome(pessoa.name)}`, "comando-do-dia", `${comando} → ${r.tipo}`);
  return r;
}
