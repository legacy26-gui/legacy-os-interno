import { ImageResponse } from "next/og";
import { getCurrentUser } from "@/lib/dal";
import { canAccessModule } from "@/lib/permissions";
import { clienteEDaCarteira } from "@/lib/carteira";
import { lerIntervalo, reais, numero, diaCurto } from "@/lib/meta/insights";
import { montarRelatorio } from "@/lib/meta/relatorio";

// O relatório como IMAGEM.
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

export const runtime = "nodejs";

/** Largura fixa: é a que o WhatsApp mostra inteira sem cortar. */
const LARGURA = 1080;

/**
 * A altura ACOMPANHA o conteúdo.
 *
 * Com altura fixa, uma loja de duas campanhas saía com um terço de folha em
 * branco — parece erro, e no WhatsApp o pedaço vazio é o que aparece grande
 * na pré-visualização. Medindo: o cabeçalho e os quatro números são sempre os
 * mesmos, e cada campanha custa uma linha.
 */
const ALTURA_FIXA = 800;
const ALTURA_POR_CAMPANHA = 80;
/** Nunca menor que isto: folha curta demais fica estranha ao lado das outras. */
const ALTURA_MINIMA = 960;

const TINTA = "#18181b";
const FRACO = "#71717a";
const LINHA = "#e4e4e7";
const DESTAQUE = "#4f46e5";

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

  const quando =
    periodo.vidaInteira || !periodo.de || !periodo.ate
      ? periodo.rotulo
      : periodo.de.getTime() === periodo.ate.getTime()
        ? diaCurto(periodo.de)
        : `${diaCurto(periodo.de)} a ${diaCurto(periodo.ate)}`;

  const arte = await arteEmbutida(r.fotoDeCapa);
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
          backgroundColor: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Faixa escura: marca, loja e período */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            backgroundColor: TINTA,
            padding: "56px 56px 48px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 20, letterSpacing: 6, color: "#a1a1aa" }}>
              LEGACYOS · TRÁFEGO PAGO
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 60,
                fontWeight: 700,
                color: "#ffffff",
                marginTop: 14,
              }}
            >
              {r.loja}
            </div>
            <div style={{ display: "flex", fontSize: 30, color: "#a1a1aa", marginTop: 8 }}>
              {quando}
            </div>
          </div>
          {arte && (
            <img
              src={arte}
              width={150}
              height={150}
              style={{ borderRadius: 24, objectFit: "cover" }}
            />
          )}
        </div>

        {/* Os quatro números, dois por linha: no celular, quatro lado a lado
            ficariam pequenos demais pra serem o que a pessoa vê primeiro. */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", borderBottom: `2px solid ${LINHA}` }}>
            <Numero titulo="INVESTIDO" valor={reais(r.total.spendCents)} />
            <Numero titulo="LEADS" valor={numero(r.total.leads)} destaque />
          </div>
          <div style={{ display: "flex", borderBottom: `2px solid ${LINHA}` }}>
            <Numero
              titulo="CUSTO POR LEAD"
              valor={r.cplTotal === null ? "—" : reais(r.cplTotal)}
            />
            <Numero titulo="VISUALIZAÇÕES" valor={numero(r.total.impressions)} />
          </div>
        </div>

        {/* As campanhas */}
        <div style={{ display: "flex", flexDirection: "column", padding: "36px 56px", flex: 1 }}>
          <div
            style={{
              display: "flex",
              fontSize: 20,
              letterSpacing: 3,
              color: FRACO,
              marginBottom: 14,
            }}
          >
            POR CAMPANHA
          </div>
          {mostradas.map((l) => (
            <div
              key={l.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px 0",
                borderBottom: `1px solid ${LINHA}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 28,
                  color: TINTA,
                  maxWidth: 560,
                  overflow: "hidden",
                }}
              >
                {l.nome}
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", fontSize: 28, color: FRACO, marginRight: 28 }}>
                  {reais(l.spendCents)}
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: 28,
                    fontWeight: 700,
                    color: l.leads > 0 ? TINTA : FRACO,
                    width: 70,
                    justifyContent: "flex-end",
                  }}
                >
                  {l.leads > 0 ? numero(l.leads) : "—"}
                </div>
              </div>
            </div>
          ))}
          {sobraram > 0 && (
            <div style={{ display: "flex", fontSize: 24, color: FRACO, paddingTop: 18 }}>
              e mais {sobraram} {sobraram === 1 ? "campanha" : "campanhas"}
            </div>
          )}
        </div>

        {/* Rodapé: o que cada palavra quer dizer. Quem lê é dono de loja, não
            gestor de tráfego — "lead" e "impressão" não são óbvios. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "28px 56px 40px",
            borderTop: `2px solid ${LINHA}`,
          }}
        >
          <div style={{ display: "flex", fontSize: 22, color: FRACO }}>
            Lead é cada pessoa que entrou em contato pelo anúncio.
          </div>
          <div style={{ display: "flex", fontSize: 22, color: FRACO, marginTop: 6 }}>
            Visualizações é quantas vezes o anúncio apareceu na tela de alguém.
          </div>
        </div>
      </div>
    ),
    {
      width: LARGURA,
      height: altura,
      headers: {
        // Nome do arquivo com a loja e a data: na pasta de downloads de quem
        // manda trinta por semana, "relatorio.png" não ajuda ninguém.
        "Content-Disposition": `inline; filename="${nomeDoArquivo(r.loja, quando)}"`,
      },
    }
  );
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

function Numero({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "34px 56px",
      }}
    >
      <div style={{ display: "flex", fontSize: 20, letterSpacing: 3, color: FRACO }}>{titulo}</div>
      <div
        style={{
          display: "flex",
          fontSize: 54,
          fontWeight: 700,
          color: destaque ? DESTAQUE : TINTA,
          marginTop: 10,
        }}
      >
        {valor}
      </div>
    </div>
  );
}
