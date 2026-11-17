"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import {
  Bot,
  Send,
  Loader2,
  AlertTriangle,
  Database,
  User as Pessoa,
} from "lucide-react";
import { perguntarAoCopiloto } from "@/lib/actions/copiloto";
import { PERGUNTAS_PRONTAS, type TurnoNaTela } from "@/lib/copiloto/tipos";
import { CartaoDaAcao } from "./acao";

// A conversa.
//
// ── Por que o histórico mora aqui e some ao recarregar ───────────────────
//
// Porque o valor desta tela é a pergunta de agora, não o arquivo do que já
// se perguntou. Guardar conversa no banco é tabela, migração, tela de
// histórico e decisão de quem pode ler a conversa de quem — trabalho real
// por um ganho que ninguém pediu ainda.
//
// O que NÃO podia faltar é o fio da conversa dentro da sessão: "e a semana
// passada?" só faz sentido depois de "como foi a loja X". Isso funciona,
// porque o histórico vai junto a cada pergunta.
//
// Se um dia quiserem voltar na conversa de ontem, o lugar de mexer é este.

export function Conversa({
  lojas,
  temChave,
  variavelDaChave,
  provedor,
  modelo,
  compacto = false,
}: {
  /**
   * Só pra dizer, na tela vazia, quais lojas ele enxerga. Opcional porque a
   * bolha flutuante não faz essa consulta em toda página que você abre —
   * lá o espaço é curto e a frase não cabia de qualquer jeito.
   */
  lojas?: string[];
  temChave: boolean;
  variavelDaChave: string;
  provedor: string;
  modelo: string;
  /** Na bolha o espaço é curto: menos texto de apoio, tudo mais junto. */
  compacto?: boolean;
}) {
  const [turnos, setTurnos] = useState<TurnoNaTela[]>([]);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pensando, comecar] = useTransition();
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turnos, pensando]);

  function mandar(pergunta: string) {
    const p = pergunta.trim();
    if (!p || pensando) return;
    setErro(null);
    setTexto("");

    const historico = turnos.map((t) => ({ de: t.de, texto: t.texto }));
    setTurnos((t) => [...t, { de: "gestor", texto: p }]);

    comecar(async () => {
      const r = await perguntarAoCopiloto(p, historico);
      if (r.erro !== undefined) {
        setErro(r.erro);
        return;
      }
      setTurnos((t) => [
        ...t,
        {
          de: "copiloto",
          texto: r.resposta,
          fonte: r.fonte,
          acoes: r.acoes,
        },
      ]);
    });
  }

  if (!temChave) {
    return (
      <section className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-5 flex flex-col gap-3">
        <h2 className="font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle size={16} /> Falta a chave da IA
        </h2>
        <p className="text-sm text-foreground-muted">
          O Copiloto está pronto — as consultas, a trava de carteira e os
          botões de ação. Falta só a chave do modelo, que mora na Vercel e não
          pode passar por aqui. Em{" "}
          <strong>Settings → Environment Variables</strong>, em{" "}
          <strong>Production</strong>, crie:
        </p>
        <code className="px-3 py-2 rounded-lg bg-surface-muted border border-border font-mono text-xs w-fit">
          {variavelDaChave}
        </code>
        <p className="text-xs text-foreground-muted">
          Hoje o sistema está configurado para <strong>{provedor}</strong>,
          modelo <strong>{modelo}</strong>. Pra trocar de provedor, mude{" "}
          <code className="font-mono">AI_PROVIDER</code> para{" "}
          <code className="font-mono">anthropic</code> ou{" "}
          <code className="font-mono">openai</code>. Depois de salvar, a Vercel
          publica de novo e esta tela abre sozinha.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {turnos.length === 0 && (
        <section
          className={`flex flex-col gap-3 ${
            compacto
              ? ""
              : "rounded-2xl border border-border bg-surface p-5"
          }`}
        >
          {lojas && lojas.length > 0 && (
            <p className="text-sm text-foreground-muted">
              Ele enxerga as {lojas.length}{" "}
              {lojas.length === 1 ? "loja" : "lojas"} da sua carteira:{" "}
              <span className="text-foreground">{lojas.join(", ")}</span>.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {PERGUNTAS_PRONTAS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => mandar(p)}
                className="text-left text-sm px-3 py-2.5 rounded-xl border border-border
                  bg-surface-muted hover:border-border-forte hover:text-foreground
                  text-foreground-muted transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        </section>
      )}

      {turnos.map((t, i) => (
        <Turno key={i} turno={t} />
      ))}

      {pensando && (
        <div className="flex items-center gap-2 text-sm text-foreground-muted px-1">
          <Loader2 size={15} className="animate-spin" />
          Consultando os números…
        </div>
      )}

      {erro && (
        <p className="text-sm text-red-500 flex items-start gap-1.5 px-1">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {erro}
        </p>
      )}

      <div ref={fim} />

      {/* O campo fica embaixo e colado, como em qualquer conversa. */}
      <div className="sticky bottom-0 bg-background pt-2 pb-1">
        <div className="flex gap-2 items-end">
          <textarea
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Enter manda, Shift+Enter quebra linha. É o que a mão já faz
              // sozinha em qualquer conversa.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                mandar(texto);
              }
            }}
            rows={2}
            placeholder="Como está a Real Veículos esta semana?"
            disabled={pensando}
            className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-surface
              text-sm resize-none focus:outline-none focus:border-accent disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => mandar(texto)}
            disabled={pensando || !texto.trim()}
            aria-label="Perguntar"
            className="shrink-0 inline-flex items-center justify-center size-11 rounded-xl
              bg-accent text-white hover:opacity-90 disabled:opacity-40"
          >
            {pensando ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <Send size={17} />
            )}
          </button>
        </div>
        {!compacto && (
          <p className="text-[11px] text-foreground-muted mt-1.5 px-1">
            A conversa some ao recarregar a página. Os números vêm do banco a
            cada pergunta.
          </p>
        )}
      </div>
    </div>
  );
}

function Turno({ turno }: { turno: TurnoNaTela }) {
  if (turno.de === "gestor") {
    return (
      <div className="flex gap-2.5 justify-end">
        <p className="text-sm bg-accent/15 border border-accent/30 rounded-2xl rounded-br-sm px-3.5 py-2.5 max-w-[85%] whitespace-pre-wrap">
          {turno.texto}
        </p>
        <span className="shrink-0 size-7 rounded-full bg-surface-muted border border-border flex items-center justify-center mt-0.5">
          <Pessoa size={14} className="text-foreground-muted" />
        </span>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <span className="shrink-0 size-7 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center mt-0.5">
        <Bot size={14} className="text-accent" />
      </span>
      <div className="flex flex-col gap-2 max-w-[85%]">
        <div className="text-sm bg-surface border border-border rounded-2xl rounded-bl-sm px-3.5 py-2.5 whitespace-pre-wrap leading-relaxed">
          {turno.texto}
        </div>

        {/* De onde veio o número. Em cinza e pequeno, mas sempre presente:
            é o que permite conferir em vez de acreditar. */}
        {turno.fonte && (
          <p className="text-[11px] text-foreground-muted flex items-start gap-1.5 px-1">
            <Database size={11} className="shrink-0 mt-0.5" />
            {turno.fonte}
          </p>
        )}

        {turno.acoes?.map((a, i) => (
          <CartaoDaAcao key={`${a.objetoId}-${i}`} acao={a} />
        ))}
      </div>
    </div>
  );
}
