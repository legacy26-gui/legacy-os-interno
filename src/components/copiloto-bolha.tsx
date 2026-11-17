"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import { X, Maximize2 } from "lucide-react";
import Link from "next/link";
import { Conversa } from "@/app/(app)/copiloto/conversa";

// O Copiloto como bolha flutuante, em qualquer tela.
//
// ── Por que flutuante e não só a página dele ─────────────────────────────
//
// Porque a pergunta nasce olhando outra coisa. "Por que essa loja está
// vermelha?" acontece na tela do Meta Ads; "quem vai ficar sem verba?"
// acontece no Meu Dia. Exigir sair da tela pra perguntar é exigir perder o
// contexto que gerou a pergunta — e aí ninguém pergunta.
//
// A página inteira continua existindo, pra conversa longa. A bolha é pro
// "pera, deixa eu checar uma coisa".
//
// ── Por que ela é arrastável ─────────────────────────────────────────────
//
// Porque qualquer lugar fixo que eu escolher vai tapar algo importante em
// alguma tela. No canto direito ela cobre a coluna de "lido"; no esquerdo,
// o menu. Em vez de adivinhar, ela se move e LEMBRA onde foi deixada.
//
// Guardado no navegador de quem usa, não no banco: é preferência de tela de
// uma pessoa num computador, não dado da agência. E tudo envolto em
// try/catch — navegador em aba anônima recusa guardar, e isso não pode
// derrubar a tela.

const ONDE_FICOU = "legacyos.copiloto.bolha";
/** Quanto o dedo pode andar sem virar arrasto. Abaixo disso é clique. */
const FOLGA_DO_CLIQUE = 4;
const TAMANHO = 56;
const MARGEM = 12;

interface Posicao {
  x: number;
  y: number;
}

/** Lê o canto guardado. String crua de propósito: o valor tem que ser
 *  estável entre leituras, senão o React fica repintando pra sempre. */
function lerGuardada(): string | null {
  try {
    return localStorage.getItem(ONDE_FICOU);
  } catch {
    return null;
  }
}

function assinarArmazenamento(avisar: () => void) {
  window.addEventListener("storage", avisar);
  return () => window.removeEventListener("storage", avisar);
}

function guardadaComoPosicao(bruto: string | null): Posicao | null {
  if (!bruto) return null;
  try {
    const p = JSON.parse(bruto) as Posicao;
    return typeof p?.x === "number" && typeof p?.y === "number" ? p : null;
  } catch {
    return null;
  }
}

function guardar(p: Posicao) {
  try {
    localStorage.setItem(ONDE_FICOU, JSON.stringify(p));
  } catch {
    // Não poder lembrar não é motivo pra quebrar nada.
  }
}

export function BolhaDoCopiloto({
  temChave,
  variavelDaChave,
  provedor,
  modelo,
}: {
  temChave: boolean;
  variavelDaChave: string;
  provedor: string;
  modelo: string;
}) {
  const caminho = usePathname();
  const [aberta, setAberta] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  /** Onde o dedo largou nesta sessão. Null = ainda no canto guardado. */
  const [movida, setMovida] = useState<Posicao | null>(null);
  const partida = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );
  const andou = useRef(false);

  // "Já estou no navegador?" sem setState dentro de efeito: no servidor isto
  // devolve false, no navegador true, e o React cuida da troca. É o que
  // permite usar window sem quebrar a renderização do servidor.
  const noNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // O canto guardado, lido direto do navegador. Mesma ideia: sem efeito, sem
  // piscada, e uma aba anônima que recusa guardar simplesmente devolve null.
  const guardada = useSyncExternalStore(
    assinarArmazenamento,
    lerGuardada,
    () => null,
  );

  const dentroDaTela = useCallback((p: Posicao): Posicao => {
    const maxX = window.innerWidth - TAMANHO - MARGEM;
    const maxY = window.innerHeight - TAMANHO - MARGEM;
    return {
      x: Math.min(Math.max(p.x, MARGEM), Math.max(maxX, MARGEM)),
      y: Math.min(Math.max(p.y, MARGEM), Math.max(maxY, MARGEM)),
    };
  }, []);

  useEffect(() => {
    if (!arrastando) return;

    function mover(e: PointerEvent) {
      const p = partida.current;
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (Math.abs(dx) > FOLGA_DO_CLIQUE || Math.abs(dy) > FOLGA_DO_CLIQUE) {
        andou.current = true;
      }
      setMovida(dentroDaTela({ x: p.px + dx, y: p.py + dy }));
    }

    function soltar() {
      setArrastando(false);
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, [arrastando, dentroDaTela]);

  // Na própria página do Copiloto a bolha não aparece: seria o mesmo pela
  // segunda vez, tapando a conversa de verdade.
  if (caminho?.startsWith("/copiloto")) return null;
  // No servidor não há tela pra medir. Ela entra na primeira pintura do
  // navegador, que é instantânea.
  if (!noNavegador) return null;

  const pos = dentroDaTela(
    movida ??
      guardadaComoPosicao(guardada) ?? {
        x: window.innerWidth - TAMANHO - 24,
        y: window.innerHeight - TAMANHO - 24,
      },
  );

  // O painel abre do lado em que há espaço, e nunca pra fora da tela.
  const naEsquerda = pos.x < window.innerWidth / 2;
  const emCima = pos.y > window.innerHeight / 2;

  return (
    <>
      {aberta && (
        <>
          {/* A cortina fecha no toque fora, e no celular escurece o fundo
              pra conversa ganhar a tela. */}
          <button
            type="button"
            aria-label="Fechar o Copiloto"
            onClick={() => setAberta(false)}
            className="fixed inset-0 z-[55] bg-black/30 sm:bg-transparent cursor-default"
          />
          <div
            role="dialog"
            aria-label="Copiloto"
            style={{
              left: naEsquerda ? pos.x : undefined,
              right: naEsquerda ? undefined : window.innerWidth - pos.x - TAMANHO,
              top: emCima ? undefined : pos.y + TAMANHO + 10,
              bottom: emCima ? window.innerHeight - pos.y + 10 : undefined,
            }}
            className="fixed z-[60] w-[min(26rem,calc(100vw-1.5rem))] max-h-[min(34rem,70vh)]
              rounded-2xl border border-border-forte bg-surface shadow-2xl
              flex flex-col overflow-hidden
              max-sm:left-3 max-sm:right-3 max-sm:bottom-3 max-sm:top-auto max-sm:w-auto max-sm:max-h-[75vh]"
          >
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border shrink-0">
              <Rosto tamanho={22} />
              <span className="text-sm font-semibold flex-1">Copiloto</span>
              <Link
                href="/copiloto"
                title="Abrir em tela cheia"
                className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-muted"
              >
                <Maximize2 size={15} />
              </Link>
              <button
                type="button"
                onClick={() => setAberta(false)}
                aria-label="Fechar"
                className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-muted"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3.5 py-3">
              <Conversa
                temChave={temChave}
                variavelDaChave={variavelDaChave}
                provedor={provedor}
                modelo={modelo}
                compacto
              />
            </div>
          </div>
        </>
      )}

      <div
        style={{ left: pos.x, top: pos.y, width: TAMANHO, height: TAMANHO }}
        className={`fixed z-[60] touch-none select-none ${
          arrastando ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={(e) => {
          andou.current = false;
          partida.current = {
            x: e.clientX,
            y: e.clientY,
            px: pos.x,
            py: pos.y,
          };
          setArrastando(true);
        }}
        onPointerUp={() => {
          // Guardar no soltar, dentro do próprio evento: é onde a posição
          // final existe, e evita mexer em estado de dentro de um efeito.
          if (andou.current) guardar(pos);
        }}
        onClick={() => {
          // Arrastar não pode abrir a janela sem querer: só conta como
          // clique quando o dedo praticamente não andou.
          if (!andou.current) setAberta((v) => !v);
        }}
      >
        <button
          type="button"
          aria-label={aberta ? "Fechar o Copiloto" : "Abrir o Copiloto"}
          className={`size-full rounded-full bg-accent text-white shadow-lg
            flex items-center justify-center transition-transform
            hover:scale-105 active:scale-95
            ${arrastando ? "scale-110 shadow-2xl" : ""}`}
        >
          <Rosto tamanho={30} piscando={!arrastando && !aberta} />
        </button>
      </div>
    </>
  );
}

/**
 * O rosto.
 *
 * Desenhado aqui e não um emoji por dois motivos: emoji muda de cara em cada
 * sistema — o que é simpático no Android é outra coisa no Windows — e porque
 * assim ele acompanha o tema do sistema em vez de ser uma figura colada.
 *
 * Pisca de vez em quando, e PARA de piscar enquanto está sendo arrastado ou
 * com a conversa aberta: aí ele está ocupado, e piscadinha vira distração.
 */
function Rosto({
  tamanho = 28,
  piscando = false,
}: {
  tamanho?: number;
  piscando?: boolean;
}) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      {/* A cabeça: um quadrado de cantos bem arredondados, que lê como robô
          sem precisar de antena nem parafuso. */}
      <rect
        x="4"
        y="7"
        width="24"
        height="20"
        rx="8"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      {/* A antena, curta: é ela que faz o desenho virar "robô" na primeira
          olhada, e não uma caixa qualquer. */}
      <line
        x1="16"
        y1="3"
        x2="16"
        y2="7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="2.5" r="1.6" fill="currentColor" />

      {/* Os olhos. O scaleY animado é a piscada — a origem no meio do olho
          faz ele fechar pelo centro, como pálpebra, e não encolher pro
          canto. */}
      <g>
        <circle cx="11.5" cy="16" r="2.1" fill="currentColor">
          {piscando && (
            <animate
              attributeName="ry"
              values="2.1;2.1;0.2;2.1;2.1"
              keyTimes="0;0.92;0.95;0.98;1"
              dur="5s"
              repeatCount="indefinite"
            />
          )}
        </circle>
        <circle cx="20.5" cy="16" r="2.1" fill="currentColor">
          {piscando && (
            <animate
              attributeName="ry"
              values="2.1;2.1;0.2;2.1;2.1"
              keyTimes="0;0.92;0.95;0.98;1"
              dur="5s"
              repeatCount="indefinite"
            />
          )}
        </circle>
      </g>

      {/* A boca: um sorriso discreto. Linha reta deixava o rosto sério
          demais pra uma ferramenta que a pessoa vai abrir o dia inteiro. */}
      <path
        d="M12.5 21.5c1 1 2 1.5 3.5 1.5s2.5-.5 3.5-1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
