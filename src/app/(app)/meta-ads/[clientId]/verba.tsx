"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Pencil, Check, X, AlertTriangle } from "lucide-react";
import { definirVerba } from "@/lib/actions/meta-ads";

// A verba, editável na própria linha.
//
// ── Por que na linha, e não numa tela à parte ────────────────────────────
//
// Porque a decisão de mexer na verba nasce olhando a tabela: a pessoa vê
// gasto, leads e custo por lead lado a lado, e é COMPARANDO que ela decide
// subir uma e baixar outra. Tirá-la dali pra uma tela de edição faria ela
// mudar o número sem os outros na frente.
//
// ── A confirmação não é um "tem certeza?" ────────────────────────────────
//
// O erro que acontece de verdade aqui é o decimal: quem quer R$ 50,00 e
// digita "5000" multiplica por cem, a Meta obedece em segundos e o dinheiro
// sai antes de alguém reabrir o sistema. Um "tem certeza?" genérico é
// clicado no automático e não evita nada.
//
// Então o servidor devolve a frase com os dois valores e quantas vezes maior
// é, e ela aparece aqui. A pessoa lê "R$ 50,00 → R$ 5.000,00, 100× a verba
// de agora" e vê o próprio erro sem precisar conferir nada.
//
// Descer não pede confirmação: errar pra baixo entrega menos até alguém
// notar, o que é chato e reversível.

export function Verba({
  clientId,
  nivel,
  objetoId,
  centavos,
  diario,
  podeMexer,
}: {
  clientId: string;
  nivel: "campanha" | "conjunto" | "anuncio";
  objetoId: string;
  centavos: number | null;
  diario: boolean;
  podeMexer: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();
  // Otimista: o número muda na hora e volta se o servidor recusar. Quem está
  // ajustando dez campanhas não pode esperar a Meta a cada uma.
  const [mostrado, setMostrado] = useState(centavos);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editando) campo.current?.focus();
  }, [editando]);

  // Anúncio não tem verba na Meta — quem tem é o conjunto. Mostrar um campo
  // aqui prometeria algo que a Meta recusaria.
  const editavel = podeMexer && nivel !== "anuncio" && mostrado !== null;

  function salvar(confirmado: boolean) {
    setErro(null);
    setConfirmar(null);
    const antes = mostrado;
    comecar(async () => {
      const r = await definirVerba(clientId, nivel, objetoId, valor, confirmado);
      if (r?.precisaConfirmar) {
        setConfirmar(r.precisaConfirmar);
        return;
      }
      if (r?.erro) {
        setErro(r.erro);
        setMostrado(antes);
        return;
      }
      // Lê de volta o que foi digitado, já que o servidor aceitou.
      const limpo = Number(valor.replace(/[R$\s.]/g, "").replace(",", "."));
      if (Number.isFinite(limpo)) setMostrado(Math.round(limpo * 100));
      setEditando(false);
      setValor("");
    });
  }

  if (mostrado === null && !editavel) {
    return <span className="text-foreground-muted">—</span>;
  }

  if (!editando) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="tabular-nums">{comoReais(mostrado)}</span>
          {editavel && (
            <button
              type="button"
              onClick={() => {
                setValor(((mostrado ?? 0) / 100).toFixed(2).replace(".", ","));
                setEditando(true);
              }}
              // Alvo de 44px mesmo num ícone pequeno: esta tela é usada no
              // telefone, e errar o clique aqui abre a linha errada.
              className="inline-flex items-center justify-center w-11 h-11 -my-3 text-foreground-muted hover:text-accent"
              aria-label={`Mudar a verba de ${nivel}`}
            >
              <Pencil size={13} />
            </button>
          )}
        </span>
        <span className="block text-xs text-foreground-muted">{diario ? "Diário" : "Total"}</span>
        {erro && (
          <span className="block text-xs text-red-600 dark:text-red-400 text-right max-w-[14rem]">
            {erro}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="inline-flex items-center gap-1">
        <span className="text-xs text-foreground-muted">R$</span>
        <input
          ref={campo}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar(false);
            if (e.key === "Escape") setEditando(false);
          }}
          inputMode="decimal"
          disabled={pendente}
          className="w-24 px-2 min-h-11 rounded-lg border border-border bg-background text-sm tabular-nums text-right"
        />
        <button
          type="button"
          onClick={() => salvar(false)}
          disabled={pendente}
          className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50"
          aria-label="Salvar a verba"
        >
          <Check size={15} />
        </button>
        <button
          type="button"
          onClick={() => {
            setEditando(false);
            setErro(null);
            setConfirmar(null);
          }}
          className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-foreground-muted hover:bg-surface-muted"
          aria-label="Cancelar"
        >
          <X size={15} />
        </button>
      </div>

      <span className="block text-xs text-foreground-muted">
        {diario ? "por dia" : "no total"}
      </span>

      {confirmar && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-2 max-w-[18rem] text-left">
          <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>{confirmar}</span>
          </p>
          <div className="flex gap-1.5 mt-2">
            <button
              type="button"
              onClick={() => salvar(true)}
              disabled={pendente}
              className="px-3 min-h-11 rounded-lg bg-red-600 text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              Sim, subir a verba
            </button>
            <button
              type="button"
              onClick={() => setConfirmar(null)}
              className="px-3 min-h-11 text-xs text-foreground-muted hover:text-foreground"
            >
              Não
            </button>
          </div>
        </div>
      )}

      {erro && (
        <span className="block text-xs text-red-600 dark:text-red-400 text-right max-w-[16rem]">
          {erro}
        </span>
      )}
    </div>
  );
}

function comoReais(c: number | null): string {
  if (c === null) return "—";
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
