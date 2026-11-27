import "server-only";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { CARTEIRA_NO_META, escopoDaCarteira, type PessoaDaCasa } from "@/lib/carteira";
import { escritaLiberada } from "@/lib/meta/escrever-na-graph";
import { criarAnuncioDeVideoDoCarro, criarAnuncioDoCarro, criarEstrutura, paginasDaConta } from "@/lib/meta/campanha-do-zero";
import { buscarLocais } from "@/lib/meta/publico-do-conjunto";
import { gerarLegendaDoCarro } from "@/lib/meta/legenda-do-rascunho";
import { legendaDoModelo } from "@/lib/meta/legenda-modelo";
import { subirVideo, ehVideo } from "@/lib/meta/video";
import { dadosDoCarroEmTexto } from "@/lib/estoque/anunciar-agora";
import { escolherCarroPeloArquivo, prepararArte } from "@/lib/estoque/artes";
import { rodapeDaLoja } from "@/lib/estoque/contato";
import { IDADE_MAXIMA, type LocalDoPublico } from "@/lib/meta/publico-puro";
import { enviarTexto } from "./zapi";
import { anotar } from "./trilha";
import { acharLojaNoTexto } from "./pausar-no-privado";
import { achatar, carrosPeloNome, lerInstrucoes, pedeCampanhaDoZero, type EstruturaZap, type Objetivo } from "./campanha-do-zero-puro";

// Campanha do zero pelo WhatsApp (pedido do Guilherme: "criar campanha do zero pelo sistema e pelo whats").
//
// No privado do robô:
//   1. "campanha do zero <loja>, leads, um conjunto por carro, R$ 20 por dia, idade 25 a 55, Ponta Grossa 30 km, legenda IA"
//      (o que não for dito fica no padrão e aparece no resumo);
//   2. as ARTES como foto, com o nome do carro na legenda da foto → vão pro banco de artes, no carro certo (1ª foto do anúncio);
//      os VÍDEOS do mesmo jeito → viram anúncio de vídeo do carro;
//   3. o robô pergunta o que faltar (loja, conta, página, cidade) e mostra o resumo;
//   4. "sim" → cria campanha, conjuntos e anúncios, TUDO PAUSADO (mesmo código da tela: src/lib/meta/campanha-do-zero.ts),
//      e manda o link do Gerenciador e o da tela de ajustes.
//
// A criação pode passar do tempo de uma chamada (muitos carros, vídeos): vai carro a carro, guarda o andamento e, se o
// tempo acabar, chama a si mesma de novo (/api/whatsapp/campanha-do-zero/continuar) pra terminar.

const VALE_MS = 2 * 60 * 60 * 1000;
const ORCAMENTO_PADRAO = 15;
const RAIO_PADRAO = 40;
const TEMPO_POR_CHAMADA_MS = 230_000;
const MAX_CARROS = 60;

type Pessoa = PessoaDaCasa & { name: string };
interface Opcao {
  id: string;
  nome: string;
}
interface Pedido {
  telefone: string;
  clientId: string | null;
  lojaNome: string | null;
  contaId: string | null;
  contaMeta: string | null;
  paginaId: string | null;
  paginaNome: string | null;
  objetivo: Objetivo;
  estrutura: EstruturaZap;
  orcamentoReais: number;
  naCampanha: boolean;
  idadeMin: number;
  idadeMax: number;
  genero: "todos" | "homens" | "mulheres";
  cidade: string | null;
  raioKm: number;
  locais: LocalDoPublico[];
  legenda: string;
  carros: "arte" | "todos" | string[];
  nome: string | null;
  /** O que o robô perguntou e espera como resposta (número da lista). */
  esperando: { tipo: "loja" | "conta" | "pagina"; opcoes: Opcao[] } | null;
}
interface Andamento {
  campanhaId: string | null;
  conjuntos: { chave: string; adsetId: string }[];
  pendentes: string[];
  feitos: { carro: string; ok: boolean; msg: string }[];
  rodape: string;
  avisos: string[];
}

const negrito = (t: string) => `*${t}*`;
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function novoPedido(telefone: string): Pedido {
  return {
    telefone,
    clientId: null,
    lojaNome: null,
    contaId: null,
    contaMeta: null,
    paginaId: null,
    paginaNome: null,
    objetivo: "leads",
    estrutura: "por-carro",
    orcamentoReais: ORCAMENTO_PADRAO,
    naCampanha: false,
    idadeMin: 25,
    idadeMax: IDADE_MAXIMA,
    genero: "todos",
    cidade: null,
    raioKm: RAIO_PADRAO,
    locais: [],
    legenda: "ia",
    carros: "arte",
    nome: null,
    esperando: null,
  };
}

async function lojasDaPessoa(pessoa: Pessoa) {
  return prisma.client.findMany({
    where: { ...CARTEIRA_NO_META, ...escopoDaCarteira(pessoa) },
    select: { id: true, companyName: true, city: true },
    orderBy: { companyName: "asc" },
  });
}

async function ler(userId: string, agora: Date) {
  const c = await prisma.campanhaDoZeroWhatsapp.findUnique({ where: { userId } });
  if (!c) return null;
  if (c.venceEm <= agora && c.etapa !== "criando") {
    await apagar(userId);
    return null;
  }
  return { etapa: c.etapa, pedido: c.pedido as unknown as Pedido, andamento: (c.andamento as unknown as Andamento | null) ?? null };
}

async function salvar(userId: string, etapa: string, pedido: Pedido, agora: Date, andamento?: Andamento | null) {
  const data = {
    etapa,
    pedido: pedido as unknown as object,
    venceEm: new Date(agora.getTime() + VALE_MS),
    ...(andamento !== undefined ? { andamento: (andamento ?? undefined) as unknown as object } : {}),
  };
  await prisma.campanhaDoZeroWhatsapp.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

async function apagar(userId: string) {
  await prisma.campanhaDoZeroWhatsapp.deleteMany({ where: { userId } });
  await prisma.videoDoZero.deleteMany({ where: { userId } });
}

/** Aplica o que a frase disse no pedido. */
function aplicar(p: Pedido, texto: string): Pedido {
  const l = lerInstrucoes(texto);
  const n = { ...p };
  if (l.objetivo) n.objetivo = l.objetivo;
  if (l.estrutura) n.estrutura = l.estrutura;
  if (l.orcamentoReais) n.orcamentoReais = l.orcamentoReais;
  if (l.naCampanha !== undefined) n.naCampanha = l.naCampanha;
  if (l.idadeMin && l.idadeMax) {
    n.idadeMin = l.idadeMin;
    n.idadeMax = l.idadeMax;
  }
  if (l.genero) n.genero = l.genero;
  if (l.raioKm) {
    n.raioKm = l.raioKm;
    n.locais = n.locais.map((x) => (x.tipo === "cidade" ? { ...x, raioKm: l.raioKm as number } : x));
  }
  if (l.cidade && achatar(l.cidade) !== achatar(n.cidade ?? "")) {
    n.cidade = l.cidade;
    n.locais = [];
  }
  if (l.legenda) n.legenda = l.legenda;
  if (l.carros) n.carros = l.carros;
  if (l.nome) n.nome = l.nome;
  return n;
}

/** Os carros que vão subir, pelo que foi pedido. */
async function carrosDoPedido(p: Pedido) {
  if (!p.clientId) return { carros: [], semCarro: [] as string[] };
  const todos = await prisma.estoqueCarro.findMany({
    where: { clientId: p.clientId, sumiuEm: null },
    select: { id: true, titulo: true, anoModelo: true, km: true, cor: true, precoCents: true, arte: { select: { id: true } } },
    orderBy: { titulo: "asc" },
  });
  if (p.carros === "todos") return { carros: todos.slice(0, MAX_CARROS), semCarro: [] };
  if (p.carros === "arte") return { carros: todos.filter((c) => c.arte).slice(0, MAX_CARROS), semCarro: [] };
  const r = carrosPeloNome(p.carros, todos);
  return { carros: r.achados.slice(0, MAX_CARROS), semCarro: r.semCarro };
}

function listaNumerada(o: Opcao[]): string {
  return o.map((x, i) => `${i + 1}) ${x.nome}`).join("\n");
}

const AJUDA =
  "Pra mudar, escreve por exemplo: *orçamento 30*, *idade 25 a 50*, *cidade Curitiba 30 km*, *só homens*, *um conjunto* / *por carro*, " +
  "*engajamento* / *leads*, *carros: todos* / *carros: só com arte* / *carros: onix, gol*, *legenda IA* / *legenda: Oferta! {carro} por {preco}*.\n" +
  "Manda as *artes* (foto) e *vídeos* com o nome do carro na legenda. Responde *sim* pra criar (tudo PAUSADO) ou *cancela*.";

/** Descobre o que falta e pergunta; com tudo, mostra o resumo. */
async function avancar(pessoa: Pessoa, p: Pedido, agora: Date, aviso = ""): Promise<string> {
  // Loja
  if (!p.clientId) {
    const lojas = await lojasDaPessoa(pessoa);
    if (lojas.length === 0) {
      await apagar(pessoa.id);
      return "Você não tem loja com conta de anúncio na sua carteira.";
    }
    const opcoes = lojas.map((l) => ({ id: l.id, nome: l.companyName }));
    p.esperando = { tipo: "loja", opcoes: opcoes.slice(0, 40) };
    await salvar(pessoa.id, "montando", p, agora);
    return `${aviso}🚀 Campanha do zero. De qual loja? Responde com o número:\n${listaNumerada(p.esperando.opcoes)}`;
  }
  // Conta
  if (!p.contaId) {
    const contas = await prisma.metaAdAccount.findMany({ where: { clientId: p.clientId, active: true }, select: { id: true, metaAccountId: true, name: true } });
    if (contas.length === 0) {
      await apagar(pessoa.id);
      return `A ${negrito(p.lojaNome ?? "")} não tem conta de anúncio ligada no Legacy OS. Liga a conta (Meta Ads) e pede de novo.`;
    }
    if (contas.length === 1) {
      p.contaId = contas[0].id;
      p.contaMeta = contas[0].metaAccountId;
    } else {
      p.esperando = { tipo: "conta", opcoes: contas.map((c) => ({ id: c.id, nome: c.name ?? c.metaAccountId })) };
      await salvar(pessoa.id, "montando", p, agora);
      return `${aviso}Em qual conta de anúncio da ${negrito(p.lojaNome ?? "")}?\n${listaNumerada(p.esperando.opcoes)}`;
    }
  }
  // Página
  if (!p.paginaId) {
    const r = await paginasDaConta(p.clientId, p.contaId);
    const sugerida = r.ok ? r.paginas.find((x) => x.sugerida) : null;
    if (sugerida) {
      p.paginaId = sugerida.id;
      p.paginaNome = sugerida.nome;
    } else {
      const opcoes = r.ok ? r.paginas.slice(0, 20).map((x) => ({ id: x.id, nome: x.nome })) : [];
      p.esperando = { tipo: "pagina", opcoes };
      await salvar(pessoa.id, "montando", p, agora);
      return (
        `${aviso}Qual a página do Facebook da ${negrito(p.lojaNome ?? "")}? ` +
        (opcoes.length ? `Responde com o número:\n${listaNumerada(opcoes)}\n\nOu ` : `${r.ok ? "" : `(${r.erro}) `}`) +
        `manda o ID: ${negrito("página 1234567890")}.`
      );
    }
  }
  // Cidade
  if (p.locais.length === 0) {
    const loja = await prisma.client.findUnique({ where: { id: p.clientId }, select: { city: true } });
    const termo = p.cidade ?? loja?.city ?? null;
    if (!termo) {
      await salvar(pessoa.id, "montando", p, agora);
      return `${aviso}Em qual cidade? Ex.: ${negrito("cidade Ponta Grossa 30 km")}.`;
    }
    const achou = await buscarLocais(termo);
    const cidade = achou.ok ? achou.locais.find((l) => l.tipo === "cidade") : null;
    if (!cidade) {
      p.cidade = null;
      await salvar(pessoa.id, "montando", p, agora);
      return `${aviso}Não achei a cidade "${termo}" na Meta. Escreve de novo: ${negrito("cidade Ponta Grossa 30 km")}.`;
    }
    p.cidade = cidade.nome;
    p.locais = [{ ...cidade, raioKm: p.raioKm }];
  }
  // Carros
  const { carros, semCarro } = await carrosDoPedido(p);
  await salvar(pessoa.id, carros.length ? "confirmando" : "montando", p, agora);
  if (carros.length === 0) {
    return (
      `${aviso}${p.carros === "arte" ? "Ainda não tem carro com arte" : "Não achei os carros"} na ${negrito(p.lojaNome ?? "")}. ` +
      `Manda as ${negrito("artes")} como foto, com o nome do carro na legenda (ex.: ${negrito("onix 2020")}), ou escreve ${negrito("carros: todos")}.`
    );
  }
  return aviso + (await resumo(pessoa.id, p, carros, semCarro));
}

async function resumo(userId: string, p: Pedido, carros: { id: string; titulo: string; arte: { id: string } | null }[], semCarro: string[]): Promise<string> {
  const comVideo = new Set((await prisma.videoDoZero.findMany({ where: { userId }, select: { carroId: true } })).map((v) => v.carroId));
  const conjuntos = p.estrutura === "por-carro" ? carros.length : 1;
  const total = p.naCampanha ? p.orcamentoReais : p.orcamentoReais * conjuntos;
  const local = p.locais.map((l) => `${l.nome}${l.raioKm ? ` +${l.raioKm} km` : ""}`).join(", ");
  const lista = carros
    .slice(0, 30)
    .map((c, i) => `${i + 1}. ${c.titulo}${c.arte ? " 🖼️" : ""}${comVideo.has(c.id) ? " 🎬" : ""}`)
    .join("\n");
  return [
    `📋 ${negrito("Campanha do zero — confere")} (tudo nasce PAUSADO)`,
    `• Loja: ${negrito(p.lojaNome ?? "")} · página ${negrito(p.paginaNome ?? p.paginaId ?? "")}`,
    `• Objetivo: ${p.objetivo === "leads" ? "Leads" : "Engajamento"} → WhatsApp (número da página)`,
    `• Estrutura: ${p.estrutura === "por-carro" ? `um conjunto por carro (${conjuntos})` : "um conjunto com todos"}`,
    `• Orçamento: ${reais(p.orcamentoReais)}/dia ${p.naCampanha ? "na campanha" : "por conjunto"} → ${reais(total)}/dia no total`,
    `• Público: ${p.idadeMin}–${p.idadeMax} anos, ${p.genero === "todos" ? "todos os gêneros" : p.genero}, ${local}`,
    `• Legenda: ${p.legenda === "ia" ? "a IA escreve (com o rodapé da loja)" : "a mesma pra todos"}`,
    `• Carros (${carros.length})${p.carros === "arte" ? " — os com arte" : ""}:\n${lista}${carros.length > 30 ? `\n… e mais ${carros.length - 30}` : ""}`,
    semCarro.length ? `⚠️ Não achei: ${semCarro.join(", ")}` : null,
    "",
    AJUDA,
  ]
    .filter((x): x is string => x !== null)
    .join("\n");
}

/**
 * A conversa da campanha do zero (texto). `null` = a mensagem não é dela. `depois` = trabalho pra fazer DEPOIS de mandar a
 * resposta (a criação, que é demorada).
 */
export async function tratarCampanhaDoZero(
  pessoa: Pessoa,
  telefone: string,
  texto: string,
  agora: Date = new Date(),
): Promise<{ resposta: string; depois?: () => Promise<void> } | null> {
  const atual = await ler(pessoa.id, agora);
  const t = achatar(texto);
  if (!atual && !pedeCampanhaDoZero(texto)) return null;
  if (!escritaLiberada()) return { resposta: "Ainda não consigo criar campanha: o acesso de escrita na Meta não está configurado no sistema." };

  if (atual?.etapa === "criando") {
    return { resposta: "Estou criando a campanha agora. Te aviso aqui quando terminar." };
  }
  if (atual && /^(cancela|cancelar|desisto|esquece|para|parar)$/.test(t)) {
    await apagar(pessoa.id);
    return { resposta: "Tudo bem, cancelei a campanha do zero. Nada foi criado. (As artes que você mandou ficam no banco de artes da loja.)" };
  }

  // Começo: instruções da primeira mensagem + loja citada.
  let p: Pedido;
  if (!atual || pedeCampanhaDoZero(texto)) {
    p = aplicar(novoPedido(telefone), texto);
    const lojas = await lojasDaPessoa(pessoa);
    const citada = acharLojaNoTexto(texto, lojas.map((l) => ({ id: l.id, nome: l.companyName })));
    if (citada.loja) {
      p.clientId = citada.loja.id;
      p.lojaNome = citada.loja.nome;
    }
    await prisma.videoDoZero.deleteMany({ where: { userId: pessoa.id } });
    return { resposta: await avancar(pessoa, p, agora) };
  }
  p = { ...atual.pedido, telefone };

  // Resposta a uma pergunta da lista.
  const n = /^\d{1,2}$/.test(t) ? Number(t) : null;
  if (p.esperando && n) {
    const escolha = p.esperando.opcoes[n - 1];
    if (!escolha) return { resposta: `Responde com um número de 1 a ${p.esperando.opcoes.length}.` };
    if (p.esperando.tipo === "loja") {
      const lojas = await lojasDaPessoa(pessoa);
      if (!lojas.some((l) => l.id === escolha.id)) return { resposta: "Essa loja não está na sua carteira." };
      Object.assign(p, { clientId: escolha.id, lojaNome: escolha.nome, contaId: null, contaMeta: null, paginaId: null, paginaNome: null, locais: [] });
    } else if (p.esperando.tipo === "conta") {
      const c = await prisma.metaAdAccount.findFirst({ where: { id: escolha.id, clientId: p.clientId ?? "", active: true }, select: { id: true, metaAccountId: true } });
      if (!c) return { resposta: "Essa conta não é desta loja." };
      Object.assign(p, { contaId: c.id, contaMeta: c.metaAccountId, paginaId: null, paginaNome: null });
    } else {
      Object.assign(p, { paginaId: escolha.id, paginaNome: escolha.nome });
    }
    p.esperando = null;
    return { resposta: await avancar(pessoa, p, agora) };
  }
  const pg = texto.match(/\bp[aá]gina\s*:?\s*(\d{5,25})\b/i);
  if (pg) {
    Object.assign(p, { paginaId: pg[1], paginaNome: `página ${pg[1]}`, esperando: null });
    return { resposta: await avancar(pessoa, p, agora) };
  }

  // "sim": cria.
  if (atual.etapa === "confirmando" && /^(sim|s|pode|pode criar|cria|criar|manda|bora|confirmo|ok)$/.test(t)) {
    const { carros } = await carrosDoPedido(p);
    if (carros.length === 0) return { resposta: await avancar(pessoa, p, agora) };
    const tomou = await prisma.campanhaDoZeroWhatsapp.updateMany({ where: { userId: pessoa.id, etapa: "confirmando" }, data: { etapa: "criando" } });
    if (tomou.count !== 1) return { resposta: "Esse pedido já está sendo criado." };
    return {
      resposta: `🚀 Criando a campanha da ${negrito(p.lojaNome ?? "")} (${carros.length} carros), tudo PAUSADO. Pode levar alguns minutos — te aviso aqui quando terminar.`,
      depois: () => criar(pessoa.id, p, carros.map((c) => c.id)),
    };
  }
  if (t === "resumo") return { resposta: await avancar(pessoa, p, agora) };

  // Ajustes.
  const antes = JSON.stringify(p);
  p = aplicar(p, texto);
  if (JSON.stringify(p) === antes) {
    return { resposta: `Não entendi o que mudar. ${AJUDA}` };
  }
  return { resposta: await avancar(pessoa, p, agora, "Ok, ajustei.\n\n") };
}

/**
 * Foto ou vídeo que chega no privado durante a campanha do zero: vai pro carro da legenda (arte → banco de artes; vídeo →
 * anúncio de vídeo). `null` = não há campanha do zero aberta (a mídia segue pro "subir anúncio").
 */
export async function receberMidiaDoZero(
  pessoa: Pessoa,
  m: { tipo: "foto" | "video"; bytes: Buffer; legenda: string | null },
  agora: Date = new Date(),
): Promise<string | null> {
  const atual = await ler(pessoa.id, agora);
  if (!atual || atual.etapa === "criando") return null;
  const p = atual.pedido;
  if (!p.clientId) return "Antes das artes, me diz de qual loja é a campanha (responde o número da lista).";
  const legenda = (m.legenda ?? "").trim();
  if (!legenda) return `${m.tipo === "foto" ? "🖼️" : "🎬"} Manda de novo com o ${negrito("nome do carro na legenda")} (ex.: ${negrito("onix 2020")}), pra eu saber de qual carro é.`;
  const carros = await prisma.estoqueCarro.findMany({
    where: { clientId: p.clientId, sumiuEm: null },
    select: { id: true, titulo: true, marca: true, modelo: true, versao: true, anoModelo: true, codigo: true },
  });
  // Pelo nome do arquivo (regra do banco de artes); legenda curta ("compass") vale quando bate com UM carro só.
  const pelaRegra = escolherCarroPeloArquivo(legenda, carros);
  const pelasPalavras = carrosPeloNome([legenda], carros).achados;
  const carroId = pelaRegra ?? (pelasPalavras.length === 1 ? pelasPalavras[0].id : null);
  const carro = carros.find((c) => c.id === carroId);
  if (!carro) return `Não achei com certeza o carro "${legenda}" no estoque da ${negrito(p.lojaNome ?? "")}. Manda de novo com o nome mais completo (modelo + ano).`;

  if (m.tipo === "foto") {
    const pronta = await prepararArte(m.bytes);
    if (!pronta.ok) return `🖼️ Não consegui usar essa imagem: ${pronta.erro}.`;
    await prisma.$transaction(async (tx) => {
      await tx.arteDoCarro.updateMany({ where: { carroId: carro.id }, data: { carroId: null } });
      await tx.arteDoCarro.create({
        data: { clientId: p.clientId as string, carroId: carro.id, nome: `${legenda.slice(0, 150)} (WhatsApp)`, mime: "image/jpeg", largura: pronta.largura, altura: pronta.altura, bytes: new Uint8Array(pronta.bytes) },
      });
    });
  } else {
    if (!ehVideo(m.bytes)) return "🎬 Só aceito vídeo MP4 (o normal do celular).";
    await prisma.videoDoZero.deleteMany({ where: { userId: pessoa.id, carroId: carro.id } });
    await prisma.videoDoZero.create({ data: { userId: pessoa.id, carroId: carro.id, bytes: new Uint8Array(m.bytes) } });
  }
  await salvar(pessoa.id, atual.etapa, p, agora);
  await anotar(null, `privado ${pessoa.id}`, m.tipo === "foto" ? "zero-arte" : "zero-video", carro.titulo);
  return `${m.tipo === "foto" ? "🖼️ Arte" : "🎬 Vídeo"} do ${negrito(carro.titulo)} guardad${m.tipo === "foto" ? "a" : "o"}. Manda as outras; quando terminar, escreve ${negrito("resumo")}.`;
}

// ───────────────────────────── Criar de verdade ─────────────────────────────

const avisar = async (telefone: string, texto: string) => {
  await enviarTexto(telefone, texto).catch(() => null);
};

async function criar(userId: string, p: Pedido, carroIds: string[]): Promise<void> {
  try {
    if (!p.clientId || !p.contaId || !p.contaMeta || !p.paginaId) throw new Error("pedido incompleto");
    const carros = await prisma.estoqueCarro.findMany({ where: { id: { in: carroIds }, clientId: p.clientId }, select: { id: true, titulo: true } });
    const nome = p.nome ?? `${p.lojaNome ?? "Loja"} — WhatsApp (${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })})`;
    const centavos = Math.round(p.orcamentoReais * 100);
    const est = await criarEstrutura({
      clientId: p.clientId,
      contaId: p.contaId,
      paginaId: p.paginaId,
      nome,
      objetivo: p.objetivo,
      estrutura: p.estrutura,
      orcamento: { onde: p.naCampanha ? "campanha" : "conjunto", centavosPorDia: centavos },
      publico: { idadeMin: p.idadeMin, idadeMax: p.idadeMax, genero: p.genero, locais: p.locais },
      carros: carros.map((c) => ({ carroId: c.id, nome: c.titulo })),
    });
    if (!est.ok) {
      await apagar(userId);
      await avisar(p.telefone, `❌ Não criei a campanha: ${est.erro}`);
      return;
    }
    const rod = await rodapeDaLoja(p.clientId);
    const andamento: Andamento = {
      campanhaId: est.campanhaId,
      conjuntos: est.conjuntos.map((c) => ({ chave: c.chave, adsetId: c.adsetId })),
      pendentes: carros.map((c) => c.id),
      feitos: [],
      rodape: rod.rodape,
      avisos: est.avisos,
    };
    await prisma.campanhaDoZeroWhatsapp.updateMany({ where: { userId }, data: { andamento: andamento as unknown as object } });
    await continuarCampanhaDoZero(userId);
  } catch (e) {
    await prisma.campanhaDoZeroWhatsapp.deleteMany({ where: { userId } });
    await avisar(p.telefone, `❌ Deu erro criando a campanha: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500));
  }
}

/** Cria os anúncios que faltam até o tempo acabar; se ainda faltar, chama a si mesma de novo. No fim, avisa no WhatsApp. */
export async function continuarCampanhaDoZero(userId: string, tempoMs = TEMPO_POR_CHAMADA_MS): Promise<{ terminou: boolean }> {
  const inicio = Date.now();
  const linha = await prisma.campanhaDoZeroWhatsapp.findUnique({ where: { userId } });
  if (!linha || linha.etapa !== "criando" || !linha.andamento) return { terminou: true };
  const p = linha.pedido as unknown as Pedido;
  const a = linha.andamento as unknown as Andamento;
  if (!p.clientId || !p.contaMeta || !p.paginaId) return { terminou: true };

  // Pelo menos um carro por rodada (senão uma rodada curta podia se chamar de novo sem avançar).
  let nestaRodada = 0;
  while (a.pendentes.length > 0 && (nestaRodada === 0 || Date.now() - inicio < tempoMs)) {
    nestaRodada++;
    const carroId = a.pendentes[0];
    const carro = await prisma.estoqueCarro.findFirst({
      where: { id: carroId, clientId: p.clientId },
      select: { id: true, titulo: true, anoModelo: true, km: true, cor: true, precoCents: true },
    });
    const chave = p.estrutura === "por-carro" ? carroId : "todos";
    const conj = a.conjuntos.find((c) => c.chave === chave);
    if (!carro || !conj) {
      a.feitos.push({ carro: carro?.titulo ?? carroId, ok: false, msg: "o conjunto deste carro não foi criado" });
    } else {
      let legenda = p.legenda === "ia" ? "" : legendaDoModelo(p.legenda, carro, a.rodape);
      if (!legenda) {
        const lg = await gerarLegendaDoCarro({ clientId: p.clientId, dadosDoCarro: dadosDoCarroEmTexto(carro), legendaDoBase: "" });
        legenda = lg.ok ? lg.dados.legenda : "";
        if (!lg.ok) a.feitos.push({ carro: carro.titulo, ok: false, msg: `legenda: ${lg.erro}` });
      }
      if (legenda) {
        const r = await criarAnuncioDoCarro({ clientId: p.clientId, contaMeta: p.contaMeta, paginaId: p.paginaId, adsetId: conj.adsetId, carroId: carro.id, nomeDoAnuncio: carro.titulo, legenda, maxFotos: 6 });
        a.feitos.push({ carro: carro.titulo, ok: r.ok, msg: r.ok ? `fotos: ${r.fotos}` : r.erro });
        const video = await prisma.videoDoZero.findFirst({ where: { userId, carroId: carro.id }, orderBy: { criadoEm: "desc" } });
        if (video) {
          const v = await subirVideo(p.contaMeta, new Uint8Array(video.bytes), `${carro.titulo}.mp4`);
          const rv = v.ok
            ? await criarAnuncioDeVideoDoCarro({ clientId: p.clientId, contaMeta: p.contaMeta, paginaId: p.paginaId, adsetId: conj.adsetId, carroId: carro.id, nomeDoAnuncio: carro.titulo, legenda, videoId: v.videoId })
            : { ok: false as const, erro: v.erro };
          a.feitos.push({ carro: `${carro.titulo} (vídeo)`, ok: rv.ok, msg: rv.ok ? "vídeo" : rv.erro });
        }
      }
    }
    a.pendentes.shift();
    await prisma.campanhaDoZeroWhatsapp.updateMany({ where: { userId }, data: { andamento: a as unknown as object } });
  }

  if (a.pendentes.length > 0) {
    await chamarDeNovo(userId);
    return { terminou: false };
  }

  const ok = a.feitos.filter((f) => f.ok).length;
  const falhas = a.feitos.filter((f) => !f.ok);
  const conta = p.contaMeta.replace(/^act_/, "");
  const base = urlDoSistema();
  await avisar(
    p.telefone,
    `✅ Campanha da ${negrito(p.lojaNome ?? "")} criada, ${negrito("PAUSADA")}: ${ok} anúncio(s)` +
      (falhas.length ? `, ${falhas.length} com problema:\n${falhas.slice(0, 15).map((f) => `• ${f.carro}: ${f.msg}`).join("\n")}` : ".") +
      (a.avisos.length ? `\n\n⚠️ ${a.avisos.join("\n⚠️ ")}` : "") +
      `\n\nConfere e publica no Gerenciador:\nhttps://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${conta}&selected_campaign_ids=${a.campanhaId}` +
      (base ? `\n\nPra ajustar (mover carro de conjunto, nomes, orçamento):\n${base}/meta-ads/${p.clientId}/campanha-do-zero/ajustar?conta=${p.contaMeta}&campanha=${a.campanhaId}` : ""),
  );
  await apagar(userId);
  return { terminou: true };
}

function urlDoSistema(): string | null {
  const u =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return u ? u.replace(/\/$/, "") : null;
}

/** A assinatura que a rota de continuar confere (só o próprio sistema chama). */
export function assinaturaDaContinuacao(userId: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "sem-segredo").update(`campanha-do-zero:${userId}`).digest("hex");
}

async function chamarDeNovo(userId: string) {
  const base = urlDoSistema();
  if (!base) return;
  await fetch(`${base}/api/whatsapp/campanha-do-zero/continuar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-assinatura": assinaturaDaContinuacao(userId) },
    body: JSON.stringify({ userId }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
}
