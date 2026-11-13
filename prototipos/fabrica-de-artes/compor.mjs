// O motor de composição.
//
// Entra a cena (imagem) e o plano (JSON); sai a arte nos três formatos. Tudo
// que é DADO — modelo, ano, km, preço, nome e logo da loja — é escrito aqui,
// a partir do cadastro, e nunca passou pelo modelo de imagem.
//
// ── Por que as três medidas saem da LARGURA ──────────────────────────────
//
// Os três formatos têm 1080 de largura e alturas diferentes (1080, 1350,
// 1920). Se a barra de baixo fosse "24% da altura", no Stories ela viraria um
// bloco de 460px e a peça ficaria com cara de outra campanha. Medindo tudo
// pela largura, a barra, o preço e o título saem do mesmo tamanho nos três, e
// só o espaço de respiro da foto muda. É assim que a peça continua a mesma
// peça nos três lugares.

import { ImageResponse } from "next/og.js";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { contraste, corLegivel, letraSobre } from "./cores.mjs";

const ASSETS = new URL("../../assets/", import.meta.url).pathname;
const [ANTON, ROBOTO] = await Promise.all([
  readFile(`${ASSETS}/Anton-Regular.ttf`),
  readFile(`${ASSETS}/Roboto-Regular.ttf`),
]);

// `cena` diz de qual das duas cenas geradas o formato se serve. Gerar uma só
// e recortar pros três sai mais barato e foi a primeira tentativa: o Stories
// saiu com a frente e a caçamba cortadas, porque espremer 1:1 em 9:16 joga
// fora 44% da largura. Duas cenas custam ~R$0,70 em vez de ~R$0,35 e resolvem.
export const FORMATOS = {
  feed: { largura: 1080, altura: 1080, rotulo: "Feed 1:1", cena: "quadrada" },
  retrato: { largura: 1080, altura: 1350, rotulo: "Feed 4:5", cena: "retrato" },
  story: { largura: 1080, altura: 1920, rotulo: "Stories 9:16", cena: "retrato" },
};

// Atalhos pra escrever a árvore do Satori sem JSX num arquivo solto.
//
// O `limpo` não é frescura: o Satori lê cada propriedade do estilo e chama
// .trim() nela. Uma chave com `undefined` — o caso normal de "só põe gradiente
// se a barra for degradê" — derruba o desenho inteiro com "Cannot read
// properties of undefined", sem dizer qual propriedade era.
const limpo = (style) => Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined));
const h = (style, children) => ({ type: "div", props: { style: limpo(style), children } });
const txt = (style, children) => ({ type: "div", props: { style: limpo(style), children } });
const img = (src, style) => ({ type: "img", props: { src, style: limpo(style) } });

const uri = (buf, tipo = "png") => `data:image/${tipo};base64,${buf.toString("base64")}`;


/**
 * Encaixa a cena no formato pedido SEM nunca cortar largura.
 *
 * ── Por que a largura é intocável ────────────────────────────────────────
 *
 * Porque é onde o carro é comprido. Cortar altura tira céu e chão, que não
 * fazem falta; cortar largura tira para-choque e caçamba, e o cliente abre o
 * Stories e vê meia picape. Então a cena sempre entra na largura cheia, e a
 * altura se resolve: sobrou, corta por cima (o chão é mais útil que o teto);
 * faltou, estica a primeira linha de pixels pra cima.
 *
 * Esticar funciona porque o topo da cena é fundo liso — gradiente, névoa,
 * parede. Numa foto comum isso borraria; aqui a cena foi feita pra isso.
 */
async function cenaNoFormato(cena, largura, altura) {
  const base = sharp(cena).resize({ width: largura });
  const { width: L, height: A } = await base.metadata();
  const escalada = await base.png().toBuffer();
  const alturaEscalada = Math.round((A * largura) / L);

  if (alturaEscalada >= altura) {
    return sharp(escalada)
      .extract({ left: 0, top: alturaEscalada - altura, width: largura, height: altura })
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  const faltam = altura - alturaEscalada;
  const emenda = await sharp(escalada)
    .extract({ left: 0, top: 0, width: largura, height: 1 })
    .resize(largura, faltam, { fit: "fill" })
    .png()
    .toBuffer();

  return sharp({
    create: { width: largura, height: altura, channels: 3, background: "#000000" },
  })
    .composite([
      { input: emenda, top: 0, left: 0 },
      { input: escalada, top: faltam, left: 0 },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Quão clara é a faixa de cima da cena, de 0 (preta) a 1 (branca).
 *
 * Isto existe porque o véu sozinho não basta. Ele escurece uma porcentagem
 * fixa, o que dá certo num showroom preto e falha numa parede de concreto ao
 * meio-dia: o título continha branco sobre cinza-claro, e a chamada vermelha
 * sumia. Medindo, o véu aperta onde a cena é clara e alivia onde é escura.
 */
async function brilhoDoTopo(fundo, largura, altura, pctVeu) {
  const faixa = Math.max(Math.round(altura * 0.18), Math.round(altura * (pctVeu / 100)));

  // O .toBuffer() no meio não é desperdício: `stats()` no sharp lê a IMAGEM
  // DE ENTRADA e ignora o extract que está pendente na fila. Encadeado, ele
  // devolvia a média da cena inteira — o mesmo número pra qualquer faixa que
  // se pedisse, e o véu calculado em cima de um carro branco no meio da peça
  // em vez do céu lá em cima. Materializar o recorte primeiro resolve.
  const recorte = await sharp(fundo)
    .extract({ left: 0, top: 0, width: largura, height: Math.min(faixa, altura) })
    .toBuffer();
  const { channels } = await sharp(recorte).stats();
  const [r, g, b] = channels.slice(0, 3).map((c) => {
    const v = c.mean / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Cinza chapado com a luminância pedida, pra medir contraste contra ele. */
function cinzaCom(luz) {
  const linear = Math.max(0, Math.min(1, luz));
  const s = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  const v = Math.round(s * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${v}${v}${v}`;
}

/**
 * A cor média dos pixels OPACOS da logo.
 *
 * Opacos só: uma logo PNG é quase toda transparente, e incluir o vazio puxa a
 * média pro preto e faz qualquer logo parecer escura.
 */
async function corMediaDaLogo(logo) {
  const { data, info } = await sharp(logo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let p = 0; p < info.width * info.height; p++) {
    const a = data[p * info.channels + 3];
    if (a < 128) continue;
    r += data[p * info.channels];
    g += data[p * info.channels + 1];
    b += data[p * info.channels + 2];
    n++;
  }
  if (!n) return "#FFFFFF";
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

/** A fileira da ficha: ano, km, e o que mais houver. */
function fichaBlocos(itens, plano, L) {
  const { paleta: c } = plano;
  const corpo = L * 0.026;

  if (plano.fichaEstilo === "pastilhas") {
    return h(
      { display: "flex", gap: L * 0.012, flexWrap: "nowrap" },
      itens.map((i) =>
        txt(
          {
            display: "flex",
            fontFamily: "Roboto",
            fontSize: corpo,
            color: c.texto,
            backgroundColor: "rgba(255,255,255,0.10)",
            border: `2px solid ${c.destaque}`,
            borderRadius: L * 0.014,
            padding: `${L * 0.009}px ${L * 0.018}px`,
            letterSpacing: 1,
          },
          i
        )
      )
    );
  }

  // "linha": itens separados por um fio na cor de destaque.
  const filhos = [];
  itens.forEach((i, n) => {
    if (n > 0) {
      filhos.push(
        h({ display: "flex", width: 2, height: corpo * 1.4, backgroundColor: c.destaque }, [])
      );
    }
    filhos.push(
      txt(
        { display: "flex", fontFamily: "Roboto", fontSize: corpo, color: c.textoFraco, letterSpacing: 2 },
        i
      )
    );
  });
  return h({ display: "flex", alignItems: "center", gap: L * 0.022 }, filhos);
}

/**
 * Desenha a camada de dados. Fundo transparente: a cena entra por baixo no
 * sharp, não aqui, porque o Satori reamostra imagem grande com qualidade pior
 * que o sharp e a foto do carro é o que o cliente olha primeiro.
 */
async function camadaDeDados({ plano, dados, logo, L, A, veuAlfa, fundoDoTopo, corDaLogo }) {
  const { paleta: c } = plano;
  // O que vai SOBRE A FOTO é conferido contra o cinza que o véu realmente
  // deixa, não contra uma suposição. A chamada mira 3:1 e não 4,5 porque é
  // texto espaçado e pequeno de apoio — e porque exigir 4,5 dela apagaria a
  // cor de marca em toda cena clara, que é justamente a identidade da loja.
  const trocas = [];
  const corTitulo = corLegivel(c.topo, fundoDoTopo, 4.5, "título", trocas);
  const corChamada =
    contraste(c.destaque, fundoDoTopo) >= 3 ? c.destaque : corTitulo;
  const barra = L * (plano.barraAlturaPct / 100);
  const margem = L * 0.055;


  const esquerda = plano.logoCanto === "esquerdo";
  const alinhaTitulo = plano.tituloCanto === "esquerdo" ? "flex-start" : "flex-end";

  const topo = [];

  // A logo. Quando a loja não tem logo cadastrada entra o nome escrito — e
  // não um símbolo inventado, que seria pior que não ter nada.
  //
  // O fundinho atrás dela existe porque a trava de contraste confere TEXTO, e
  // logo é imagem: a logo vermelha da Área 42 sobre uma parede clara ficou
  // quase invisível e passou por todas as conferências. Aqui a cor média dos
  // pixels opacos da logo é medida contra o fundo que o véu deixa, e o
  // fundinho só entra quando ela não se sustenta sozinha — numa cena escura
  // ele não aparece, que é como tem que ser.
  const precisaDeFundinho = logo && contraste(corDaLogo, fundoDoTopo) < 2.5;
  const marca = logo
    ? h(
        {
          display: "flex",
          padding: precisaDeFundinho ? `${L * 0.014}px ${L * 0.02}px` : 0,
          borderRadius: L * 0.012,
          backgroundColor: precisaDeFundinho ? "rgba(0,0,0,0.62)" : undefined,
        },
        [img(uri(logo), { height: L * 0.075, objectFit: "contain" })]
      )
    : txt(
        {
          display: "flex",
          fontFamily: "Anton",
          fontSize: L * 0.034,
          color: corTitulo,
          letterSpacing: 3,
        },
        dados.loja.toUpperCase()
      );

  const tituloBloco = h(
    { display: "flex", flexDirection: "column", alignItems: alinhaTitulo, gap: L * 0.008 },
    [
      plano.chamada
        ? txt(
            {
              display: "flex",
              fontFamily: "Roboto",
              fontSize: L * 0.024,
              color: corChamada,
              letterSpacing: 4,
            },
            plano.chamada
          )
        : null,
      txt(
        {
          display: "flex",
          fontFamily: "Anton",
          // c.topo e não c.texto: aqui o fundo é a FOTO escurecida pelo véu,
          // não a barra. Usar a mesma cor nos dois lugares publicou um
          // "SAVEIRO CROSS" cinza-escuro sobre preto no Stories.
          fontSize: L * 0.095 * plano.escalaTitulo,
          color: corTitulo,
          lineHeight: 1,
          letterSpacing: -1,
          textTransform: "uppercase",
          textAlign: plano.tituloCanto === "esquerdo" ? "left" : "right",
        },
        dados.modelo
      ),
      plano.selo
        ? txt(
            {
              display: "flex",
              fontFamily: "Anton",
              fontSize: L * 0.028,
              // Antes isto comparava com precoTexto e saiu preto sobre
              // preto — o selo "REVISADA" ficou invisível na proposta do
              // pôr do sol. Quem decide a cor da letra é o brilho do fundo
              // que ela vai ocupar, e mais nada.
              color: letraSobre(c.destaque),
              backgroundColor: c.destaque,
              padding: `${L * 0.006}px ${L * 0.016}px`,
              letterSpacing: 2,
            },
            plano.selo
          )
        : null,
    ].filter(Boolean)
  );

  topo.push(esquerda ? marca : tituloBloco);
  topo.push(esquerda ? tituloBloco : marca);

  const precoBloco =
    plano.precoEstilo === "caixa"
      ? h(
          {
            display: "flex",
            alignItems: "baseline",
            gap: L * 0.012,
            backgroundColor: c.destaque,
            padding: `${L * 0.012}px ${L * 0.032}px`,
            borderRadius: L * 0.012,
          },
          [
            txt(
              { display: "flex", fontFamily: "Anton", fontSize: L * 0.038, color: c.precoTexto },
              "R$"
            ),
            txt(
              {
                display: "flex",
                fontFamily: "Anton",
                fontSize: L * 0.085 * plano.escalaPreco,
                color: c.precoTexto,
                lineHeight: 1,
              },
              dados.preco
            ),
          ]
        )
      : h({ display: "flex", alignItems: "baseline", gap: L * 0.012 }, [
          txt(
            { display: "flex", fontFamily: "Anton", fontSize: L * 0.038, color: c.destaque },
            "R$"
          ),
          txt(
            {
              display: "flex",
              fontFamily: "Anton",
              fontSize: L * 0.095 * plano.escalaPreco,
              color: c.destaque,
              lineHeight: 1,
            },
            dados.preco
          ),
        ]);

  const arvore = h(
    {
      width: L,
      height: A,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      position: "relative",
    },
    [
      // véu de cima: sem ele o título branco some num céu claro
      h(
        {
          position: "absolute",
          top: 0,
          left: 0,
          width: L,
          height: Math.max(A * (plano.veuTopoPct / 100), A * 0.22),
          display: "flex",
          backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,${veuAlfa.toFixed(2)}), rgba(0,0,0,0))`,
        },
        []
      ),
      h(
        {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          padding: margem,
          width: L,
        },
        topo
      ),
      h(
        {
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: L * 0.022,
          width: L,
          height: barra,
          padding: `0 ${margem}px`,
          backgroundColor: plano.barraEstilo === "solida" ? c.barra : "transparent",
          backgroundImage:
            plano.barraEstilo === "degrade"
              ? `linear-gradient(to bottom, rgba(0,0,0,0), ${c.barra} 38%, ${c.barra})`
              : undefined,
        },
        [
          fichaBlocos(dados.ficha, plano, L),
          h({ display: "flex", alignItems: "flex-end", justifyContent: "space-between", width: L - margem * 2 }, [
            precoBloco,
            txt(
              {
                display: "flex",
                fontFamily: "Roboto",
                fontSize: L * 0.021,
                color: c.textoFraco,
                letterSpacing: 2,
                paddingBottom: L * 0.01,
              },
              dados.rodape
            ),
          ]),
        ]
      ),
    ]
  );

  if (trocas.length) for (const t of trocas) console.log(`     contraste na peça · ${t}`);
  if (process.env.ESPIAR) console.log(`     [espiar] veuAlfa=${veuAlfa} fundoDoTopo=${fundoDoTopo} veuAltura=${Math.max(A * (plano.veuTopoPct / 100), A * 0.22)}`);

  const r = new ImageResponse(arvore, {
    width: L,
    height: A,
    fonts: [
      { name: "Anton", data: ANTON, style: "normal", weight: 400 },
      { name: "Roboto", data: ROBOTO, style: "normal", weight: 400 },
    ],
  });
  return Buffer.from(await r.arrayBuffer());
}

/** A arte pronta de um formato: cena por baixo, dados por cima. */
export async function compor({ cenas, plano, dados, logo, formato }) {
  const { largura: L, altura: A, cena: qual } = FORMATOS[formato];
  const fundo = await cenaNoFormato(cenas[qual], L, A);

  // O véu aperta até a faixa de cima chegar perto de preto, e não mais que
  // isso: 0,93 de opacidade já apaga a cena inteira e a peça vira um cartaz
  // com uma tarja. 0,60 é o piso pra cena escura, que não precisa de ajuda.
  const luz = await brilhoDoTopo(fundo, L, A, plano.veuTopoPct);
  const veuAlfa = Math.min(0.93, Math.max(0.6, 1 - 0.05 / Math.max(luz, 0.004)));
  const fundoDoTopo = cinzaCom(luz * (1 - veuAlfa));

  const corDaLogo = logo ? await corMediaDaLogo(logo) : "#FFFFFF";
  const camada = await camadaDeDados({ plano, dados, logo, L, A, veuAlfa, fundoDoTopo, corDaLogo });
  if (process.env.ESPIAR) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`espiar-camada-${formato}.png`, camada);
  }
  return sharp(fundo)
    .composite([{ input: camada, top: 0, left: 0 }])
    .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
