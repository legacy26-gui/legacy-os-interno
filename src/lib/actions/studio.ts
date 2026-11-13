"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { clienteEDaCarteira } from "@/lib/carteira";
import {
  prepararFoto,
  prepararLogo,
  lerPreco,
  FOTO_MAX_BYTES,
  FORMATO_DA_COR,
  PRECO_MINIMO_DE_VEICULO,
  precoQueProvavelmenteQuis,
  LAYOUTS,
  type Layout,
} from "@/lib/studio/arte";

// As operações do Legacy Studio.
//
// ── Escritas pensando no Copiloto ─────────────────────────────────────────
//
// O Guilherme avisou que o Legacy Control vai ter um copiloto de IA, e que o
// Studio precisa poder ser comandado por ele depois. Isso muda uma coisa na
// forma destas funções: **cada operação recebe dados e devolve resultado**,
// sem depender de FormData nem de nada que só exista num navegador.
//
// Assim a mesma função serve às três portas sem ser reescrita:
//
//   a tela de hoje    → o formulário chama
//   o copiloto amanhã → a IA chama com os campos que extraiu da conversa
//   um robô qualquer  → chama direto
//
// A trava de permissão mora DENTRO de cada função, não na tela. É isso que
// faz o copiloto não virar um buraco: se amanhã ele chamar `aprovarArte` em
// nome de alguém, a conferência de carteira acontece igual.
//
// A única exceção é a foto, que chega como FormData porque arquivo em Server
// Action é assim que vem — e mesmo ela é convertida pra Buffer na primeira
// linha, pra que o resto da função não saiba de formulário nenhum.

export type StudioState = { erro?: string; ok?: string; id?: string } | undefined;

function revalidar(id?: string) {
  revalidatePath("/studio");
  if (id) revalidatePath(`/studio/${id}`);
}

/** Quem pode mexer nesta loja. Null quando não pode. */
async function podeMexer(clientId: string) {
  const user = await requireModuleAccess("studio");
  return (await clienteEDaCarteira(user, clientId)) ? user : null;
}

/** Revisar é da direção: quem aprova não pode ser quem produz. */
async function podeRevisar(clientId: string) {
  const user = await podeMexer(clientId);
  if (!user) return null;
  return user.role === "ADMIN" || user.role === "GERENTE" ? user : null;
}

// ─────────────────────────────── A arte ──────────────────────────────────

export interface DadosDaArte {
  clientId: string;
  /** "CHEVROLET" — vai menor, acima do modelo. */
  marca?: string;
  modelo: string;
  /** "LTZ2 SPORT6" — vai na caixa da cor da loja. */
  versao?: string;
  ano?: string;
  kmTexto?: string;
  /** Como a pessoa escreveu: "89900", "R$ 89.900,00". */
  preco?: string;
  /** O preço "de", riscado. Vazio quando não há desconto anunciado. */
  precoDe?: string;
  /** A ficha, separada por "|": "1.4 TURBO | AUTOMÁTICO | TETO SOLAR". */
  detalhes?: string;
  chamada?: string;
}

/** R$ 169.900,00 a partir de centavos. */
function comoReais(c: number): string {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Confere os dois preços e devolve a mensagem quando algo está errado.
 *
 * Uma função só, usada na criação e na correção: a regra tem que ser a
 * mesma nas duas portas, senão o preço barrado ao criar entra pela edição.
 */
function conferirPrecos(
  preco: number | null,
  precoDe: number | null
): string | null {
  for (const [valor, nome] of [
    [preco, "preço"],
    [precoDe, "preço “de”"],
  ] as const) {
    if (valor !== null && valor < PRECO_MINIMO_DE_VEICULO) {
      return (
        `${comoReais(valor)} não é ${nome} de veículo — parece vírgula no lugar do ponto. ` +
        `Você quis dizer ${comoReais(precoQueProvavelmenteQuis(valor))}?`
      );
    }
  }
  // "De R$ 29.900 por R$ 33.900" é desconto ao contrário, e ninguém percebe
  // numa arte pronta. Barrar aqui é mais barato do que no Instagram.
  if (precoDe !== null && preco !== null && precoDe <= preco) {
    return "O preço “de” tem que ser MAIOR que o preço de venda.";
  }
  return null;
}

/** Os campos de texto, limpos e cortados no tamanho que cabe na arte. */
function camposDaArte(d: Omit<DadosDaArte, "clientId">) {
  const corta = (v: string | undefined, n: number) => {
    const t = (v ?? "").trim();
    return t === "" ? null : t.slice(0, n);
  };
  return {
    marca: corta(d.marca, 30),
    versao: corta(d.versao, 40),
    ano: corta(d.ano, 20),
    kmTexto: corta(d.kmTexto, 30),
    // Mais que isso não cabe na faixa: o desenho mostra os quatro
    // primeiros itens e corta o resto em silêncio, o que seria pior.
    detalhes: corta(d.detalhes, 160),
    chamada: corta(d.chamada, 40),
  };
}

/**
 * Cria uma arte a partir da foto e dos dados do veículo.
 *
 * A foto é reduzida ANTES de qualquer coisa tocar o banco. Sem isso, um
 * celular moderno manda 8 MB por carro e o banco vira um depósito de fotos —
 * que é caro, deixa o backup lento e não serve pra nada, porque na arte a
 * foto aparece com 1080 pixels.
 */
export async function criarArte(dados: DadosDaArte, formData: FormData): Promise<StudioState> {
  const user = await podeMexer(dados.clientId);
  if (!user) return { erro: "Esta loja não está na sua carteira." };

  const modelo = dados.modelo.trim();
  if (modelo === "") return { erro: "Escreva o modelo do veículo." };
  if (modelo.length > 80) return { erro: "Modelo muito comprido — ele não cabe na arte." };

  const preco = lerPreco(dados.preco ?? "");
  if (preco === false) {
    return { erro: "Preço inválido. Escreva só o número, por exemplo 89900." };
  }
  const precoDe = lerPreco(dados.precoDe ?? "");
  if (precoDe === false) {
    return { erro: "O preço “de” está inválido. Escreva só o número." };
  }
  const problema = conferirPrecos(preco, precoDe);
  if (problema) return { erro: problema };

  const foto = formData.get("foto");
  if (!(foto instanceof File) || foto.size === 0) {
    return { erro: "Anexe a foto do veículo." };
  }
  if (!foto.type.startsWith("image/")) {
    return { erro: "O arquivo precisa ser uma imagem." };
  }
  if (foto.size > FOTO_MAX_BYTES) {
    return { erro: "Foto muito grande (máx. 12MB)." };
  }

  let pronta;
  try {
    pronta = await prepararFoto(Buffer.from(await foto.arrayBuffer()));
  } catch {
    // Arquivo com extensão de imagem mas conteúdo quebrado. Acontece com
    // print feito pela metade e com arquivo baixado incompleto.
    return { erro: "Não consegui ler essa imagem. Tente outra foto." };
  }

  const arte = await prisma.studioArte.create({
    data: {
      clientId: dados.clientId,
      fotoUrl: pronta.dataUri,
      modelo,
      ...camposDaArte(dados),
      precoCents: preco,
      precoDeCents: precoDe,
      criadoPorId: user.id,
    },
    select: { id: true },
  });

  revalidar();
  return { ok: "Arte gerada.", id: arte.id };
}

/** Muda os dados de uma arte sem trocar a foto — o caminho da correção. */
export async function corrigirArte(
  id: string,
  dados: Omit<DadosDaArte, "clientId">
): Promise<StudioState> {
  const arte = await prisma.studioArte.findUnique({
    where: { id },
    select: { clientId: true },
  });
  if (!arte) return { erro: "Arte não encontrada." };

  const user = await podeMexer(arte.clientId);
  if (!user) return { erro: "Esta loja não está na sua carteira." };

  const modelo = dados.modelo.trim();
  if (modelo === "") return { erro: "Escreva o modelo do veículo." };

  const preco = lerPreco(dados.preco ?? "");
  if (preco === false) return { erro: "Preço inválido." };
  const precoDe = lerPreco(dados.precoDe ?? "");
  if (precoDe === false) return { erro: "O preço “de” está inválido." };
  const problema = conferirPrecos(preco, precoDe);
  if (problema) return { erro: problema };

  await prisma.studioArte.update({
    where: { id },
    data: {
      modelo,
      ...camposDaArte(dados),
      precoCents: preco,
      precoDeCents: precoDe,
      // Mexer nos dados devolve a peça pra fila: o que foi aprovado era o
      // que estava escrito antes, e aprovação não se herda.
      status: "PRONTO",
      correcao: null,
      revisadoPorId: null,
      revisadoEm: null,
    },
  });

  revalidar(id);
  return { ok: "Arte atualizada. Voltou pra revisão." };
}

/**
 * Aprova a arte.
 *
 * Guarda QUEM aprovou e QUANDO. Não é burocracia: quando uma arte errada for
 * ao ar — e uma vai —, a pergunta vai ser "quem olhou isso", e a resposta
 * precisa existir sem depender da memória de ninguém.
 */
export async function aprovarArte(id: string): Promise<StudioState> {
  const arte = await prisma.studioArte.findUnique({
    where: { id },
    select: { clientId: true },
  });
  if (!arte) return { erro: "Arte não encontrada." };

  const user = await podeRevisar(arte.clientId);
  if (!user) return { erro: "Só a direção aprova arte." };

  await prisma.studioArte.update({
    where: { id },
    data: {
      status: "APROVADO",
      correcao: null,
      revisadoPorId: user.id,
      revisadoEm: new Date(),
    },
  });

  revalidar(id);
  return { ok: "Arte aprovada." };
}

/**
 * Pede correção, com o motivo escrito.
 *
 * O motivo é obrigatório. "Reprovado" sem texto manda a peça de volta pra
 * quem a fez sem dizer o que mudar — e o resultado é a mesma peça voltando
 * igual, ou pior, um telefonema pra perguntar o que era.
 */
export async function pedirCorrecao(id: string, motivo: string): Promise<StudioState> {
  const arte = await prisma.studioArte.findUnique({
    where: { id },
    select: { clientId: true },
  });
  if (!arte) return { erro: "Arte não encontrada." };

  const user = await podeRevisar(arte.clientId);
  if (!user) return { erro: "Só a direção pede correção." };

  const texto = motivo.trim();
  if (texto.length < 3) return { erro: "Escreva o que precisa ser corrigido." };

  await prisma.studioArte.update({
    where: { id },
    data: {
      status: "CORRIGIR",
      correcao: texto.slice(0, 2000),
      revisadoPorId: user.id,
      revisadoEm: new Date(),
    },
  });

  revalidar(id);
  return { ok: "Correção pedida." };
}

export async function apagarArte(id: string): Promise<StudioState> {
  const arte = await prisma.studioArte.findUnique({
    where: { id },
    select: { clientId: true },
  });
  if (!arte) return { erro: "Arte não encontrada." };

  const user = await podeRevisar(arte.clientId);
  if (!user) return { erro: "Só a direção apaga arte." };

  await prisma.studioArte.delete({ where: { id } });
  revalidar();
  return { ok: "Arte apagada." };
}

// ───────────────────────── A identidade da loja ──────────────────────────

export interface DadosDaMarca {
  layout: string;
  corPrimaria: string;
  corFundo: string;
  corTexto: string;
  telefone?: string;
  endereco?: string;
}

/**
 * Guarda as cores, a logo e o rodapé da loja.
 *
 * As cores são conferidas aqui porque cor inválida não quebra a arte de
 * forma visível — ela desenha com a cor errada, ou não desenha e ninguém
 * entende por quê. Melhor recusar na hora de salvar, onde há alguém olhando.
 *
 * A logo é opcional e vem no FormData. Sem ela a arte escreve o nome da loja
 * em letra, nunca uma logo inventada: logo mal-feita parece falsificação.
 */
export async function salvarMarca(
  clientId: string,
  dados: DadosDaMarca,
  formData: FormData
): Promise<StudioState> {
  const user = await podeRevisar(clientId);
  if (!user) return { erro: "Só a direção define a identidade visual da loja." };

  for (const [nome, valor] of [
    ["cor principal", dados.corPrimaria],
    ["cor de fundo", dados.corFundo],
    ["cor do texto", dados.corTexto],
  ] as const) {
    if (!FORMATO_DA_COR.test(valor.trim())) {
      return { erro: `A ${nome} precisa estar no formato #RRGGBB, por exemplo #FFC20E.` };
    }
  }

  let logoUrl: string | undefined;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (!logo.type.startsWith("image/")) return { erro: "A logo precisa ser uma imagem." };
    if (logo.size > FOTO_MAX_BYTES) return { erro: "Logo muito grande." };
    try {
      // `prepararLogo` e não `prepararFoto`: a logo precisa manter a
      // transparência, senão chega na arte com um retângulo de fundo em
      // cima da foto do carro.
      const pronta = await prepararLogo(Buffer.from(await logo.arrayBuffer()));
      logoUrl = pronta.dataUri;
    } catch {
      return { erro: "Não consegui ler essa imagem." };
    }
  }

  // Layout desconhecido vira o padrão em vez de erro: a lista de desenhos
  // muda com o tempo, e uma tela velha mandando um nome que saiu de cena
  // não pode impedir a pessoa de salvar o telefone da loja.
  const layout: Layout = (Object.keys(LAYOUTS) as Layout[]).includes(
    dados.layout as Layout
  )
    ? (dados.layout as Layout)
    : "degrade";

  const dadosComuns = {
    layout,
    corPrimaria: dados.corPrimaria.trim(),
    corFundo: dados.corFundo.trim(),
    corTexto: dados.corTexto.trim(),
    telefone: dados.telefone?.trim() || null,
    endereco: dados.endereco?.trim() || null,
  };

  await prisma.studioMarca.upsert({
    where: { clientId },
    update: { ...dadosComuns, ...(logoUrl ? { logoUrl } : {}) },
    create: { clientId, ...dadosComuns, logoUrl: logoUrl ?? null },
  });

  revalidar();
  revalidatePath(`/studio/marca/${clientId}`);
  return { ok: "Identidade guardada. As artes desta loja já saem com ela." };
}
