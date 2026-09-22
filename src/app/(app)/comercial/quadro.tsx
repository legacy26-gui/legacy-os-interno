"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { GripVertical, Plus, Search, ChevronLeft, ChevronRight, CalendarX, Phone, MapPin } from "lucide-react";
import { moverLead } from "@/lib/actions/leads";
import {
  LEAD_STAGE_LABELS,
  LEAD_STAGE_COLORS,
  LEAD_CHANNEL_LABELS,
  LEAD_CHANNEL_COLORS,
  formatCurrency,
} from "@/lib/labels";
import type { LeadChannel, LeadStage } from "@/generated/prisma/enums";
import { LeadPainel } from "./lead-painel";
import { ETAPAS_DO_FUNIL, type LeadDoQuadro } from "./tipos";

const CANAIS = Object.keys(LEAD_CHANNEL_LABELS) as LeadChannel[];

// Distância que o dedo/mouse precisa andar pra virar arraste. Abaixo disso é
// toque: abre o cartão em vez de sair arrastando sem querer.
const LIMIAR_ARRASTE = 8;
// Faixa perto da borda onde o quadro anda sozinho enquanto se arrasta.
const BORDA_ROLAGEM = 72;

type PorEtapa = Record<LeadStage, LeadDoQuadro[]>;

function agrupar(leads: LeadDoQuadro[]): PorEtapa {
  const mapa = Object.fromEntries(ETAPAS_DO_FUNIL.map((e) => [e, [] as LeadDoQuadro[]])) as PorEtapa;
  for (const l of leads) mapa[l.stage]?.push(l);
  return mapa;
}

interface Pendente {
  id: string;
  x0: number;
  y0: number;
  largura: number;
  altura: number;
  dx: number;
  dy: number;
  doBotao: boolean;
}

export function QuadroCrm({ leads }: { leads: LeadDoQuadro[] }) {
  // Ordem mostrada na tela. O servidor manda a verdade; enquanto a resposta não
  // volta, o cartão já fica onde foi solto — senão ele "pula de volta".
  const [porEtapa, setPorEtapa] = useState<PorEtapa>(() => agrupar(leads));
  const [ultimaProp, setUltimaProp] = useState(leads);
  if (ultimaProp !== leads) {
    setUltimaProp(leads);
    setPorEtapa(agrupar(leads));
  }

  const [filtro, setFiltro] = useState<LeadChannel | null>(null);
  const [busca, setBusca] = useState("");
  const [painel, setPainel] = useState<LeadDoQuadro | "novo" | null>(null);
  const [, iniciar] = useTransition();

  const quadroRef = useRef<HTMLDivElement>(null);
  const pendenteRef = useRef<Pendente | null>(null);
  const velocidadeRef = useRef(0);
  const alvoRef = useRef<{ etapa: LeadStage; indice: number } | null>(null);

  const [arrastando, setArrastando] = useState<LeadDoQuadro | null>(null);
  const [caixa, setCaixa] = useState({ x: 0, y: 0, largura: 0, altura: 0 });
  const [alvo, setAlvo] = useState<{ etapa: LeadStage; indice: number } | null>(null);

  const visivel = useCallback(
    (l: LeadDoQuadro) => {
      if (filtro && l.channel !== filtro) return false;
      const termo = busca.trim().toLowerCase();
      if (!termo) return true;
      return (
        l.companyName.toLowerCase().includes(termo) ||
        l.contactName.toLowerCase().includes(termo) ||
        (l.city ?? "").toLowerCase().includes(termo)
      );
    },
    [filtro, busca]
  );

  function aoPressionar(e: React.PointerEvent, lead: LeadDoQuadro) {
    const elemento = e.target as HTMLElement;
    if (elemento.closest("button")) return; // botão do cartão não arrasta
    // No dedo, só a alça arrasta — o resto do cartão continua rolando a lista.
    if (e.pointerType !== "mouse" && !elemento.closest("[data-alca]")) return;

    const cartao = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pendenteRef.current = {
      id: lead.id,
      x0: e.clientX,
      y0: e.clientY,
      largura: cartao.width,
      altura: cartao.height,
      dx: e.clientX - cartao.left,
      dy: e.clientY - cartao.top,
      doBotao: false,
    };
  }

  // Onde o cartão cairia se soltasse agora: qual coluna está embaixo do
  // ponteiro e entre quais cartões dela.
  const calcularAlvo = useCallback((x: number, y: number, arrastadoId: string) => {
    const embaixo = document.elementFromPoint(x, y) as HTMLElement | null;
    const coluna = embaixo?.closest("[data-etapa]") as HTMLElement | null;
    if (!coluna) return null;
    const etapa = coluna.dataset.etapa as LeadStage;

    const cartoes = [...coluna.querySelectorAll<HTMLElement>("[data-cartao]")].filter(
      (c) => c.dataset.cartao !== arrastadoId
    );
    let indice = cartoes.length;
    for (let i = 0; i < cartoes.length; i++) {
      const r = cartoes[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        indice = i;
        break;
      }
    }
    return { etapa, indice };
  }, []);

  useEffect(() => {
    function mover(e: PointerEvent) {
      const p = pendenteRef.current;
      if (!p) return;

      const andou = Math.hypot(e.clientX - p.x0, e.clientY - p.y0);
      if (!arrastando && andou < LIMIAR_ARRASTE) return;

      if (!arrastando) {
        const lead = Object.values(porEtapa)
          .flat()
          .find((l) => l.id === p.id);
        if (!lead) return;
        setArrastando(lead);
      }

      // Com o cartão na mão, o dedo não pode rolar a página junto.
      e.preventDefault();
      setCaixa({ x: e.clientX - p.dx, y: e.clientY - p.dy, largura: p.largura, altura: p.altura });

      const destino = calcularAlvo(e.clientX, e.clientY, p.id);
      alvoRef.current = destino;
      setAlvo(destino);

      // Perto da borda o quadro anda sozinho — é o que deixa levar um cartão do
      // começo do funil até o fim sem soltar.
      const r = quadroRef.current?.getBoundingClientRect();
      if (r) {
        if (e.clientX < r.left + BORDA_ROLAGEM) velocidadeRef.current = -14;
        else if (e.clientX > r.right - BORDA_ROLAGEM) velocidadeRef.current = 14;
        else velocidadeRef.current = 0;
      }
    }

    function soltar() {
      const p = pendenteRef.current;
      pendenteRef.current = null;
      velocidadeRef.current = 0;

      if (!p) return;

      if (!arrastando) {
        // Não arrastou: foi um toque, então abre o cartão.
        const lead = Object.values(porEtapa)
          .flat()
          .find((l) => l.id === p.id);
        if (lead && !p.doBotao) setPainel(lead);
        return;
      }

      const destino = alvoRef.current;
      const atual = arrastando;
      setArrastando(null);
      setAlvo(null);
      alvoRef.current = null;
      if (!destino || !atual) return;

      setPorEtapa((prev) => {
        const copia = { ...prev };
        let lead: LeadDoQuadro | undefined;
        for (const etapa of ETAPAS_DO_FUNIL) {
          const achou = copia[etapa].find((l) => l.id === atual.id);
          if (achou) lead = achou;
          copia[etapa] = copia[etapa].filter((l) => l.id !== atual.id);
        }
        if (!lead) return prev;
        const destinoLista = [...copia[destino.etapa]];
        destinoLista.splice(Math.min(destino.indice, destinoLista.length), 0, {
          ...lead,
          stage: destino.etapa,
        });
        copia[destino.etapa] = destinoLista;
        return copia;
      });

      iniciar(async () => {
        await moverLead(atual.id, destino.etapa, destino.indice);
      });
    }

    window.addEventListener("pointermove", mover, { passive: false });
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, [arrastando, porEtapa, calcularAlvo]);

  // Rolagem automática enquanto o cartão está na mão perto da borda.
  useEffect(() => {
    if (!arrastando) return;
    let vivo = true;
    const passo = () => {
      if (!vivo) return;
      if (velocidadeRef.current !== 0) quadroRef.current?.scrollBy(velocidadeRef.current, 0);
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
    return () => {
      vivo = false;
    };
  }, [arrastando]);

  function moverPorBotao(lead: LeadDoQuadro, direcao: -1 | 1) {
    const i = ETAPAS_DO_FUNIL.indexOf(lead.stage);
    const destino = ETAPAS_DO_FUNIL[i + direcao];
    if (!destino) return;
    setPorEtapa((prev) => {
      const copia = { ...prev };
      for (const etapa of ETAPAS_DO_FUNIL) copia[etapa] = copia[etapa].filter((l) => l.id !== lead.id);
      copia[destino] = [{ ...lead, stage: destino }, ...copia[destino]];
      return copia;
    });
    iniciar(async () => {
      await moverLead(lead.id, destino, 0);
    });
  }

  const total = ETAPAS_DO_FUNIL.reduce((s, e) => s + porEtapa[e].filter(visivel).length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar empresa, contato ou cidade..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFiltro(null)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              filtro === null ? "bg-accent text-white border-accent" : "border-border text-foreground-muted hover:bg-surface-muted"
            }`}
          >
            Todos
          </button>
          {CANAIS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFiltro(filtro === c ? null : c)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
                filtro === c ? LEAD_CHANNEL_COLORS[c] : "border-border text-foreground-muted hover:bg-surface-muted"
              }`}
            >
              {LEAD_CHANNEL_LABELS[c]}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setPainel("novo")}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 shrink-0"
        >
          <Plus size={16} /> Novo lead
        </button>
      </div>

      <p className="text-xs text-foreground-muted">
        {total} lead(s) no funil · arraste o cartão pela alça para mudar de etapa
      </p>

      <div
        ref={quadroRef}
        className="flex gap-3 overflow-x-auto overscroll-x-contain pb-3 -mx-1 px-1 snap-x"
      >
        {ETAPAS_DO_FUNIL.map((etapa) => {
          const daEtapa = porEtapa[etapa].filter(visivel);
          const somaMrr = daEtapa.reduce((s, l) => s + l.monthlyValue, 0);
          const destacada = alvo?.etapa === etapa;
          return (
            <div
              key={etapa}
              data-etapa={etapa}
              className={`w-[82vw] sm:w-[290px] shrink-0 snap-start rounded-2xl border bg-surface flex flex-col transition-colors ${
                destacada ? "border-accent ring-2 ring-accent/30" : "border-border"
              }`}
            >
              <div className={`h-1 rounded-t-2xl ${LEAD_STAGE_COLORS[etapa]}`} />
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{LEAD_STAGE_LABELS[etapa]}</p>
                  <span className="text-xs text-foreground-muted shrink-0">{daEtapa.length}</span>
                </div>
                {somaMrr > 0 && (
                  <p className="text-xs text-emerald-500 mt-0.5">{formatCurrency(somaMrr)} /mês</p>
                )}
              </div>

              <div className="flex flex-col gap-2 p-2.5 min-h-[120px]">
                {etapa === "LEAD" && (
                  <button
                    type="button"
                    onClick={() => setPainel("novo")}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-dashed border-border text-xs text-foreground-muted hover:text-foreground hover:border-accent/50"
                  >
                    <Plus size={14} /> Adicionar lead
                  </button>
                )}

                {daEtapa.length === 0 && etapa !== "LEAD" && (
                  <p className="text-xs text-foreground-muted px-1 py-3 text-center">Vazio</p>
                )}

                {daEtapa.map((lead, i) => (
                  <div key={lead.id}>
                    {destacada && alvo?.indice === i && <Marcador />}
                    <Cartao
                      lead={lead}
                      arrastado={arrastando?.id === lead.id}
                      aoPressionar={(e) => aoPressionar(e, lead)}
                      aoMover={(d) => moverPorBotao(lead, d)}
                      aoAbrir={() => setPainel(lead)}
                    />
                  </div>
                ))}
                {destacada && (alvo?.indice ?? 0) >= daEtapa.length && <Marcador />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cartão na mão, seguindo o ponteiro. */}
      {arrastando && (
        <div
          className="fixed z-50 pointer-events-none opacity-90 rotate-2"
          style={{ left: caixa.x, top: caixa.y, width: caixa.largura }}
        >
          <Cartao lead={arrastando} flutuando />
        </div>
      )}

      {painel && <LeadPainel lead={painel} aoFechar={() => setPainel(null)} />}
    </div>
  );
}

function Marcador() {
  return <div className="h-1 rounded-full bg-accent my-1" />;
}

function Cartao({
  lead,
  arrastado,
  flutuando,
  aoPressionar,
  aoMover,
  aoAbrir,
}: {
  lead: LeadDoQuadro;
  arrastado?: boolean;
  flutuando?: boolean;
  aoPressionar?: (e: React.PointerEvent) => void;
  aoMover?: (direcao: -1 | 1) => void;
  aoAbrir?: () => void;
}) {
  const posicao = ETAPAS_DO_FUNIL.indexOf(lead.stage);
  const semValor = lead.wonAt !== null && lead.monthlyValue === 0;

  return (
    <div
      data-cartao={lead.id}
      onPointerDown={aoPressionar}
      className={`rounded-xl border border-border bg-surface-muted p-3 flex flex-col gap-2 select-none ${
        flutuando ? "shadow-2xl border-accent" : "cursor-grab active:cursor-grabbing"
      } ${arrastado ? "opacity-30" : ""}`}
    >
      <div className="flex items-start gap-2">
        <div
          data-alca
          className="shrink-0 -ml-1 p-1 rounded text-foreground-muted touch-none cursor-grab active:cursor-grabbing"
          title="Arrastar"
        >
          <GripVertical size={15} />
        </div>
        <button
          type="button"
          onClick={aoAbrir}
          className="min-w-0 flex-1 text-left"
          disabled={flutuando}
        >
          <p className="text-sm font-medium truncate">{lead.companyName}</p>
          <p className="text-xs text-foreground-muted truncate">{lead.contactName}</p>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${LEAD_CHANNEL_COLORS[lead.channel]}`}
        >
          {LEAD_CHANNEL_LABELS[lead.channel]}
        </span>
        {lead.noShowAt && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-500 border border-red-500/30">
            <CalendarX size={10} /> No-show
          </span>
        )}
        {semValor && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
            sem valor
          </span>
        )}
      </div>

      {(lead.city || lead.phone) && (
        <p className="text-[11px] text-foreground-muted flex items-center gap-2 truncate">
          {lead.city && (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin size={10} className="shrink-0" /> {lead.city}
              {lead.state ? `/${lead.state}` : ""}
            </span>
          )}
          {lead.phone && (
            <span className="inline-flex items-center gap-1 truncate">
              <Phone size={10} className="shrink-0" /> {lead.phone}
            </span>
          )}
        </p>
      )}

      {lead.monthlyValue > 0 && (
        <p className="text-xs font-semibold text-emerald-500">{formatCurrency(lead.monthlyValue)} /mês</p>
      )}

      {lead.lostReason && <p className="text-[11px] text-red-500 truncate">Perdido: {lead.lostReason}</p>}

      {!flutuando && aoMover && (
        <div className="flex gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => aoMover(-1)}
            disabled={posicao <= 0}
            title="Voltar uma etapa"
            className="flex-1 inline-flex items-center justify-center py-2 rounded-md border border-border text-foreground-muted hover:text-foreground hover:bg-surface disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => aoMover(1)}
            disabled={posicao >= ETAPAS_DO_FUNIL.length - 1}
            title="Avançar uma etapa"
            className="flex-1 inline-flex items-center justify-center py-2 rounded-md border border-border text-foreground-muted hover:text-foreground hover:bg-surface disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
