/* eslint-disable @next/next/no-img-element --
   O <Image> do Next é um componente de navegador. Aqui não há página: o
   Satori lê este JSX no servidor e devolve um PNG. A única tag que ele
   entende é <img>. Mesmo caso do relatório do cliente. */

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { canAccessModule } from "@/lib/permissions";
import { clienteEDaCarteira } from "@/lib/carteira";
import {
  FORMATOS,
  formatoValido,
  layoutDaLoja,
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

  const arte = await prisma.studioArte.findUnique({
    where: { id },
    select: {
      clientId: true,
      fotoUrl: true,
      modelo: true,
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

  return new ImageResponse(
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
          src={arte.fotoUrl}
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
    {
      width: largura,
      height: altura,
      fonts: [
        { name: "Roboto", data: roboto, style: "normal", weight: 400 },
        { name: "Anton", data: anton, style: "normal", weight: 400 },
      ],
      headers: {
        "Content-Disposition": `inline; filename="${nomeDoArquivo(arte.modelo, formato)}"`,
      },
    }
  );
}

function nomeDoArquivo(modelo: string, formato: Formato) {
  const limpo = modelo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${limpo || "arte"}-${formato}.png`;
}
