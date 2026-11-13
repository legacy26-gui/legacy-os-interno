/* eslint-disable @next/next/no-img-element --
   O <Image> do Next é um componente de navegador. Aqui não há página: o
   Satori lê este JSX no servidor e devolve um PNG. A única tag que ele
   entende é <img>. Mesmo caso do relatório do cliente. */

import { ImageResponse } from "next/og";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { canAccessModule } from "@/lib/permissions";
import { clienteEDaCarteira } from "@/lib/carteira";
import { itensDaFicha, type IconeDaFicha } from "@/lib/studio/layouts";
import {
  FORMATOS,
  formatoValido,
  layoutDaLoja,
  enquadrar,
  precoDaArte,
  fichaDoVeiculo,
  corpoDoModelo,
  corpoDoPreco,
  paletaDaLoja,
  type Formato,
} from "@/lib/studio/arte";

// A arte de veículo, desenhada na hora.
//
// ── Por que desenhar na hora e não guardar o PNG ──────────────────────────
//
// Porque a arte é uma FUNÇÃO dos dados, não um arquivo. Guardando o PNG, o
// dia em que a loja trocar de logo ou a gente melhorar o layout deixaria
// trezentas artes antigas com a cara velha — e alguém teria que achar e
// refazer uma a uma. Desenhando na hora, trocar a logo conserta o acervo
// inteiro.
//
// Também é o que permite feed e Stories saírem do MESMO registro: são dois
// recortes da mesma informação, não duas peças que alguém precisa manter
// iguais.
//
// ── Por que a foto fica atrás e não dentro de uma moldura ────────────────
//
// Porque é assim que anúncio de carro funciona: quem está rolando o feed
// para por causa do carro, não da moldura. A informação entra por cima, em
// cima de um degradê que escurece só o pé da imagem — o suficiente pra letra
// branca ter contraste sem esconder a lataria.

export const runtime = "nodejs";

/**
 * Larguras que a miniatura pode pedir.
 *
 * Lista fechada e não número livre: `?w=` aberto deixaria qualquer um pedir
 * mil tamanhos diferentes da mesma arte, e cada um custa uma renderização
 * inteira. Duas larguras cobrem o uso real — a lista e a tela da peça.
 */
const LARGURAS = [360, 720] as const;

/**
 * Entrega como JPEG, não como PNG.
 *
 * O `ImageResponse` só devolve PNG. Pra uma arte que é 90% fotografia isso
 * dá 1,9 MB no feed e 3,1 MB no Stories — medido, não estimado. Em JPEG 90
 * a mesma peça fica em torno de 300 KB, sem diferença que se veja.
 *
 * O peso não é detalhe: a central mostra uma arte por cartão, e doze
 * cartões em PNG são vinte e tantos megabytes só pra abrir a tela.
 *
 * O `flatten` existe porque JPEG não tem transparência: sem ele, qualquer
 * canto que tenha sobrado transparente viraria preto em vez da cor de fundo
 * da loja.
 */
async function comoJpeg(
  resposta: ImageResponse,
  fundo: string,
  largura: number | null
): Promise<Buffer> {
  let img = sharp(Buffer.from(await resposta.arrayBuffer())).flatten({ background: fundo });
  if (largura) img = img.resize({ width: largura, withoutEnlargement: true });
  return img.jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!canAccessModule(user.role, "studio", user.email)) {
    return new Response("sem acesso", { status: 403 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const pedido = url.searchParams.get("formato");
  const formato: Formato = formatoValido(pedido) ? pedido : "feed";
  const pedidoDeLargura = Number(url.searchParams.get("w"));
  const larguraPedida =
    (LARGURAS as readonly number[]).includes(pedidoDeLargura) ? pedidoDeLargura : null;

  const arte = await prisma.studioArte.findUnique({
    where: { id },
    select: {
      clientId: true,
      fotoUrl: true,
      marca: true,
      modelo: true,
      versao: true,
      detalhes: true,
      precoDeCents: true,
      ano: true,
      kmTexto: true,
      precoCents: true,
      chamada: true,
      client: {
        select: {
          companyName: true,
          studioMarca: {
            select: {
              logoUrl: true,
              layout: true,
              corPrimaria: true,
              corFundo: true,
              corTexto: true,
              telefone: true,
              endereco: true,
            },
          },
        },
      },
    },
  });

  if (!arte) return new Response("não encontrada", { status: 404 });

  // A arte vem pelo id, e id se adivinha. A trava é a mesma do resto do
  // sistema: só se vê arte de loja da própria carteira. 404 e não 403, que
  // confirmaria que a arte existe.
  if (!(await clienteEDaCarteira(user, arte.clientId))) {
    return new Response("não encontrada", { status: 404 });
  }

  const m = arte.client.studioMarca;
  const cor = paletaDaLoja({
    primaria: m?.corPrimaria,
    fundo: m?.corFundo,
    texto: m?.corTexto,
  });

  const [anton, roboto] = await Promise.all([
    readFile(join(process.cwd(), "assets", "Anton-Regular.ttf")),
    readFile(join(process.cwd(), "assets", "Roboto-Regular.ttf")),
  ]);

  const { largura, altura } = FORMATOS[formato];
  const story = formato === "story";

  const preco = precoDaArte(arte.precoCents);
  const ficha = fichaDoVeiculo(arte.ano, arte.kmTexto);
  const rodape = [m?.telefone, m?.endereco].filter(Boolean).join("  ·  ");

  // A barra do rodapé é posicionada POR CIMA de tudo (position: absolute),
  // então o bloco de informação precisa reservar a altura dela — senão o
  // preço, que é a última linha e a maior, sai cortado pela barra.
  //
  // Isto aconteceu de verdade na primeira arte gerada: "R$ 89.900" apareceu
  // com a metade de baixo comida pela faixa azul. É o tipo de erro que não
  // dá erro nenhum: a imagem sai, com 200 KB, bonita no miniatura, e só
  // quem olha de perto percebe.
  const alturaDoRodape = rodape ? (story ? 82 : 68) : 0;

  // ── A geometria, que é o que muda entre os três layouts ───────────────
  //
  // O resto do desenho (logo, chamada, bloco de informação, rodapé) é o
  // mesmo nos três. O que os distingue é onde a foto acaba e o que vem
  // depois dela: um degradê, um bloco de cor chapada, ou nada.
  //
  // Está tudo aqui em cima, em números, em vez de espalhado em condicionais
  // no meio do JSX — assim dá pra conferir um layout inteiro lendo cinco
  // linhas, e ajustar um sem tocar nos outros.
  const layout = layoutDaLoja(m?.layout);

  /** Onde a foto termina, em pontos a partir do topo. */
  const fimDaFoto =
    layout === "faixa"
      ? Math.round(altura * (story ? 0.58 : 0.66))
      : layout === "degrade" && story
        ? Math.round(altura * 0.62)
        : altura;

  /** No "faixa" não há degradê: o bloco de cor chapada faz o contraste. */
  const temDegrade = layout !== "faixa";

  // Onde o degradê começa e onde ele precisa estar OPACO.
  //
  // No Stories do layout degradê a foto acaba no meio da arte. Se o degradê
  // não chegar opaco exatamente ali, aparece uma linha horizontal
  // atravessando a peça — e foi o que apareceu na primeira gerada.
  //
  // No feed e no "etiqueta" a foto cobre tudo, então o degradê só escurece
  // o pé e não há emenda possível.
  const fotoAcabaAntes = fimDaFoto < altura;
  const degradeComeca = fotoAcabaAntes
    ? fimDaFoto - 420
    : Math.round(altura * (layout === "etiqueta" ? 0.55 : 0.42));
  const alturaDoDegrade = altura - degradeComeca;
  const opacoEm = fotoAcabaAntes
    ? Math.round(((fimDaFoto - degradeComeca) / alturaDoDegrade) * 100)
    : 72;
  const respiro = story ? 60 : 44;

  // A foto já vem no formato exato que vai ocupar.
  //
  // Antes isto era `objectFit: cover` no desenho, e o corte saía do CENTRO:
  // uma foto deitada num Stories perdia 65% da largura e o carro aparecia
  // decepado. Agora o recorte é feito antes, pelo ponto de maior saliência
  // da imagem — e quando a perda passaria de 35%, não há recorte nenhum: a
  // foto entra inteira sobre uma cópia borrada dela mesma.
  const quadro = await enquadrar(arte.fotoUrl, largura, fimDaFoto);

  // ── O layout "vitrine" é outro desenho inteiro ─────────────────────────
  //
  // Os outros três são variações de um mesmo esqueleto (foto, informação no
  // pé, rodapé). Este veio das artes que a equipe faz à mão, e a composição
  // é diferente de verdade: marca e modelo empilhados no canto de cima,
  // ficha com ícones numa faixa escura, preço numa caixa de cor no meio.
  //
  // Por isso ele retorna aqui em vez de virar mais um punhado de
  // condicionais no JSX abaixo. Misturar os dois tornaria os quatro
  // ilegíveis pra economizar um `return`.
  const fontes = [
    { name: "Roboto", data: roboto, style: "normal" as const, weight: 400 as const },
    { name: "Anton", data: anton, style: "normal" as const, weight: 400 as const },
  ];

  if (layout === "vitrine") {
    const png = new ImageResponse(
      vitrine({ arte, foto: quadro.dataUri, m, cor, formato, largura, altura, story, preco, rodape }),
      { width: largura, height: altura, fonts: fontes }
    );
    return responder(await comoJpeg(png, cor.fundo, larguraPedida), arte.modelo, formato);
  }

  const png = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          backgroundColor: cor.fundo,
          fontFamily: "Roboto",
        }}
      >
        {/* A foto, sangrando. `cover` e não `contain`: faixa preta em cima e
            embaixo de um anúncio é a cara de arte feita com pressa. Recortar
            um pouco do carro é melhor do que emoldurá-lo de preto. */}
        <img
          src={quadro.dataUri}
          alt=""
          width={largura}
          height={fimDaFoto}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            objectFit: "cover",
          }}
        />

        {/* O degradê, nos layouts que o usam. Só o pé escurece: em cima a
            foto fica limpa. */}
        {temDegrade && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: alturaDoDegrade,
              display: "flex",
              backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0) 0%, ${cor.fundo}CC ${Math.round(opacoEm * 0.6)}%, ${cor.fundo} ${opacoEm}%)`,
            }}
          />
        )}

        {/* O layout "faixa": um fio da cor da marca separando a foto do
            bloco. Sem ele a emenda entre foto e cor chapada fica mole —
            com ele, parece decisão. */}
        {layout === "faixa" && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: fimDaFoto - 6,
              height: 6,
              display: "flex",
              backgroundColor: cor.primaria,
            }}
          />
        )}

        {/* A logo da loja, no alto. Quando não há marca cadastrada, o nome da
            loja em letra — nunca uma logo inventada. */}
        <div
          style={{
            position: "absolute",
            top: story ? 60 : 44,
            left: 54,
            right: 54,
            display: "flex",
            alignItems: "center",
          }}
        >
          {m?.logoUrl ? (
            <img src={m.logoUrl} alt="" height={story ? 96 : 78} style={{ objectFit: "contain" }} />
          ) : (
            <div
              style={{
                display: "flex",
                fontFamily: "Anton",
                fontSize: story ? 40 : 34,
                color: cor.texto,
                letterSpacing: 2,
                // Um fundo atrás do nome: sem logo, letra branca solta em
                // cima de foto clara some.
                backgroundColor: "rgba(0,0,0,0.55)",
                padding: "10px 20px",
                borderRadius: 12,
              }}
            >
              {arte.client.companyName.toUpperCase()}
            </div>
          )}
        </div>

        {/* A chamada — "Entrada + 48x", "Aceita troca". Fica em cima do bloco
            de informação, na cor da loja, porque é o argumento de venda. */}
        {arte.chamada && (
          <div
            style={{
              position: "absolute",
              left: 54,
              bottom: alturaDoRodape + (story ? 400 : 270),
              display: "flex",
              backgroundColor: cor.primaria,
              color: cor.fundo,
              fontFamily: "Anton",
              fontSize: story ? 36 : 30,
              letterSpacing: 1,
              padding: "12px 24px",
              borderRadius: 10,
            }}
          >
            {arte.chamada.toUpperCase()}
          </div>
        )}

        {/* O bloco de informação. Encostado embaixo, com `marginTop: auto`:
            assim o modelo comprido cresce pra CIMA, que é o espaço vazio da
            foto — e não pra baixo, pra fora da arte. */}
        <div
          style={{
            position: "relative",
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            paddingLeft: 54,
            paddingRight: 54,
            paddingBottom: alturaDoRodape + respiro,
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Anton",
              fontSize: corpoDoModelo(arte.modelo, formato),
              color: cor.texto,
              lineHeight: 1.05,
            }}
          >
            {arte.modelo.toUpperCase()}
          </div>

          {ficha && (
            <div
              style={{
                display: "flex",
                fontSize: story ? 34 : 30,
                color: cor.primaria,
                letterSpacing: 3,
                marginTop: 10,
              }}
            >
              {ficha}
            </div>
          )}

          {/* No layout "etiqueta" o preço não fica aqui: ele vira a
              etiqueta grande logo abaixo. Repetir nos dois lugares é o erro
              clássico de arte gerada — o mesmo número duas vezes na mesma
              peça. */}
          {preco && layout !== "etiqueta" && (
            <div
              style={{
                display: "flex",
                fontFamily: "Anton",
                fontSize: corpoDoPreco(preco, formato),
                color: cor.primaria,
                marginTop: 18,
                lineHeight: 1,
              }}
            >
              {preco}
            </div>
          )}
        </div>

        {/* O layout "etiqueta": o preço numa placa, encostado na direita.
            É o desenho de oferta — quem está rolando o feed vê o número
            antes de ler o nome do carro.

            `alignItems: flex-end` em vez de `right: 0`: assim a etiqueta
            tem a largura do preço, e "R$ 1.890.000" não estoura a arte nem
            "R$ 19.900" fica numa placa com vão vazio. */}
        {layout === "etiqueta" && preco && (
          <div
            style={{
              position: "absolute",
              right: 0,
              bottom: alturaDoRodape + (story ? 300 : 210),
              display: "flex",
              alignItems: "flex-end",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                backgroundColor: cor.primaria,
                color: cor.fundo,
                fontFamily: "Anton",
                fontSize: corpoDoPreco(preco, formato),
                lineHeight: 1,
                padding: story ? "22px 54px 22px 34px" : "18px 46px 18px 30px",
                borderTopLeftRadius: 18,
                borderBottomLeftRadius: 18,
              }}
            >
              {preco}
            </div>
          </div>
        )}

        {/* Telefone e endereço, quando a loja cadastrou. Barra na cor da
            marca, encostada no fim — é onde o olho vai depois do preço. */}
        {rodape && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: cor.primaria,
              color: cor.fundo,
              fontSize: story ? 30 : 26,
              letterSpacing: 1,
              padding: story ? "22px 0" : "18px 0",
            }}
          >
            {rodape}
          </div>
        )}
      </div>
    ),
    { width: largura, height: altura, fonts: fontes }
  );
  return responder(await comoJpeg(png, cor.fundo, larguraPedida), arte.modelo, formato);
}

/** A resposta final: JPEG, com o nome de arquivo que ajuda quem baixa. */
function responder(bytes: Buffer, modelo: string, formato: Formato): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${nomeDoArquivo(modelo, formato)}"`,
    },
  });
}

function nomeDoArquivo(modelo: string, formato: Formato) {
  const limpo = modelo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${limpo || "arte"}-${formato}.jpg`;
}

// ─────────────────────────── O layout "vitrine" ──────────────────────────
//
// Reproduz o padrão das artes que a equipe já faz à mão. O que o define, e
// que é diferente dos outros três:
//
//   - marca e modelo EMPILHADOS no canto de cima, não embaixo;
//   - versão numa caixa da cor da loja, e o ano entre dois fios;
//   - a ficha em quatro blocos com ícone, separados por divisórias, numa
//     faixa escura translúcida POR CIMA da foto (não um bloco sólido);
//   - o preço numa caixa de cor, centralizado;
//   - rodapé com um fio da cor e o endereço.
//
// Uma coisa das artes reais que NÃO está aqui: em várias delas o carro está
// recortado do fundo. Isso não se faz com processamento de imagem comum —
// precisa de um serviço de remoção de fundo. Ver docs/studio.md.

function vitrine(o: {
  /** A foto JÁ enquadrada no tamanho da arte. Ver enquadrar() em arte.ts. */
  foto: string;
  arte: {
    marca: string | null;
    modelo: string;
    versao: string | null;
    detalhes: string | null;
    ano: string | null;
    kmTexto: string | null;
    precoDeCents: number | null;
    chamada: string | null;
    client: { companyName: string };
  };
  m: { logoUrl: string | null } | null | undefined;
  cor: { primaria: string; fundo: string; texto: string };
  formato: Formato;
  largura: number;
  altura: number;
  story: boolean;
  preco: string | null;
  rodape: string;
}) {
  const { arte, foto, m, cor, formato, largura, altura, story, preco, rodape } = o;
  const ficha = itensDaFicha(arte.detalhes, arte.ano, arte.kmTexto);
  const precoDe = precoDaArte(arte.precoDeCents);
  const k = story ? 1.25 : 1;
  const px = (n: number) => Math.round(n * k);

  const alturaDoRodape = rodape ? px(64) : 0;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        backgroundColor: cor.fundo,
        fontFamily: "Roboto",
      }}
    >
      <img
        src={foto}
        alt=""
        width={largura}
        height={altura}
        style={{ position: "absolute", top: 0, left: 0 }}
      />

      {/* Escurece o topo e o pé, deixando o meio da foto limpo — é onde o
          carro está. Dois degradês curtos em vez de um que atravessa tudo:
          o longo apaga a lataria no meio do caminho. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: px(story ? 420 : 330),
          display: "flex",
          backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: px(story ? 560 : 440),
          display: "flex",
          backgroundImage: `linear-gradient(to top, ${cor.fundo} 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0) 100%)`,
        }}
      />

      {/* ── Topo: logo à esquerda, carro à direita ── */}
      <div
        style={{
          position: "absolute",
          top: px(40),
          left: px(44),
          right: px(44),
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        {m?.logoUrl ? (
          <img src={m.logoUrl} alt="" height={px(76)} style={{ objectFit: "contain" }} />
        ) : (
          <div
            style={{
              display: "flex",
              fontFamily: "Anton",
              fontSize: px(30),
              color: cor.texto,
              letterSpacing: 1,
            }}
          >
            {arte.client.companyName.toUpperCase()}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          {arte.marca && (
            <div
              style={{
                display: "flex",
                fontFamily: "Anton",
                fontSize: px(40),
                color: cor.texto,
                letterSpacing: 2,
                lineHeight: 1,
              }}
            >
              {arte.marca.toUpperCase()}
            </div>
          )}
          <div
            style={{
              display: "flex",
              fontFamily: "Anton",
              fontSize: px(corpoDoModelo(arte.modelo, formato) * 0.88),
              color: cor.texto,
              lineHeight: 1,
              marginTop: arte.marca ? px(2) : 0,
            }}
          >
            {arte.modelo.toUpperCase()}
          </div>
          {arte.versao && (
            <div
              style={{
                display: "flex",
                backgroundColor: cor.primaria,
                color: cor.fundo,
                fontFamily: "Anton",
                fontSize: px(32),
                letterSpacing: 1,
                padding: `${px(6)}px ${px(18)}px`,
                borderRadius: px(6),
                marginTop: px(10),
              }}
            >
              {arte.versao.toUpperCase()}
            </div>
          )}
          {arte.ano && (
            // O ano entre dois fios, como na arte da casa.
            <div style={{ display: "flex", alignItems: "center", marginTop: px(10) }}>
              <div
                style={{
                  display: "flex",
                  width: px(34),
                  height: px(4),
                  backgroundColor: cor.primaria,
                }}
              />
              <div
                style={{
                  display: "flex",
                  fontFamily: "Anton",
                  fontSize: px(30),
                  color: cor.texto,
                  letterSpacing: 2,
                  padding: `0 ${px(12)}px`,
                }}
              >
                {arte.ano}
              </div>
              <div
                style={{
                  display: "flex",
                  width: px(34),
                  height: px(4),
                  backgroundColor: cor.primaria,
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── O bloco de baixo: chamada, ficha e preço, EMPILHADOS ──────────
          Os três ficavam em posições absolutas calculadas na mão, e se
          atropelavam: a pastilha do desconto encostava na ficha, e a
          chamada caía em cima da roda do carro. Cada conserto quebrava
          outro, porque nenhum dos três sabia da existência dos outros.

          Empilhados numa coluna só, o problema deixa de existir: o fluxo
          cuida do espaçamento, e nada mais precisa saber a altura de nada.
          É menos código e não tem como sobrepor. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: alturaDoRodape,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingBottom: px(story ? 40 : 28),
        }}
      >
        {arte.chamada && (
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              marginLeft: px(44),
              marginBottom: px(14),
              backgroundColor: cor.primaria,
              color: cor.fundo,
              fontFamily: "Anton",
              fontSize: px(28),
              letterSpacing: 1,
              padding: `${px(10)}px ${px(20)}px`,
              borderRadius: px(8),
            }}
          >
            {arte.chamada.toUpperCase()}
          </div>
        )}

        {ficha.length > 0 && (
          <div
            style={{
              display: "flex",
              alignSelf: "stretch",
              alignItems: "stretch",
              justifyContent: "center",
              padding: `${px(14)}px ${px(30)}px`,
              // A faixa escura atrás da ficha.
              //
              // O degradê do pé não dá conta sozinho: numa Saveiro BRANCA
              // ao sol, "COMPLETO" em letra branca em cima da lataria some.
              // As artes reais da casa têm essa faixa pelo mesmo motivo —
              // não é enfeite, é o que faz a ficha ser legível em carro
              // claro e em carro escuro com a mesma regra.
              backgroundColor: "rgba(0,0,0,0.62)",
            }}
          >
            {ficha.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                {/* A divisória vem ANTES do item, menos no primeiro: assim
                    nunca sobra um fio solto na ponta. */}
                {i > 0 && (
                  <div
                    style={{
                      display: "flex",
                      width: 2,
                      height: px(46),
                      backgroundColor: "rgba(255,255,255,0.25)",
                      margin: `0 ${px(18)}px`,
                    }}
                  />
                )}
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: px(46),
                      height: px(46),
                      borderRadius: 999,
                      border: `${Math.max(2, px(3))}px solid ${cor.primaria}`,
                      marginRight: px(10),
                    }}
                  >
                    <IconeDaFichaSvg nome={item.icone} cor={cor.primaria} tamanho={px(24)} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {item.linhas.map((l, j) => (
                      <div
                        key={j}
                        style={{
                          display: "flex",
                          fontFamily: "Anton",
                          fontSize: px(24),
                          color: cor.texto,
                          lineHeight: 1.15,
                          letterSpacing: 0.5,
                        }}
                      >
                        {l.toUpperCase()}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {preco && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: px(16),
            }}
          >
            {/* O "de" riscado, numa pastilha escura.
                Solto em cima da foto ele sumia: letra clara translúcida
                sobre lataria branca é invisível, e foi o que aconteceu na
                primeira arte com foto de verdade. */}
            {precoDe && (
              <div
                style={{
                  display: "flex",
                  backgroundColor: "rgba(0,0,0,0.7)",
                  borderRadius: px(8),
                  padding: `${px(5)}px ${px(16)}px`,
                  marginBottom: px(8),
                }}
              >
                <div
                  style={{
                    display: "flex",
                    fontSize: px(26),
                    color: "#FFFFFF",
                    textDecoration: "line-through",
                  }}
                >
                  {precoDe}
                </div>
              </div>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                backgroundColor: cor.primaria,
                color: cor.fundo,
                padding: `${px(12)}px ${px(40)}px`,
                borderRadius: px(12),
              }}
            >
              {/* "R$" menor que o número, como na arte real: o que a pessoa
                  precisa ler de longe é o número, não a moeda. */}
              <div
                style={{
                  display: "flex",
                  fontFamily: "Anton",
                  fontSize: px(38),
                  marginRight: px(10),
                }}
              >
                R$
              </div>
              <div
                style={{
                  display: "flex",
                  fontFamily: "Anton",
                  fontSize: px(corpoDoPreco(preco, formato) * 0.92),
                  lineHeight: 1,
                }}
              >
                {preco.replace(/^R\$\s*/, "")}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Rodapé ── */}
      {rodape && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{ display: "flex", width: "100%", height: px(4), backgroundColor: cor.primaria }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              padding: `${px(16)}px 0`,
              backgroundColor: cor.fundo,
            }}
          >
            <svg
              width={px(22)}
              height={px(22)}
              viewBox="0 0 24 24"
              fill="none"
              stroke={cor.primaria}
              strokeWidth="2.2"
              style={{ marginRight: px(10) }}
            >
              <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
              <circle cx="12" cy="10" r="2.6" />
            </svg>
            <div style={{ display: "flex", fontSize: px(24), color: cor.texto }}>{rodape}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Os ícones da ficha. Quatro traços simples, do mesmo peso. */
function IconeDaFichaSvg({
  nome,
  cor,
  tamanho,
}: {
  nome: IconeDaFicha;
  cor: string;
  tamanho: number;
}) {
  const comum = {
    width: tamanho,
    height: tamanho,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: cor,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
  };
  if (nome === "km") {
    return (
      <svg {...comum}>
        <path d="M4 18a8 8 0 1 1 16 0" />
        <path d="M12 14l4-4" />
      </svg>
    );
  }
  if (nome === "cambio") {
    return (
      <svg {...comum}>
        <path d="M6 5v14" />
        <path d="M18 5v6" />
        <path d="M6 9h12" />
        <circle cx="6" cy="19" r="1.6" />
      </svg>
    );
  }
  if (nome === "motor") {
    return (
      <svg {...comum}>
        <path d="M4 12h3l2-3h6l2 3h3" />
        <path d="M5 12v4h14v-4" />
        <path d="M9 5h6" />
      </svg>
    );
  }
  if (nome === "ano") {
    return (
      <svg {...comum}>
        <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
        <path d="M3.5 10h17" />
        <path d="M8 3v4M16 3v4" />
      </svg>
    );
  }
  return (
    <svg {...comum}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
