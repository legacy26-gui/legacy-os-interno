// O diretor de arte.
//
// Ele não desenha nada. Ele decide: que cenário o carro vai ocupar, que cores
// a peça usa, onde cada bloco senta, que frase de chamada entra. Sai um JSON,
// e é o motor de composição que obedece.
//
// ── Por que um JSON no meio, e não o modelo desenhando tudo ──────────────
//
// Porque preço errado é o único defeito que não dá pra "ir deixando". Um
// modelo de imagem que escreve R$ 54.900 troca um dígito de vez em quando, e
// ninguém revisa trinta artes com régua. Com o plano no meio, o número que
// chega na arte é o mesmo que saiu do cadastro, sempre — o modelo nunca viu.
//
// Em troca a gente perde liberdade: o motor só sabe desenhar o que está no
// esquema abaixo. Por isso o esquema tem as alavancas que mudam a CARA da
// peça (cena, paleta, proporção, estilo da barra, lado do título) e não só o
// enfeite.

import { perguntar } from "./openai.mjs";
import { corLegivel, letraSobre } from "./cores.mjs";

/** O modelo que dirige. Quem avalia é outro, de propósito. */
export const MODELO_DIRETOR = "gpt-4.1";

const ESQUEMA = `{
  "nome": "nome curto da proposta, 2 ou 3 palavras",
  "conceito": "uma frase explicando a ideia visual",
  "cena": "instrução para o modelo de imagem montar o cenário em volta do veículo",
  "paleta": {
    "barra": "#RRGGBB — fundo do bloco de baixo",
    "destaque": "#RRGGBB — cor de marca, usada na caixa de preço e nos fios",
    "topo": "#RRGGBB — nome do modelo e chamada, que ficam SOBRE A FOTO escurecida; precisa ser clara",
    "texto": "#RRGGBB — texto sobre a BARRA; precisa contrastar com barra",
    "textoFraco": "#RRGGBB — texto secundário sobre a barra",
    "precoTexto": "#RRGGBB — número do preço, tem que contrastar com destaque"
  },
  "barraAlturaPct": 22,
  "barraEstilo": "solida ou degrade",
  "tituloCanto": "esquerdo ou direito",
  "logoCanto": "esquerdo ou direito",
  "chamada": "frase curta em maiúsculas, no máximo 26 caracteres",
  "selo": "palavra curta em maiúsculas ou null",
  "fichaEstilo": "linha ou pastilhas",
  "precoEstilo": "caixa ou solto",
  "escalaTitulo": 1.0,
  "escalaPreco": 1.0,
  "veuTopoPct": 30
}`;

const REGRAS = `REGRAS QUE NÃO SE NEGOCIAM:

1. O campo "cena" vai direto para o modelo de imagem junto com a FOTO REAL do veículo. Escreva nele:
   - que o veículo deve ser mantido exatamente como está (mesma carroceria, cor, rodas, placa, adesivos, emblemas, ângulo). Ele não pode ser redesenhado, trocado de modelo nem "melhorado".
   - que todo o resto da foto sai: outros carros, pátio, cobertura, rua, placas de loja, pessoas.
   - o cenário que entra no lugar, a luz, o chão e o enquadramento.
   - que a imagem NÃO pode conter nenhum texto, número, logotipo, marca d'água ou selo.
2. NUNCA escreva em "cena" o preço, o ano, a quilometragem, o nome do modelo nem o nome da loja. Esses dados são aplicados depois, por cima, e não podem passar pelo modelo de imagem.
3. Não invente logotipo, selo de garantia, bandeira de banco nem nada que pareça marca de terceiro.
4. "chamada" é texto de vitrine, não descrição: "ÚNICO DONO", "PRONTA PRA TRABALHAR", "IPVA PAGO". Nunca repita o nome do modelo nem o preço.
4b. "selo" também não pode repetir nenhuma palavra do nome do modelo. Numa Saveiro Cross, selo "CROSS" aparece duas vezes na mesma peça e parece erro. Se não houver nada a dizer que já não esteja dito, mande null — selo vazio é melhor que selo redundante.
5. CONTRASTE. A peça tem dois fundos diferentes e cada um pede sua cor:
   - "topo" fica sobre a FOTO escurecida pelo véu — é fundo escuro, então use cor clara. Cinza-escuro aqui some.
   - "texto" e "textoFraco" ficam sobre "barra" — tem que ler contra ELA, não contra a foto.
   - "precoTexto" fica sobre "destaque".
   Em todos, mire razão de contraste de 4,5:1 ou mais. Cor que não passa é trocada automaticamente, e a sua escolha se perde.
6. tituloCanto e logoCanto devem ser opostos, senão os dois brigam pelo mesmo canto.`;

function ficha(v) {
  return [
    `modelo: ${v.modelo}`,
    v.ano ? `ano: ${v.ano}` : null,
    v.km ? `quilometragem: ${v.km}` : null,
    v.preco ? `preço: ${v.preco}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

/** Três propostas de uma vez, com instrução explícita de serem diferentes. */
export async function tresPropostas({ veiculo, loja }) {
  const r = await perguntar({
    modelo: MODELO_DIRETOR,
    etapa: "direção de arte",
    sistema:
      "Você é diretor de arte de uma agência que atende revendas de veículos no Brasil. Entrega publicidade de vitrine: direta, com hierarquia forte e preço que se lê a três metros. Responde só JSON.",
    usuario: `Monte TRÊS propostas visuais para o anúncio deste veículo.

VEÍCULO (dados do cadastro, só pra você entender a peça — ver regra 2)
${ficha(veiculo)}

LOJA
nome: ${loja.nome}
cores da marca: ${loja.cores}
caráter: ${loja.carater}

${REGRAS}

As três propostas têm que ser REALMENTE diferentes entre si — cenário, clima de luz, paleta e arranjo. Não entregue três variações da mesma ideia com a cor trocada.

Responda: {"propostas":[P1,P2,P3]} onde cada P é exatamente este objeto:
${ESQUEMA}`,
    teto: 3000,
  });

  const ps = r.propostas;
  if (!Array.isArray(ps) || ps.length !== 3) {
    throw new Error(`o diretor devolveu ${ps?.length ?? 0} propostas em vez de 3`);
  }
  return ps.map((p) => normalizar(p, veiculo));
}

/**
 * Uma rodada de correção.
 *
 * O diretor recebe o plano que reprovou e o parecer do avaliador, e devolve o
 * plano consertado. Recebe o plano INTEIRO de volta, e não só os defeitos,
 * porque senão ele reescreve do zero: conserta a legibilidade e de quebra
 * joga fora a composição que já tinha passado.
 */
export async function corrigir({ veiculo, loja, plano, parecer, tentativa }) {
  const r = await perguntar({
    modelo: MODELO_DIRETOR,
    etapa: `correção ${tentativa}`,
    sistema:
      "Você é diretor de arte e está revisando uma peça que foi reprovada. Responde só JSON.",
    usuario: `Esta é a tentativa ${tentativa}. A peça abaixo foi reprovada na revisão.

VEÍCULO
${ficha(veiculo)}

LOJA
nome: ${loja.nome} | cores: ${loja.cores}

PLANO QUE FOI REPROVADO
${JSON.stringify(plano, null, 1)}

NOTAS DA REVISÃO (0 a 10)
${JSON.stringify(parecer.notas, null, 1)}

O QUE PRECISA MUDAR
${parecer.problemas.map((p, i) => `${i + 1}. [${p.categoria}] ${p.oque}\n   caminho sugerido: ${p.comoCorrigir}`).join("\n")}

Conserte SÓ o que foi apontado. O que não foi criticado fica como está — nota 8 que vira 6 porque você mexeu é prejuízo.

${REGRAS}

Responda: {"mudancas":["o que você mudou, uma linha por item"],"plano":${ESQUEMA}}`,
    teto: 3000,
  });

  if (!r.plano) throw new Error("a correção não veio com um plano");
  return { plano: normalizar(r.plano, veiculo), mudancas: r.mudancas ?? [] };
}

/**
 * Aparar o que vier fora do esperado.
 *
 * O modelo acerta o esquema quase sempre. "Quase" é o problema: uma barra de
 * 60% engole a arte, uma escala de 3 estoura o texto pra fora da tela, e o
 * jeito de descobrir seria olhando a peça pronta. Mais barato prender aqui.
 */
function normalizar(p, veiculo) {
  const entre = (v, min, max, padrao) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : padrao;
  const umDe = (v, opcoes, padrao) => (opcoes.includes(v) ? v : padrao);
  const cor = (v, padrao) => (/^#[0-9a-fA-F]{6}$/.test(v ?? "") ? v : padrao);

  const pal = p.paleta ?? {};
  const trocas = [];
  const logoCanto = umDe(p.logoCanto, ["esquerdo", "direito"], "esquerdo");

  return {
    nome: String(p.nome ?? "sem nome").slice(0, 40),
    conceito: String(p.conceito ?? "").slice(0, 200),
    cena: String(p.cena ?? ""),
    paleta: paletaLegivel(pal, trocas),
    trocasDeCor: trocas,
    barraAlturaPct: entre(p.barraAlturaPct, 18, 34, 24),
    barraEstilo: umDe(p.barraEstilo, ["solida", "degrade"], "solida"),
    // Se o modelo puser os dois no mesmo canto, o título cede: a logo da loja
    // tem lugar fixo na identidade, o nome do carro não.
    logoCanto,
    tituloCanto: logoCanto === "esquerdo" ? "direito" : "esquerdo",
    // Cortar no caractere 18 publicou "PRONTA PRA TRABALH" na primeira
    // rodada — e o avaliador deu 8 em legibilidade sem ver. Cortar na palavra
    // consertou o meio da palavra e criou outro: "PRONTA PRA", que não quer
    // dizer nada. 18 é curto pra português; 26 cabe na mesma linha.
    chamada: cortarNaPalavra(String(p.chamada ?? "").toUpperCase(), 26),
    // O selo repetido é o erro que a instrução sozinha não segurou: na
    // primeira rodada veio "CROSS" numa Saveiro Cross, escrito duas vezes na
    // mesma peça. A trava é aqui porque é aqui que dá pra comparar.
    selo: seloUtil(p.selo, veiculo.modelo),
    fichaEstilo: umDe(p.fichaEstilo, ["linha", "pastilhas"], "linha"),
    precoEstilo: umDe(p.precoEstilo, ["caixa", "solto"], "caixa"),
    escalaTitulo: entre(p.escalaTitulo, 0.8, 1.3, 1),
    escalaPreco: entre(p.escalaPreco, 0.8, 1.3, 1),
    veuTopoPct: entre(p.veuTopoPct, 0, 45, 30),
  };
}

/** Descarta o selo que só repete uma palavra que o título já diz. */
function seloUtil(selo, modelo) {
  if (!selo) return null;
  const limpo = String(selo).toUpperCase().trim().slice(0, 12);
  if (!limpo) return null;
  const ditas = new Set(
    String(modelo)
      .toUpperCase()
      .split(/[^A-ZÀ-Ú0-9]+/)
      .filter(Boolean)
  );
  const palavras = limpo.split(/[^A-ZÀ-Ú0-9]+/).filter(Boolean);
  if (palavras.length && palavras.every((w) => ditas.has(w))) return null;
  return limpo;
}

/** Encurta sem partir palavra. Frase cortada no meio é erro que vai ao ar. */
function cortarNaPalavra(texto, teto) {
  const limpo = texto.trim();
  if (limpo.length <= teto) return limpo;
  const corte = limpo.slice(0, teto + 1);
  const espaco = corte.lastIndexOf(" ");
  return (espaco > 0 ? corte.slice(0, espaco) : limpo.slice(0, teto)).trim();
}

/**
 * A paleta depois da conferência de contraste.
 *
 * O "topo" é medido contra #121212 e não contra a foto: o véu escurece o alto
 * da cena até perto disso, e medir contra a imagem real daria um número
 * diferente a cada carro — trava que muda de opinião não trava nada.
 */
const FUNDO_DO_VEU = "#121212";

function paletaLegivel(pal, trocas) {
  const hex = (v, padrao) => (/^#[0-9a-fA-F]{6}$/.test(v ?? "") ? v.toUpperCase() : padrao);

  const barra = hex(pal.barra, "#0B0B0C");
  const destaque = hex(pal.destaque, "#E21E2D");

  return {
    barra,
    destaque,
    topo: corLegivel(hex(pal.topo, "#FFFFFF"), FUNDO_DO_VEU, 4.5, "topo", trocas),
    texto: corLegivel(hex(pal.texto, letraSobre(barra)), barra, 4.5, "texto", trocas),
    // 3:1 no secundário: é a ficha, texto de apoio, e exigir 4,5 aqui apagaria
    // a diferença entre ela e o texto principal — tudo vira branco.
    textoFraco: corLegivel(hex(pal.textoFraco, "#A8A8AD"), barra, 3, "textoFraco", trocas),
    precoTexto: corLegivel(hex(pal.precoTexto, letraSobre(destaque)), destaque, 4.5, "precoTexto", trocas),
  };
}
