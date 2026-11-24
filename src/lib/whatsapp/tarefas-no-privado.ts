import "server-only";

import { prisma } from "@/lib/prisma";
import { dobrar } from "@/lib/datas-da-conversa";
import { diaDaCasaComoData } from "@/lib/dia-da-casa";
import { canAccessModule } from "@/lib/permissions";
import {
  avisarTarefaNova,
  concluirTarefa,
  criarTarefa,
  listaDoDia,
  pararTarefa,
  textoDaLista,
  type ItemDaLista,
} from "@/lib/tarefas/dados";
import { descreverRecorrencia, falarDoPrazo, lerPrazo, lerRecorrencia, tirarDatasDoTitulo, type Recorrencia } from "@/lib/tarefas/regras";
import type { AcaoDeTarefa } from "./pausar-no-privado";
import { anotar } from "./trilha";

// Tarefas pelo WhatsApp, no privado do robô.
//
//   "me lembra de ligar pra Vilela sexta"      → tarefa pra você (na hora)
//   "toda segunda me lembra de conferir a verba" → tarefa que repete (diária / semanal / mensal)
//   "o que tenho hoje?" / "minhas tarefas"     → a lista do dia, numerada
//   "feito 2" / "feito 1 e 3" / "feito tudo"   → conclui (quem atribuiu é avisado)
//   "cancela a tarefa 2"                       → tira da lista (a que repete, para)
//   "pede pra Tatiana conferir a verba até sexta" / "toda segunda a Tatiana confere a verba"
//                                              → atribui a OUTRA pessoa — só dono e gerência; mostra e espera o "sim"
//
// ── As travas ───────────────────────────────────────────────────────────
//   1. Tarefa pra si não precisa de "sim" (é uma anotação dela). Tarefa pra OUTRA pessoa manda WhatsApp pra ela, então
//      mostra o texto e quem recebe e só cria depois do "sim" (mesma confirmação dos outros pedidos: 10 minutos, uma vez).
//   2. Só dono (ADMIN) e gerência atribuem a outras. Gestora cria só pra si — se pedir pra outra, o robô explica.
//   3. Só gente da casa, achada pelo nome (nome ambíguo = pergunta). Nunca um número digitado.
//   4. "Feito 2" é o número da lista DE HOJE (a mesma que o robô manda de manhã e às 17h). Concluir tarefa de outra
//      pessoa não dá (só o dono).
//   5. Pergunta que não é um destes formatos exatos ("tarefas atrasadas das lojas?") segue pro Copiloto.

export interface TarefaRespondida {
  tipo: "lista" | "criou" | "concluiu" | "cancelou" | "pergunta" | "recusou" | "pediu-confirmacao";
  resposta: string;
  pendente: AcaoDeTarefa | null;
}

interface Pessoa {
  id: string;
  name: string;
  role: string;
  email?: string | null;
}

interface Gente {
  id: string;
  name: string;
  role: string;
  whatsapp: string | null;
}

const normaliza = (s: string) => dobrar(s).replace(/[^a-z0-9\s/]/g, " ").replace(/\s+/g, " ").trim();
const primeiroNome = (n: string) => n.trim().split(/\s+/)[0];
const soDigitos = (s: string) => s.replace(/\D/g, "");
const maiuscula = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ─────────────────────────── reconhecer (puro) ─────────────────────────────

const LISTAR_A_MINHA =
  /^(o que (eu )?(tenho|falta|fica|tem) (pra |para |de )?(fazer )?(hoje|agora)?|o que tem pra hoje|minhas tarefas( de hoje| pendentes| do dia| de agora)?|tarefas( de hoje| pendentes| do dia| de agora| abertas)?|minha lista( de hoje| de tarefas)?|lista do dia|lista de hoje|lista de tarefas|o que falta( fazer)?( hoje)?|pendencias( de hoje)?)$/;

/** "o que tenho hoje?", "minhas tarefas", "tarefas". Pura. */
export function pedeAMinhaLista(texto: string): boolean {
  return LISTAR_A_MINHA.test(normaliza(texto));
}

/** "tarefas da Tatiana", "o que a Tatiana tem hoje": devolve o pedaço do nome, ou null. Pura. */
export function pedeListaDeOutra(texto: string): string | null {
  const t = normaliza(texto);
  const m = t.match(/^(?:tarefas|lista|pendencias) (?:de hoje )?(?:da|do|de) ([a-z0-9 ]{2,40}?)(?: hoje)?$/) ?? t.match(/^o que (?:a|o) ([a-z0-9 ]{2,40}?) (?:tem|falta)(?: pra| para)?(?: hoje)?$/);
  return m ? m[1].trim() : null;
}

/** Quais números a frase quer concluir: "feito 2", "feito 1 e 3", "feito 1, 2". `"todas"` = tudo. `null` = não é isso. Pura. */
export function lerConclusao(texto: string): number[] | "todas" | null {
  const t = normaliza(texto);
  if (/^(tudo feito|feito tudo|fiz tudo|tudo pronto|feitas todas|feito todas|todas feitas|todas prontas|concluidas todas|terminei tudo|finalizei tudo|feitos todos|todos feitos)$/.test(t)) return "todas";
  const m = t.match(/^(?:feito|feita|feitos|feitas|concluido|concluida|conclui|terminei|finalizei|pronto|pronta)\s+(?:a tarefa |as tarefas |tarefa |tarefas |o |a |n |no |numero )?(\d{1,2}(?:\s*(?:,|e|\s)\s*\d{1,2})*)$/);
  if (!m) return null;
  const nums = [...new Set(m[1].split(/\s*(?:,|e|\s)\s*/).filter(Boolean).map(Number))].filter((n) => n >= 1 && n <= 99);
  return nums.length ? nums : null;
}

/** "feito: ligar pra Vilela" → "ligar pra vilela" (pra achar a tarefa pelo texto). Pura. */
export function lerConclusaoPorTexto(texto: string): string | null {
  const t = normaliza(texto);
  const m = t.match(/^(?:feito|feita|concluido|concluida|conclui|terminei|finalizei|ja fiz|fiz)\s*(?:a tarefa |a tarefa de |a de |a )?:?\s*(.{4,120})$/);
  if (!m || /^\d/.test(m[1])) return null;
  return m[1].trim();
}

/** "feito" sozinho. Pura. */
export const ehFeitoSozinho = (texto: string) => /^(feito|feita|pronto|concluido|concluida|terminei|finalizei)$/.test(normaliza(texto));

/** "cancela a tarefa 2". Pura. */
export function lerCancelamento(texto: string): number | null {
  const m = normaliza(texto).match(/^(?:cancela|cancele|apaga|apague|exclui|exclua|remove|remova|para|pare|tira|tire)\s+(?:a )?tarefa\s+(?:n |numero )?(\d{1,2})$/);
  return m ? Number(m[1]) : null;
}

const VERBOS_DE_CRIAR_PRA_MIM =
  /^(me lembra|me lembre|me lembrar|me avisa|me avise|lembrete|lembrar|tarefa|nova tarefa|cria uma tarefa|crie uma tarefa|criar tarefa|cria tarefa|crie tarefa|anota uma tarefa|anota tarefa|anote uma tarefa|adiciona uma tarefa|adicione uma tarefa|adiciona tarefa|coloca na minha lista|coloque na minha lista|poe na minha lista)\b/;

const VERBOS_DE_ATRIBUIR =
  /^(pede|peca|pedir|atribui|atribua|atribuir|delega|delegue|delegar|tarefa|nova tarefa|cria uma tarefa|crie uma tarefa|cria tarefa|crie tarefa|criar tarefa|passa a tarefa|passe a tarefa|manda fazer|combina com)\b/;

/** A frase quer criar tarefa PRA MIM? Pura. */
export function pedeTarefaPraMim(texto: string): boolean {
  const t = normaliza(texto);
  if (VERBOS_DE_CRIAR_PRA_MIM.test(t)) return true;
  // "toda segunda me lembra de conferir a verba", "me lembra de ligar sexta"
  return /\bme (lembra|lembre|avisa|avise)\b/.test(t);
}

/** Acha UMA pessoa da casa citada na frase (nome completo ou primeiro nome inteiro). Pura. */
export function acharPessoaNoTexto(
  texto: string,
  gente: Gente[],
  euId: string,
): { achada: Gente | null; ambiguas: Gente[] } {
  const t = ` ${normaliza(texto)} `;
  const outras = gente.filter((p) => p.id !== euId);
  const cheio = outras.filter((p) => {
    const n = normaliza(p.name);
    return n.includes(" ") && t.includes(` ${n} `);
  });
  if (cheio.length === 1) return { achada: cheio[0], ambiguas: [] };
  const porPrimeiro = new Map<string, Gente[]>();
  for (const p of outras) {
    const n = normaliza(primeiroNome(p.name));
    if (n.length < 3) continue;
    porPrimeiro.set(n, [...(porPrimeiro.get(n) ?? []), p]);
  }
  const citados = [...porPrimeiro.entries()].filter(([n]) => t.includes(` ${n} `));
  if (citados.length === 0) return { achada: null, ambiguas: [] };
  if (citados.length > 1) return { achada: null, ambiguas: citados.flatMap(([, ps]) => ps) };
  const [, ps] = citados[0];
  return ps.length === 1 ? { achada: ps[0], ambiguas: [] } : { achada: null, ambiguas: ps };
}

/** Tira o pedaço do texto original que casa com a regex (dobrada), mantendo as posições. */
function removerDoOriginal(original: string, re: RegExp): string {
  const d = dobrar(original);
  const m = d.match(re);
  if (!m || m.index === undefined) return original;
  return original.slice(0, m.index) + " " + original.slice(m.index + m[0].length);
}

/** O título da tarefa pra mim: o que sobra depois de tirar "me lembra de", "tarefa:" e as datas. Pura. */
export function tituloDaTarefaPraMim(texto: string): string {
  let r = texto.trim();
  r = removerDoOriginal(r, /^(?:me lembra|me lembre|me lembrar|me avisa|me avise|lembrete|lembrar|nova tarefa|tarefa|cria(?:r)? (?:uma )?tarefa|crie (?:uma )?tarefa|anota(?:r)? (?:uma )?tarefa|anote (?:uma )?tarefa|adiciona(?:r)? (?:uma )?tarefa|adicione (?:uma )?tarefa|coloca na minha lista|coloque na minha lista|poe na minha lista)\b\s*(?:de |que |pra |para |:|-)?\s*/);
  r = removerDoOriginal(r, /\bme (?:lembra|lembre|avisa|avise)\b\s*(?:de |que |pra |para )?/);
  return maiuscula(tirarDatasDoTitulo(r).replace(/^(?:de|que|pra|para)\s+/i, "").trim());
}

/** O título da tarefa pra OUTRA pessoa: tira o verbo de pedir, o nome dela e as datas. Pura. */
export function tituloDaTarefaPraOutra(texto: string, primeiroNomeDela: string): string {
  let r = texto.trim();
  const nome = dobrar(primeiroNomeDela);
  r = removerDoOriginal(r, /^(?:pede|peca|pedir|atribui|atribua|atribuir|delega|delegue|delegar|nova tarefa|tarefa|cria(?:r)? (?:uma )?tarefa|crie (?:uma )?tarefa|passa a tarefa|passe a tarefa|manda fazer|combina com)\b\s*/);
  // "pra/para/a/à/ao/o/pro <nome>" (e o nome sozinho), com ":" ou "de/que/pra" logo depois.
  r = removerDoOriginal(r, new RegExp(`(?:\\b(?:pra|para|pro|a|ao|o|as|à)\\s+)?\\b${nome}\\b\\s*(?:[:,\\-]|\\bde\\b|\\bque\\b|\\bpra\\b|\\bpara\\b)?\\s*`));
  r = removerDoOriginal(r, /^(?:que|de|pra|para|fazer)\s+/);
  r = tirarDatasDoTitulo(r);
  return maiuscula(r.replace(/^(?:que|de|pra|para|fazer|:)\s*/i, "").replace(/^[\s:,;.–-]+/, "").trim());
}

// ─────────────────────────── o atendimento ─────────────────────────────────

const AJUDA_DA_LISTA = "Responde *feito 1* (ou *feito 1 e 3*, *feito tudo*) pra dar baixa.";

function mostrarLista(itens: ItemDaLista[], hoje: Date, cabeca: string): string {
  if (itens.length === 0) return `${cabeca}\nNenhuma tarefa pra hoje. 🎉\n\nPra criar: *me lembra de ligar pra Vilela sexta*.`;
  const abertas = itens.filter((i) => !i.feita).length;
  return `${cabeca}\n${textoDaLista(itens, hoje)}\n\n${abertas > 0 ? AJUDA_DA_LISTA : "🎉 Tudo feito por hoje!"}`;
}

const dataTexto = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * Trata a mensagem se ela for de tarefa. `null` = não é, segue o fluxo normal. A pessoa já foi identificada, e já tem
 * acesso ao robô (módulo de clientes).
 */
export async function tratarTarefaNoPrivado(
  pessoa: Pessoa,
  texto: string,
  agora: Date,
  messageId?: string | null,
): Promise<TarefaRespondida | null> {
  const original = texto.trim();
  if (!original || original.length > 600) return null;
  const hoje = diaDaCasaComoData(agora);
  const t = normaliza(original);

  // ── a minha lista ──
  if (pedeAMinhaLista(original)) {
    const itens = await listaDoDia(pessoa.id, hoje);
    return { tipo: "lista", pendente: null, resposta: mostrarLista(itens, hoje, `📋 *Suas tarefas de hoje* (${dataTexto(hoje)})`) };
  }

  // ── a lista de outra pessoa (dono e gerência) ──
  const nomeDeOutra = pedeListaDeOutra(original);
  if (nomeDeOutra) {
    const gente = await gentePraAtribuir();
    const { achada, ambiguas } = acharPessoaNoTexto(nomeDeOutra, gente, pessoa.id);
    if (!achada && ambiguas.length === 0) return null; // não é nome de ninguém da casa: pode ser outra pergunta
    if (pessoa.role !== "ADMIN" && pessoa.role !== "GERENTE") {
      return { tipo: "recusou", pendente: null, resposta: "A lista das outras pessoas é com o Guilherme e a gerência. Eu mostro a sua: *o que tenho hoje?*" };
    }
    if (!achada) return { tipo: "pergunta", pendente: null, resposta: `Tem mais de uma: ${ambiguas.map((p) => p.name).join(", ")}. Me diz o nome completo.` };
    const itens = await listaDoDia(achada.id, hoje);
    return { tipo: "lista", pendente: null, resposta: mostrarLista(itens, hoje, `📋 *Tarefas de hoje — ${primeiroNome(achada.name)}* (${dataTexto(hoje)})`).replace(AJUDA_DA_LISTA, "") };
  }

  // ── concluir ──
  const numeros = lerConclusao(original);
  const porTexto = numeros ? null : lerConclusaoPorTexto(original);
  if (numeros || porTexto || ehFeitoSozinho(original)) {
    const itens = await listaDoDia(pessoa.id, hoje);
    const abertas = itens.filter((i) => !i.feita);
    let alvos: ItemDaLista[] = [];
    if (numeros === "todas") {
      alvos = abertas;
    } else if (numeros) {
      const fora = numeros.filter((n) => n > itens.length);
      if (fora.length > 0) {
        return { tipo: "pergunta", pendente: null, resposta: `Não tem tarefa ${fora.join(", ")} na sua lista de hoje.\n\n${mostrarLista(itens, hoje, "📋 *Sua lista*")}` };
      }
      alvos = numeros.map((n) => itens[n - 1]);
    } else if (porTexto) {
      const q = normaliza(porTexto);
      const achadas = abertas.filter((i) => {
        const ti = normaliza(i.titulo);
        return ti.includes(q) || q.includes(ti);
      });
      if (achadas.length === 0) return null; // "feito o relatório da Vilela": não é uma tarefa minha, segue o fluxo
      if (achadas.length > 1) return { tipo: "pergunta", pendente: null, resposta: `Qual delas? ${achadas.map((i) => `“${i.titulo}”`).join(", ")}.\nMe manda o número: *feito ${itens.indexOf(achadas[0]) + 1}*.` };
      alvos = achadas;
    } else {
      // "feito" sozinho
      if (abertas.length === 0) return null; // nada aberto: "feito" não é comigo
      if (abertas.length > 1) return { tipo: "pergunta", pendente: null, resposta: `Qual tarefa? ${mostrarLista(itens, hoje, "📋 *Sua lista*")}` };
      alvos = abertas;
    }
    if (alvos.length === 0) return { tipo: "concluiu", pendente: null, resposta: "Não tem nada aberto na sua lista de hoje. 🎉" };

    const feitas: string[] = [];
    const avisados = new Set<string>();
    for (const a of alvos) {
      const r = await concluirTarefa(a.id, hoje, { id: pessoa.id, name: pessoa.name, role: pessoa.role }, messageId);
      if (r.ok) {
        feitas.push(r.jaEstava ? `${r.titulo} (já estava feita)` : r.titulo);
        if (r.avisou) avisados.add(r.avisou);
      }
    }
    const depois = await listaDoDia(pessoa.id, hoje);
    const faltam = depois.filter((i) => !i.feita);
    return {
      tipo: "concluiu",
      pendente: null,
      resposta:
        `✅ Feito: ${feitas.map((f) => `*${f}*`).join(", ")}.` +
        (avisados.size ? `\n📣 Avisei ${[...avisados].join(", ")}.` : "") +
        (faltam.length ? `\n\nAinda abertas hoje:\n${faltam.map((i) => textoDaLista([i], hoje).replace(/^1\./, `${depois.indexOf(i) + 1}.`)).join("\n")}` : "\n\n🎉 Tudo feito por hoje!"),
    };
  }

  // ── cancelar ──
  const cancelar = lerCancelamento(original);
  if (cancelar) {
    const itens = await listaDoDia(pessoa.id, hoje);
    const alvo = itens[cancelar - 1];
    if (!alvo) return { tipo: "pergunta", pendente: null, resposta: `Não tem tarefa ${cancelar} na sua lista de hoje.\n\n${mostrarLista(itens, hoje, "📋 *Sua lista*")}` };
    const r = await pararTarefa(alvo.id, pessoa.id, pessoa.role);
    if (!r.ok) return { tipo: "recusou", pendente: null, resposta: "Essa tarefa eu não consegui cancelar (só quem criou ou quem recebeu cancela)." };
    return {
      tipo: "cancelou",
      pendente: null,
      resposta: r.recorrente ? `🛑 Parei a tarefa que se repete: *${r.titulo}*. Ela não volta mais.` : `🗑️ Cancelei a tarefa: *${r.titulo}*.`,
    };
  }

  // ── criar (pra mim ou pra outra pessoa) ──
  if (/[?]/.test(original)) return null;
  const quer = pedeTarefaPraMim(original);
  const querAtribuir = VERBOS_DE_ATRIBUIR.test(t) || /^tod[oa]s?\b/.test(t);
  if (!quer && !querAtribuir) return null;

  const gente = await gentePraAtribuir();
  const { achada, ambiguas } = quer && /\bme (lembra|lembre|avisa|avise)\b/.test(t) ? { achada: null, ambiguas: [] } : acharPessoaNoTexto(original, gente, pessoa.id);

  const recorrencia = lerRecorrencia(original, agora);
  const prazo = recorrencia ? null : lerPrazo(original, agora);

  // Pra outra pessoa.
  if (achada || ambiguas.length > 0) {
    if (ambiguas.length > 0 && !achada) {
      return { tipo: "pergunta", pendente: null, resposta: `Tem mais de uma por esse nome: ${ambiguas.map((p) => p.name).join(", ")}. Me diz o nome completo.` };
    }
    if (pessoa.role !== "ADMIN" && pessoa.role !== "GERENTE") {
      return {
        tipo: "recusou",
        pendente: null,
        resposta: `Passar tarefa pra outra pessoa é com o Guilherme e a gerência. Eu posso criar uma tarefa pra *você*: *me lembra de ${tituloDaTarefaPraMim(original).toLowerCase() || "…"}*.`,
      };
    }
    const alvo = achada!;
    const titulo = tituloDaTarefaPraOutra(original, primeiroNome(alvo.name));
    if (titulo.length < 3) {
      return { tipo: "pergunta", pendente: null, resposta: `Qual é a tarefa pra ${primeiroNome(alvo.name)}? Escreve assim: *pede pra ${primeiroNome(alvo.name)} conferir a verba das lojas até sexta*.` };
    }
    const tel = alvo.whatsapp && soDigitos(alvo.whatsapp).length >= 10 ? soDigitos(alvo.whatsapp) : null;
    const rec = recorrencia?.recorrencia ?? "NENHUMA";
    const quando = recorrencia ? descreverRecorrencia({ recorrencia: recorrencia.recorrencia, diaDaSemana: recorrencia.diaDaSemana, diaDoMes: recorrencia.diaDoMes }) : prazo ? `até ${falarDoPrazo(prazo, hoje)}` : "sem prazo";
    const linhas = [
      `📌 Vou passar esta tarefa pra ${primeiroNome(alvo.name)}:`,
      "",
      `• *${titulo}* — ${quando}`,
      "",
      tel ? `Ela é avisada agora pelo WhatsApp, entra na lista dela e de manhã o robô lembra.` : `⚠️ ${primeiroNome(alvo.name)} não tem WhatsApp cadastrado: a tarefa entra na lista dela no sistema, mas eu não consigo avisar.`,
      `Você é avisado quando ela concluir. Confirma? Responde *sim* ou *não*.`,
    ];
    return {
      tipo: "pediu-confirmacao",
      resposta: linhas.join("\n"),
      pendente: {
        tipo: "atribuir-tarefa",
        responsavel: { id: alvo.id, nome: alvo.name, telefone: tel },
        titulo,
        recorrencia: rec,
        prazo: prazo ? prazo.toISOString().slice(0, 10) : null,
        diaDaSemana: recorrencia?.diaDaSemana ?? null,
        diaDoMes: recorrencia?.diaDoMes ?? null,
        pedido: original.slice(0, 300),
      },
    };
  }

  // Pra mim.
  if (!quer) return null; // "tarefa…" sem ninguém citado e sem "me lembra": deixa passar pro fluxo normal (pode ser conversa)
  const titulo = tituloDaTarefaPraMim(original);
  if (titulo.length < 3) {
    return { tipo: "pergunta", pendente: null, resposta: "Lembrar do quê? Escreve assim: *me lembra de ligar pra Vilela sexta*." };
  }
  const nova = await criarTarefa({
    titulo,
    responsavelId: pessoa.id,
    criadaPorId: pessoa.id,
    recorrencia: (recorrencia?.recorrencia ?? "NENHUMA") as Recorrencia,
    prazo,
    diaDaSemana: recorrencia?.diaDaSemana ?? null,
    diaDoMes: recorrencia?.diaDoMes ?? null,
    origem: "whatsapp",
  });
  await anotar(messageId, `privado ${primeiroNome(pessoa.name)}`, "tarefa-criada", nova.recorrencia);
  const quando = recorrencia
    ? descreverRecorrencia({ recorrencia: recorrencia.recorrencia, diaDaSemana: recorrencia.diaDaSemana, diaDoMes: recorrencia.diaDoMes })
    : prazo
      ? `para ${falarDoPrazo(prazo, hoje)}`
      : "sem prazo (fica na lista até você dar baixa)";
  return {
    tipo: "criou",
    pendente: null,
    resposta: `📝 Anotado pra você: *${titulo}* — ${quando}.\nDe manhã eu te lembro, e às 17h pergunto se está feito. Pra ver a lista: *o que tenho hoje?*`,
  };
}

async function gentePraAtribuir(): Promise<Gente[]> {
  return prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true, whatsapp: true } });
}

/** Executa a atribuição depois do "sim": cria a tarefa e avisa a pessoa. */
export async function executarAtribuicao(
  pessoa: Pessoa,
  acao: AcaoDeTarefa,
  agora: Date,
  messageId?: string | null,
): Promise<{ resposta: string }> {
  if (pessoa.role !== "ADMIN" && pessoa.role !== "GERENTE") return { resposta: "Só o dono e a gerência passam tarefa pra outra pessoa. Não criei nada." };
  const alvo = await prisma.user.findFirst({ where: { id: acao.responsavel.id, active: true }, select: { id: true, name: true, whatsapp: true } });
  if (!alvo) return { resposta: "Essa pessoa não está mais ativa no sistema. Não criei a tarefa." };

  const hoje = diaDaCasaComoData(agora);
  const prazo = acao.prazo ? new Date(`${acao.prazo}T00:00:00.000Z`) : null;
  const t = await criarTarefa({
    titulo: acao.titulo,
    responsavelId: alvo.id,
    criadaPorId: pessoa.id,
    recorrencia: acao.recorrencia,
    prazo,
    diaDaSemana: acao.diaDaSemana,
    diaDoMes: acao.diaDoMes,
    origem: "whatsapp",
  });
  const avisou = await avisarTarefaNova(t, pessoa.name, alvo.whatsapp, hoje);
  await anotar(messageId, `privado ${primeiroNome(pessoa.name)}`, "tarefa-atribuida", `${acao.recorrencia} · ${avisou ? "avisou" : "sem aviso"}`);
  return {
    resposta:
      `✅ Tarefa criada pra ${primeiroNome(alvo.name)}: *${acao.titulo}*.\n` +
      (avisou ? `📣 Avisei ${primeiroNome(alvo.name)} pelo WhatsApp.` : `⚠️ Não consegui avisar ${primeiroNome(alvo.name)} pelo WhatsApp (sem número, ou o envio falhou) — a tarefa está na lista dela no sistema.`),
  };
}

/** Quem pode usar tarefas pelo robô: a mesma régua do resto do privado. */
export const podeUsarTarefas = (p: Pessoa) => canAccessModule(p.role as "ADMIN", "clientes", p.email);
