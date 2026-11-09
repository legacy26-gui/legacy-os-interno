"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, X, ArrowRight } from "lucide-react";
import { marcarAlertasComoVistos } from "@/lib/actions/alertas";
import {
  ROTULO_DO_TIPO,
  TOM_POR_NIVEL,
  ESTILO_DO_SELO,
  type AlertaNaTela,
} from "@/lib/alertas/tipos";

// O alerta dentro do sistema: o sininho abre um painel por cima da tela onde a
// pessoa estiver, sem tirar ela do que está fazendo.
//
// Vale em qualquer tela porque o sininho mora no cabeçalho — ela pode estar
// em Gravações, em Clientes, onde for.
//
// E quando aparece coisa nova, um aviso de canto se apresenta sozinho: a
// pessoa pode estar trabalhando em outra aba sem olhar pro sininho.

const COR_DA_BOLINHA: Record<1 | 2 | 3, string> = {
  1: "bg-amber-500 text-black",
  2: "bg-red-500 text-white",
  3: "bg-red-600 text-white",
};

export function PainelAlertas({
  alertas,
  total,
}: {
  /** Os primeiros da lista, já prontos pra mostrar. */
  alertas: AlertaNaTela[];
  /** Quantos são no total — pode ser mais do que os que vieram. */
  total: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [, marcar] = useTransition();
  const caixa = useRef<HTMLDivElement>(null);

  const novos = alertas.filter((a) => a.novo);
  // A bolinha pega a cor do pior alerta: de longe, a cor é a informação.
  const pior = alertas.reduce<1 | 2 | 3>((p, a) => (a.nivel > p ? a.nivel : p), 1);

  function abrir() {
    setAberto(true);
    // Abriu, viu: o "novo" some e o aviso de canto cala. Nada é marcado como
    // resolvido — o alerta continua na lista igual.
    if (novos.length > 0) marcar(() => void marcarAlertasComoVistos());
  }

  // Fecha ao clicar fora e no Esc: é um painel, não uma tela — não pode
  // prender ninguém.
  useEffect(() => {
    if (!aberto) return;
    function foraDaCaixa(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", foraDaCaixa);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", foraDaCaixa);
      document.removeEventListener("keydown", escape);
    };
  }, [aberto]);

  return (
    <>
      <div className="relative" ref={caixa}>
        <button
          type="button"
          onClick={() => (aberto ? setAberto(false) : abrir())}
          aria-label={total === 0 ? "Alertas" : `${total} alertas pedindo ação`}
          aria-expanded={aberto}
          title={total === 0 ? "Nenhum alerta" : `${total} pedindo ação`}
          className="relative flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-surface-muted hover:bg-border/60 transition-colors text-foreground-muted"
        >
          <Bell size={16} />
          {total > 0 && (
            <span
              className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${COR_DA_BOLINHA[pior]}`}
            >
              {total > 99 ? "99+" : total}
            </span>
          )}
        </button>

        {aberto && (
          <div
            // No celular ocupa a largura da tela com uma folga; no computador
            // é um painel de 360px ancorado no sininho.
            className="absolute right-0 top-11 z-50 w-[calc(100vw-2rem)] sm:w-[360px] max-w-[360px] rounded-xl border border-border bg-surface shadow-xl overflow-hidden"
          >
            <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between">
              <p className="text-sm font-medium">
                {total === 0 ? "Nenhum alerta" : `${total} pedindo ação`}
              </p>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="p-1 rounded-lg text-foreground-muted hover:bg-surface-muted"
              >
                <X size={14} />
              </button>
            </div>

            {total === 0 ? (
              <p className="px-3.5 py-6 text-sm text-foreground-muted text-center">
                Tudo em ordem por aqui.
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/60">
                {alertas.map((a) => (
                  <Link
                    key={a.chave}
                    href={a.link}
                    onClick={() => setAberto(false)}
                    className="flex items-start gap-2.5 px-3.5 py-2.5 hover:bg-surface-muted transition-colors"
                  >
                    <span
                      className={`mt-0.5 shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${ESTILO_DO_SELO[TOM_POR_NIVEL[a.nivel]]}`}
                    >
                      {ROTULO_DO_TIPO[a.tipo]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-5 truncate">{a.titulo}</span>
                      {a.detalhe && (
                        <span className="block text-[11px] text-foreground-muted truncate">
                          {a.detalhe}
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            )}

            <Link
              href="/alertas"
              onClick={() => setAberto(false)}
              className="flex items-center justify-center gap-1 px-3.5 py-2.5 border-t border-border text-xs font-medium text-accent hover:bg-surface-muted transition-colors"
            >
              Ver todos os alertas <ArrowRight size={12} />
            </Link>
          </div>
        )}
      </div>

      <AvisoDeCanto novos={novos} aoAbrir={abrir} escondido={aberto} />
    </>
  );
}

/**
 * O aviso que se apresenta sozinho quando aparece coisa nova.
 *
 * Aparece uma vez por aba do navegador, e some sozinho. A marca do que já foi
 * mostrado leva a lista dos alertas novos junto: se amanhã entrar um problema
 * diferente, o aviso volta, mas ficar navegando pelo sistema não faz ele
 * reaparecer a cada clique.
 */
function AvisoDeCanto({
  novos,
  aoAbrir,
  escondido,
}: {
  novos: AlertaNaTela[];
  aoAbrir: () => void;
  escondido: boolean;
}) {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    if (novos.length === 0) return;
    const marca = "alertas-avisados:" + novos.map((a) => `${a.chave}@${a.nivel}`).sort().join("|");
    try {
      if (sessionStorage.getItem(marca)) return;
      sessionStorage.setItem(marca, "1");
    } catch {
      // Navegador com armazenamento bloqueado: mostra assim mesmo. Aparecer
      // demais é bem melhor que nunca aparecer.
    }
    setMostrar(true);
    const t = setTimeout(() => setMostrar(false), 12_000);
    return () => clearTimeout(t);
  }, [novos]);

  if (!mostrar || escondido) return null;

  const primeiro = novos[0];
  return (
    <div
      role="status"
      className="fixed z-50 right-4 bottom-[calc(1rem_+_env(safe-area-inset-bottom,0px))] w-[min(320px,calc(100vw-2rem))] rounded-xl border border-border bg-surface shadow-xl p-3"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-accent shrink-0">
          <Bell size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {novos.length === 1 ? ROTULO_DO_TIPO[primeiro.tipo] : `${novos.length} alertas novos`}
          </p>
          <p className="text-xs text-foreground-muted truncate">
            {/* Dois nomes e o resto em número: a lista inteira não cabe, e o
                que importa aqui é dar o tamanho do problema, não o inventário
                — o inventário está a um clique, no painel. */}
            {novos.length === 1
              ? [primeiro.titulo, primeiro.detalhe].filter(Boolean).join(" — ")
              : novos.slice(0, 2).map((a) => a.titulo).join(", ") +
                (novos.length > 2 ? ` e mais ${novos.length - 2}` : "")}
          </p>
          <button
            type="button"
            onClick={() => {
              setMostrar(false);
              aoAbrir();
            }}
            className="text-xs font-medium text-accent hover:underline mt-1"
          >
            Ver
          </button>
        </div>
        <button
          type="button"
          onClick={() => setMostrar(false)}
          aria-label="Fechar aviso"
          className="p-1 rounded-lg text-foreground-muted hover:bg-surface-muted shrink-0"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
