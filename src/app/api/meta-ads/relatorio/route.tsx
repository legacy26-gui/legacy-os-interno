/* eslint-disable @next/next/no-img-element --
   O <Image> do Next é um componente de NAVEGADOR: ele depende do servidor de
   imagens da Vercel e de JavaScript rodando na página. Aqui não há página
   nenhuma — o Satori lê este JSX no servidor e devolve um PNG pronto. A única
   tag que ele entende é <img>, e trocar por <Image> faria a imagem sair sem
   foto. O aviso está certo em geral e errado neste arquivo. */

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCurrentUser } from "@/lib/dal";
import { canAccessModule } from "@/lib/permissions";
import { clienteEDaCarteira } from "@/lib/carteira";
import { lerIntervalo, reais, numero } from "@/lib/meta/insights";
import { montarRelatorio } from "@/lib/meta/relatorio";

// O relatório como IMAGEM, na identidade da Legacy.
//
// PNG e não PDF porque foi o Guilherme quem disse, e ele está certo: o
// relatório vai no WhatsApp do dono de uma loja de carro. PDF vira um anexo
// que pede um aplicativo pra abrir — e, nas palavras dele, "PDF nenhuma loja
// abre". Imagem aparece na conversa.
//
// Gerado com ImageResponse, que desenha JSX direto em PNG. Sem navegador no
// servidor: tirar foto da tela exigiria um Chrome inteiro na função, que é
// lento, pesado e quebra quando a Vercel muda de ambiente.
//
// O preço: Satori só entende FLEXBOX e um pedaço do CSS. Nada de grid, nada
// de classe do Tailwind — tudo estilo embutido. Por isso o desenho vive aqui
// e não é compartilhado com a folha da tela: são duas pinturas do mesmo
// quadro, e tentar fazer uma servir às duas acabaria piorando as duas.
//
// ── Por que preto e dourado, e não o branco de antes ──────────────────────
//
// Porque esta peça não é do sistema: é da Legacy, e vai no WhatsApp do
// cliente assinada por ela. O modelo veio do Guilherme — a arte que a equipe
// já fazia à mão, com a águia, o título em dourado e os quatro números em
// cartões. O que muda é que agora sai sozinha e com o número certo, em vez de
// alguém copiar do Gerenciador pro editor de imagem toda semana.
//
// "Não precisa ser igual", ele disse. Então o que foi seguido à risca é o que
// identifica a marca (preto, dourado, a águia, os quatro números em cartão) e
// o que foi mantido do relatório antigo é o que informa (o nome da loja, a
// lista por campanha e o rodapé que explica o que é lead).

export const runtime = "nodejs";

/** Largura fixa: é a que o WhatsApp mostra inteira sem cortar. */
const LARGURA = 1080;

/**
 * A altura ACOMPANHA o conteúdo.
 *
 * Com altura fixa, uma loja de duas campanhas saía com um terço de folha em
 * branco — parece erro, e no WhatsApp o pedaço vazio é o que aparece grande
 * na pré-visualização.
 */
const ALTURA_FIXA = 1000;
const ALTURA_POR_CAMPANHA = 76;
/** Nunca menor que isto: folha curta demais fica estranha ao lado das outras. */
const ALTURA_MINIMA = 1180;

// ── A paleta, tirada da arte que a equipe já usava ────────────────────────
const PRETO = "#070707";
/** Fundo dos cartões: quase preto, mas não igual ao fundo — é o que os separa. */
const CARTAO = "#111111";
const OURO = "#FFC20E";
/** Ouro apagado, pra borda e legenda: ouro cheio em tudo vira ruído. */
const OURO_FRACO = "rgba(255, 194, 14, 0.35)";
const BRANCO = "#FFFFFF";
const CINZA = "#8A8A8A";

/** Quantas campanhas cabem na folha antes de virar "e outras N". */
const CABEM = 6;

/**
 * Traz a arte pra dentro da imagem.
 *
 * Em vez de deixar o Satori buscar o endereço: se a CDN da Meta demorar ou
 * recusar, ele estoura e a imagem inteira não sai. Buscando aqui, com prazo
 * curto, o pior caso é um relatório sem foto.
 */
async function arteEmbutida(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const corte = AbortSignal.timeout(5000);
    const r = await fetch(url, { signal: corte, cache: "no-store" });
    if (!r.ok) return null;
    const tipo = r.headers.get("content-type") ?? "image/jpeg";
    if (!tipo.startsWith("image/")) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    // Acima disso não vale: a imagem toda tem orçamento, e miniatura grande
    // só deixa a geração lenta.
    if (bytes.byteLength > 2_000_000) return null;
    return `data:${tipo};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * A logo da Legacy, se o arquivo estiver em `assets/legacy-logo.png`.
 *
 * Devolve null em vez de quebrar quando não está. Relatório sem águia ainda é
 * relatório; relatório que não sai porque faltou um arquivo é um cliente sem
 * resposta na segunda-feira. O desenho tem um substituto em letra pra isso.
 */
async function logoEmbutida(): Promise<string | null> {
  try {
    const bytes = await readFile(join(process.cwd(), "assets", "legacy-logo.png"));
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!canAccessModule(user.role, "clientes", user.email)) {
    return new Response("sem acesso", { status: 403 });
  }

  const url = new URL(req.url);
  const loja = url.searchParams.get("loja");
  if (!loja) return new Response("falta a loja", { status: 400 });

  // A loja vem do endereço: confere contra a carteira antes de qualquer
  // número. 404 e não "acesso negado", que confirmaria que ela existe.
  if (!(await clienteEDaCarteira(user, loja))) {
    return new Response("não encontrada", { status: 404 });
  }

  const periodo = lerIntervalo({
    periodo: url.searchParams.get("periodo") ?? undefined,
    de: url.searchParams.get("de") ?? undefined,
    ate: url.searchParams.get("ate") ?? undefined,
  });

  const r = await montarRelatorio(loja, periodo);
  if (!r) return new Response("não encontrada", { status: 404 });

  // Sem leitura boa não sai imagem: um relatório com R$ 0,00 em tudo porque a
  // busca falhou é pior que relatório nenhum — e esse vai pro cliente.
  if (!r.temDados) {
    return new Response("esta loja ainda não tem leitura da Meta", { status: 409 });
  }

  // Data em dd/mm, como na arte que a equipe já fazia.
  //
  // "7 de nov. - 13 de nov." é o formato do resto do sistema e está certo lá,
  // onde há espaço. Na pílula ele ocupa quase a largura toda e empurra o
  // desenho. "07/11 - 13/11" diz a mesma coisa na metade do espaço, e é o que
  // o dono da loja já está acostumado a ver nos relatórios anteriores.
  const quando =
    periodo.vidaInteira || !periodo.de || !periodo.ate
      ? periodo.rotulo
      : periodo.de.getTime() === periodo.ate.getTime()
        ? diaBarraMes(periodo.de)
        : `${diaBarraMes(periodo.de)} - ${diaBarraMes(periodo.ate)}`;

  // DUAS fontes, e as duas são obrigatórias.
  //
  // O Satori usa só o que recebe: passando apenas a Anton, ela virou a fonte
  // de TUDO — nome de campanha, rodapé, explicação do que é lead. Anton é
  // tipografia de título, estreita e sem peso leve; parágrafo nela fica
  // ilegível e grita. A Roboto é o texto; a Anton é só número e título.
  const [arte, logo, anton, roboto] = await Promise.all([
    arteEmbutida(r.fotoDeCapa),
    logoEmbutida(),
    readFile(join(process.cwd(), "assets", "Anton-Regular.ttf")),
    readFile(join(process.cwd(), "assets", "Roboto-Regular.ttf")),
  ]);

  const mostradas = r.linhas.slice(0, CABEM);
  const sobraram = r.linhas.length - mostradas.length;
  const altura = Math.max(
    ALTURA_MINIMA,
    ALTURA_FIXA + mostradas.length * ALTURA_POR_CAMPANHA + (sobraram > 0 ? 50 : 0)
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: PRETO,
          fontFamily: "Roboto",
          position: "relative",
        }}
      >
        {/* As riscadas douradas dos cantos.
            São enfeite, e por isso são poucas: na arte original elas
            emolduram a folha inteira; aqui só precisam dizer "é da Legacy"
            sem disputar atenção com o número. Vêm em pares paralelos porque
            uma risca sozinha parece defeito de impressão, duas parecem
            intenção. */}
        <Riscada x={-150} y={70} rotacao={-38} comprimento={430} espessura={16} opacidade={0.95} />
        <Riscada x={-170} y={140} rotacao={-38} comprimento={340} espessura={7} opacidade={0.5} />
        <Riscada x={-120} y={-30} rotacao={-38} comprimento={230} espessura={5} opacidade={0.35} />
        <Riscada
          x={LARGURA - 280}
          y={70}
          rotacao={-38}
          comprimento={430}
          espessura={16}
          opacidade={0.95}
        />
        <Riscada
          x={LARGURA - 170}
          y={140}
          rotacao={-38}
          comprimento={340}
          espessura={7}
          opacidade={0.5}
        />

        {/* ── Marca ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 54,
          }}
        >
          {logo ? (
            // height sem width: a logo mantém a proporção dela, qualquer que
            // seja o arquivo que for posto na pasta.
            <img src={logo} alt="" height={118} style={{ objectFit: "contain" }} />
          ) : (
            <MarcaEmLetra />
          )}
        </div>

        {/* ── Título ────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: 26,
            fontFamily: "Anton",
            fontSize: 78,
            letterSpacing: 1,
          }}
        >
          <div style={{ display: "flex", color: BRANCO }}>RELATÓRIO DE&nbsp;</div>
          <div style={{ display: "flex", color: OURO }}>CAMPANHA</div>
        </div>

        {/* O nome da loja.
            Não está na arte original, e entrou de propósito: a equipe manda
            dezenas destes por semana, e duas imagens pretas idênticas numa
            conversa de WhatsApp são impossíveis de distinguir depois. O lugar
            é abaixo do título e menor que ele — identifica sem competir. */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: 6,
            color: CINZA,
            fontSize: 26,
            letterSpacing: 7,
          }}
        >
          {r.loja.toUpperCase()}
        </div>

        {/* ── Período, na pílula ────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 26 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              border: `2px solid ${OURO_FRACO}`,
              borderRadius: 999,
              padding: "14px 44px",
            }}
          >
            <IconeCalendario />
            <div
              style={{
                display: "flex",
                color: BRANCO,
                fontSize: 34,
                fontFamily: "Anton",
                letterSpacing: 2,
                marginLeft: 16,
              }}
            >
              {quando}
            </div>
          </div>
        </div>

        {/* ── Os quatro números ─────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "38px 44px 0",
          }}
        >
          <Cartao titulo="CUSTO POR LEAD" valor={r.cplTotal === null ? "—" : reais(r.cplTotal)}>
            <IconeAlvo />
          </Cartao>
          <Cartao titulo="VALOR INVESTIDO" valor={reais(r.total.spendCents)}>
            <IconeGrafico />
          </Cartao>
          <Cartao titulo="QUANTIDADE DE LEADS" valor={numero(r.total.leads)}>
            <IconePessoas />
          </Cartao>
          <Cartao titulo="VISUALIZAÇÃO" valor={numero(r.total.impressions)}>
            <IconeOlho />
          </Cartao>
        </div>

        {/* ── Por campanha ──────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "38px 44px 0",
            flex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", fontSize: 20, letterSpacing: 4, color: OURO }}>
              POR CAMPANHA
            </div>
            {arte && (
              <img
                src={arte}
                alt=""
                width={46}
                height={46}
                style={{ borderRadius: 10, objectFit: "cover", marginLeft: "auto" }}
              />
            )}
          </div>
          {mostradas.map((l) => (
            <div
              key={l.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 0",
                borderBottom: "1px solid #1E1E1E",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 26,
                  color: "#D4D4D4",
                  maxWidth: 580,
                  overflow: "hidden",
                }}
              >
                {l.nome}
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", fontSize: 26, color: CINZA, marginRight: 30 }}>
                  {reais(l.spendCents)}
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: 28,
                    fontFamily: "Anton",
                    color: l.leads > 0 ? OURO : CINZA,
                    width: 74,
                    justifyContent: "flex-end",
                  }}
                >
                  {l.leads > 0 ? numero(l.leads) : "—"}
                </div>
              </div>
            </div>
          ))}
          {sobraram > 0 && (
            <div style={{ display: "flex", fontSize: 22, color: CINZA, paddingTop: 16 }}>
              e mais {sobraram} {sobraram === 1 ? "campanha" : "campanhas"}
            </div>
          )}
        </div>

        {/* ── Rodapé ────────────────────────────────────────────────── */}
        {/* Quem lê é dono de loja, não gestor de tráfego: "lead" e
            "visualização" não são óbvios. Explicar custa duas linhas e evita a
            pergunta que vem por mensagem depois. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "24px 44px 34px",
            borderTop: `2px solid ${OURO_FRACO}`,
          }}
        >
          <div style={{ display: "flex", fontSize: 21, color: CINZA }}>
            Lead é cada pessoa que entrou em contato pelo anúncio.
          </div>
          <div style={{ display: "flex", fontSize: 21, color: CINZA, marginTop: 6 }}>
            Visualização é quantas vezes o anúncio apareceu na tela de alguém.
          </div>
        </div>
      </div>
    ),
    {
      width: LARGURA,
      height: altura,
      fonts: [
        { name: "Roboto", data: roboto, style: "normal", weight: 400 },
        { name: "Anton", data: anton, style: "normal", weight: 400 },
      ],
      headers: {
        // Nome do arquivo com a loja e a data: na pasta de downloads de quem
        // manda trinta por semana, "relatorio.png" não ajuda ninguém.
        "Content-Disposition": `inline; filename="${nomeDoArquivo(r.loja, quando)}"`,
      },
    }
  );
}

/**
 * "07/11". Dia e mês com zero à esquerda, que é como a arte antiga escrevia.
 *
 * Sem o ano de propósito: a folha é de uma semana, e quem a recebe acabou de
 * viver essa semana. Ano aqui é ruído.
 */
function diaBarraMes(d: Date) {
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`;
}

function nomeDoArquivo(loja: string, quando: string) {
  const limpo = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
  return `${limpo(loja)}-${limpo(quando)}.png`;
}

/**
 * O cartão de um número.
 *
 * ── Por que o tamanho da letra muda sozinho ───────────────────────────────
 *
 * São quatro cartões lado a lado numa folha de 1080, então cada um tem pouco
 * mais de 230 pontos de largura. "52" cabe folgado; "R$ 1.205,38" não cabe no
 * mesmo corpo, e "1.234.567" muito menos. Com corpo fixo, o número comprido
 * vaza do cartão ou é cortado — e número cortado num relatório de cliente é
 * pior que número pequeno.
 */
function Cartao({
  titulo,
  valor,
  children,
}: {
  titulo: string;
  valor: string;
  children: React.ReactNode;
}) {
  const corpo = valor.length <= 4 ? 62 : valor.length <= 7 ? 52 : valor.length <= 10 ? 42 : 34;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: 228,
        // Altura fixa, e não "o que o conteúdo pedir".
        //
        // "QUANTIDADE DE LEADS" quebra em duas linhas e "VISUALIZAÇÃO" não.
        // Sem altura fixa, o cartão do meio ficava mais alto e o número dele
        // descia — quatro números que deveriam estar na mesma linha saíam em
        // degrau. Com altura fixa aqui e `marginTop: auto` no número, os
        // quatro encostam no mesmo rodapé, caiba o rótulo em uma linha ou duas.
        height: 290,
        backgroundColor: CARTAO,
        border: `2px solid ${OURO_FRACO}`,
        borderRadius: 26,
        padding: "26px 10px 26px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 84,
          height: 84,
          borderRadius: 999,
          border: `3px solid ${OURO}`,
        }}
      >
        {children}
      </div>
      {/* Duas linhas no máximo: "QUANTIDADE DE LEADS" não cabe numa só, e
          deixar quebrar sozinho mantém os quatro cartões da mesma altura. */}
      <div
        style={{
          display: "flex",
          color: BRANCO,
          fontSize: 17,
          letterSpacing: 1.5,
          marginTop: 16,
          textAlign: "center",
        }}
      >
        {titulo}
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: "Anton",
          color: OURO,
          fontSize: corpo,
          // Empurra o número pro rodapé do cartão: é o que alinha os quatro.
          marginTop: "auto",
        }}
      >
        {valor}
      </div>
    </div>
  );
}

/**
 * A marca escrita, pra quando o PNG da logo ainda não foi posto em `assets/`.
 *
 * Não tenta imitar a águia: desenho mal-feito de logo é pior que logo
 * nenhuma, porque parece falsificação. Escreve o nome com o peso certo e a
 * barra dourada, e pronto.
 */
function MarcaEmLetra() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          fontFamily: "Anton",
          fontSize: 62,
          color: BRANCO,
          letterSpacing: 3,
        }}
      >
        LEGACY
      </div>
      <div
        style={{
          display: "flex",
          width: 210,
          height: 5,
          backgroundColor: OURO,
          marginTop: 4,
        }}
      />
      <div
        style={{
          display: "flex",
          fontSize: 24,
          color: BRANCO,
          letterSpacing: 8,
          marginTop: 8,
        }}
      >
        DIGITAL
      </div>
    </div>
  );
}

// ── Os ícones ──────────────────────────────────────────────────────────────
//
// Desenhados à mão em SVG, e não trazidos de uma biblioteca: o Satori monta a
// imagem no servidor e qualquer pacote de ícone viraria peso de função pra
// quatro desenhos. São quatro traços simples, do mesmo tamanho e da mesma
// espessura, pra ficarem irmãos dentro dos círculos.

function IconeCalendario() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke={OURO}
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

function IconeAlvo() {
  return (
    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={OURO} strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.6" fill={OURO} />
    </svg>
  );
}

function IconeGrafico() {
  return (
    <svg
      width="42"
      height="42"
      viewBox="0 0 24 24"
      fill="none"
      stroke={OURO}
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M4 19V10" />
      <path d="M10 19V5" />
      <path d="M16 19v-6" />
      <path d="M22 19H2" />
    </svg>
  );
}

function IconePessoas() {
  return (
    <svg
      width="42"
      height="42"
      viewBox="0 0 24 24"
      fill="none"
      stroke={OURO}
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c0-3.3 2.7-5.2 6-5.2s6 1.9 6 5.2" />
      <path d="M16.5 6.6a3.2 3.2 0 0 1 0 5.6" />
      <path d="M18 14.2c2 .7 3 2.4 3 4.8" />
    </svg>
  );
}

function IconeOlho() {
  return (
    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={OURO} strokeWidth="2">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

/**
 * Uma riscada dourada do canto.
 *
 * Posição absoluta e rotação: é o único jeito no Satori de pôr algo fora do
 * fluxo. `zIndex` negativo não funciona nele, então elas vêm ANTES de tudo no
 * JSX — o que é desenhado primeiro fica por baixo.
 */
function Riscada({
  x,
  y,
  rotacao,
  comprimento,
  espessura,
  opacidade,
}: {
  x: number;
  y: number;
  rotacao: number;
  comprimento: number;
  espessura: number;
  opacidade: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: comprimento,
        height: espessura,
        backgroundColor: OURO,
        opacity: opacidade,
        transform: `rotate(${rotacao}deg)`,
      }}
    />
  );
}
