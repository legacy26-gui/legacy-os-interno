// A fábrica rodando de ponta a ponta.
//
//   foto real → diretor → cena → composição → avaliação → correção → entrega
//
// Guarda tudo: cada versão, cada nota, cada centavo. Uma peça que ninguém
// consegue explicar depois não serve pra decidir nada.

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tresPropostas, corrigir, MODELO_DIRETOR } from "./diretor.mjs";
import { avaliar, MODELO_AVALIADOR, MEDIA_MINIMA, PISO_POR_CATEGORIA } from "./avaliador.mjs";
import { montarCena, custoTotal, gastos } from "./openai.mjs";
import { compor, FORMATOS } from "./compor.mjs";

const SAIDA = new URL("saida/", import.meta.url).pathname;
mkdirSync(SAIDA, { recursive: true });

/** Teto de tentativas. Na quarta, o problema não é a arte: é o pedido. */
const TENTATIVAS = 3;

const FOTO = "/tmp/claude-0/-home-user-legacy-os-interno/1d1b326c-8b67-54a3-aaf1-a5cdf3a09168/images/37.jpg";

const loja = {
  nome: "Área 42 Motors",
  cores: "vermelho #E21E2D sobre preto",
  carater: "revenda de seminovos, pegada direta e popular, interior do Paraná",
};

const veiculo = {
  modelo: "Saveiro Cross",
  ano: "2015",
  km: "98.000 km",
  preco: "R$ 74.900",
};

const dados = {
  loja: loja.nome,
  modelo: veiculo.modelo,
  preco: "74.900",
  ficha: ["2015", "98.000 KM", "COMPLETA"],
  rodape: "(42) 9 8879-0509",
};

const foto = readFileSync(FOTO);
const logo = readFileSync(new URL("logo-area42.png", import.meta.url));
const registro = { comecou: new Date().toISOString(), propostas: [], ciclo: null };

const fmt = (n) => n.toFixed(1).replace(".", ",");

function boletim(a) {
  return Object.entries(a.notas)
    .map(([k, n]) => `${k} ${fmt(n)}`)
    .join(" · ");
}

/** Gera a cena e monta a arte de um formato. */
async function peca({ plano, etapa, formato, cenas }) {
  const { cena: qual } = FORMATOS[formato];
  if (!cenas[qual]) {
    cenas[qual] = await montarCena({
      etapa: `${etapa} · cena ${qual}`,
      foto,
      prompt: plano.cena,
      tamanho: qual === "quadrada" ? "1024x1024" : "1024x1536",
    });
  }
  return compor({ cenas, plano, dados, logo, formato });
}

// ── 1. As três propostas ──────────────────────────────────────────────────
console.log(`\nDIREÇÃO DE ARTE (${MODELO_DIRETOR})`);
const planos = await tresPropostas({ veiculo, loja });
planos.forEach((p, i) => {
  console.log(`  ${i + 1}. ${p.nome} — ${p.conceito}`);
  // As trocas de cor aparecem porque correção silenciosa esconde que o
  // diretor está errando sempre no mesmo lugar.
  p.trocasDeCor?.forEach((t) => console.log(`     contraste · ${t}`));
});

console.log(`\nMONTANDO E AVALIANDO (${MODELO_AVALIADOR})`);
const avaliadas = [];
for (const [i, plano] of planos.entries()) {
  const n = i + 1;
  const cenas = {};
  const arte = await peca({ plano, etapa: `proposta ${n}`, formato: "feed", cenas });
  writeFileSync(`${SAIDA}proposta-${n}-feed.jpg`, arte);
  writeFileSync(`${SAIDA}proposta-${n}-plano.json`, JSON.stringify(plano, null, 2));

  const a = await avaliar({ fotoOriginal: foto, arte, dados, tentativa: `proposta ${n}` });
  console.log(`  ${n}. ${plano.nome}: média ${fmt(a.media)} ${a.passou ? "✓ aprovada" : "✗ reprovada"}`);
  console.log(`     ${boletim(a)}`);
  if (a.dadosErrados.length) console.log(`     DADO ERRADO: ${a.dadosErrados.join(" | ")}`);

  avaliadas.push({ n, plano, cenas, arte, a });
  registro.propostas.push({ n, plano, notas: a.notas, media: a.media, passou: a.passou, parecer: a.parecer, problemas: a.problemas });
}

// ── 2. O ciclo de correção ────────────────────────────────────────────────
//
// O ciclo precisa de uma arte REPROVADA pra provar alguma coisa. Se as três
// propostas passarem — e na primeira rodada as três passaram — não há o que
// consertar, e dizer "o ciclo funciona" sem ter rodado seria conversa.
//
// Então: se a pior reprovou, o ciclo pega ela. Se não reprovou nenhuma, entra
// um plano RUIM DE PROPÓSITO, escrito à mão aqui embaixo. Ele é ruim dentro
// das regras — todos os valores passam na normalização do diretor, é o tipo
// de plano que o modelo pode cuspir num dia infeliz. Isso fica dito no
// relatório: a peça reprovada do teste foi plantada, não sorteada.
const PLANO_RUIM = {
  nome: "Plano plantado (teste do ciclo)",
  conceito: "Peça ruim de propósito: cinza sobre cinza, barra enorme, preço miúdo.",
  cena: "Mantenha a picape exatamente como está — mesma carroceria, cor, rodas, placa, adesivos, emblemas e ângulo; não redesenhe o veículo. Remova todo o resto da foto: outros carros, pátio, cobertura, rua, placas de loja e pessoas. No lugar, um fundo branco estourado de sol ao meio-dia, céu claro e chão claro, sem contraste e sem sombra marcada. A imagem não pode conter nenhum texto, número, logotipo, marca d'água ou selo.",
  paleta: {
    barra: "#2B2B2E",
    destaque: "#4A4A50",
    topo: "#3A3A3F",
    texto: "#3A3A3F",
    textoFraco: "#33333A",
    precoTexto: "#55555A",
  },
  barraAlturaPct: 34,
  barraEstilo: "solida",
  logoCanto: "esquerdo",
  tituloCanto: "direito",
  chamada: "APROVEITE",
  selo: null,
  fichaEstilo: "linha",
  precoEstilo: "solto",
  escalaTitulo: 0.8,
  escalaPreco: 0.8,
  veuTopoPct: 0,
};

const pior = avaliadas.reduce((p, c) => (c.a.media < p.a.media ? c : p));
let plantado = false;
let alvo;

if (!pior.a.passou) {
  alvo = pior;
  console.log(`\nCICLO DE CORREÇÃO — a pior das três reprovou: ${alvo.n}. ${alvo.plano.nome} (${fmt(alvo.a.media)})`);
} else {
  plantado = true;
  console.log(`\nCICLO DE CORREÇÃO — as três passaram, então entra o plano plantado`);
  const cenas = {};
  const arte = await peca({ plano: PLANO_RUIM, etapa: "plano plantado", formato: "feed", cenas });
  writeFileSync(`${SAIDA}correcao-0-feed.jpg`, arte);
  const a = await avaliar({ fotoOriginal: foto, arte, dados, tentativa: "plano plantado" });
  console.log(`  ponto de partida: média ${fmt(a.media)} ${a.passou ? "✓ (plantado passou, o teste não serve)" : "✗ reprovada"}`);
  console.log(`  ${boletim(a)}`);
  a.problemas.forEach((p) => console.log(`     [${p.categoria}] ${p.oque}`));
  alvo = { n: 0, plano: PLANO_RUIM, cenas, arte, a };
}

let plano = alvo.plano;
let parecer = alvo.a;
let cenas = alvo.cenas;
let arte = alvo.arte;
const rodadas = [{ tentativa: 0, media: parecer.media, notas: parecer.notas, mudancas: [] }];

for (let t = 1; t <= TENTATIVAS && !parecer.passou; t++) {
  const { plano: novo, mudancas } = await corrigir({ veiculo, loja, plano, parecer, tentativa: t });
  console.log(`  tentativa ${t}: ${mudancas.join(" | ") || "(sem lista de mudanças)"}`);

  // A cena só se refaz se o diretor REESCREVEU a cena. Reclamação de
  // legibilidade se resolve mexendo em cor e tamanho; refazer a imagem a cada
  // rodada gastaria R$0,35 à toa e ainda traria um carro diferente do que já
  // tinha passado na fidelidade.
  const refazCena = novo.cena !== plano.cena;
  if (refazCena) cenas = {};
  console.log(`     cena: ${refazCena ? "refeita" : "aproveitada"}`);

  plano = novo;
  arte = await peca({ plano, etapa: `tentativa ${t}`, formato: "feed", cenas });
  writeFileSync(`${SAIDA}correcao-${t}-feed.jpg`, arte);

  parecer = await avaliar({ fotoOriginal: foto, arte, dados, tentativa: `tentativa ${t}` });
  console.log(`     média ${fmt(parecer.media)} ${parecer.passou ? "✓ aprovada" : "✗ ainda reprovada"}`);
  console.log(`     ${boletim(parecer)}`);
  rodadas.push({ tentativa: t, media: parecer.media, notas: parecer.notas, mudancas, cenaRefeita: refazCena });
}

registro.ciclo = {
  plantado,
  proposta: alvo.n,
  nome: alvo.plano.nome,
  rodadas,
  planoFinal: plano,
  aprovada: parecer.passou,
  ganho: parecer.media - rodadas[0].media,
};

// ── 3. Os três formatos da melhor peça ────────────────────────────────────
//
// A melhor sai de TODAS as candidatas: as três propostas e o resultado do
// ciclo. A versão anterior entregava a peça do ciclo sempre que ela passava —
// e como o ciclo pega a pior, isso podia publicar uma peça 8,0 tendo uma 8,6
// pronta ao lado.
const candidatas = [
  ...avaliadas.map((x) => ({ plano: x.plano, cenas: x.cenas, media: x.a.media, nome: x.plano.nome })),
  ...(parecer.passou
    ? [{ plano, cenas, media: parecer.media, nome: `${alvo.plano.nome} — depois do ciclo` }]
    : []),
];
const melhor = candidatas.reduce((m, x) => (x.media > m.media ? x : m));

console.log(`\nENTREGA NOS TRÊS FORMATOS — ${melhor.nome} (${fmt(melhor.media)})`);
for (const f of Object.keys(FORMATOS)) {
  const buf = await peca({ plano: melhor.plano, etapa: `entrega ${f}`, formato: f, cenas: melhor.cenas });
  writeFileSync(`${SAIDA}final-${f}.jpg`, buf);
  console.log(`  ${FORMATOS[f].rotulo} → final-${f}.jpg`);
}

// ── 4. A conta ────────────────────────────────────────────────────────────
const c = custoTotal();
const porEtapa = {};
for (const g of gastos) porEtapa[g.modelo] = (porEtapa[g.modelo] ?? 0) + g.brl;

console.log(`\nCUSTO — ${c.chamadas} chamadas`);
for (const [m, brl] of Object.entries(porEtapa)) console.log(`  ${m}: R$ ${brl.toFixed(2)}`);
console.log(`  TOTAL DO EXPERIMENTO: R$ ${c.brl.toFixed(2)} (US$ ${c.usd.toFixed(3)})`);

registro.custo = { ...c, porModelo: porEtapa, gastos };
registro.regra = { mediaMinima: MEDIA_MINIMA, pisoPorCategoria: PISO_POR_CATEGORIA, tentativas: TENTATIVAS };
registro.terminou = new Date().toISOString();
writeFileSync(`${SAIDA}registro.json`, JSON.stringify(registro, null, 2));
console.log(`\nregistro completo em ${SAIDA}registro.json`);
