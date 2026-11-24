"use client";

import { useActionState, useRef, useTransition } from "react";
import { CheckCircle2, Circle, ListChecks, Plus, Repeat, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import {
  concluirTarefaPessoal,
  criarTarefaPessoal,
  pararTarefaPessoal,
  reabrirTarefaPessoal,
  type TarefaFormState,
} from "@/lib/actions/tarefas-pessoais";

// As tarefas do dia, no Meu Dia. As mesmas que o robô lembra de manhã (8h30) e cobra às 17h pelo WhatsApp.
// Concluir aqui e "feito 2" no WhatsApp são a mesma coisa.

export interface TarefaDoDia {
  id: string;
  titulo: string;
  feita: boolean;
  atrasada: boolean;
  /** "toda segunda", "amanhã", "ontem"… já escrito pelo servidor. */
  quando: string;
  deQuem: string | null;
}

export function BlocoTarefas({
  tarefas,
  nomeDoDia,
  podeMexer,
  equipe,
}: {
  tarefas: TarefaDoDia[];
  /** Nome de quem é este dia, quando não é o meu. */
  nomeDoDia: string | null;
  podeMexer: boolean;
  /** Quem pode receber tarefa (só dono e gerência veem o seletor). */
  equipe: { id: string; nome: string }[] | null;
}) {
  const [pendente, comecar] = useTransition();
  const [estado, criar, criando] = useActionState<TarefaFormState, FormData>(criarTarefaPessoal, undefined);
  const form = useRef<HTMLFormElement>(null);
  const abertas = tarefas.filter((t) => !t.feita).length;

  return (
    <section className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold flex items-center gap-2">
          <ListChecks size={17} className="text-accent" />
          Tarefas de hoje{nomeDoDia ? ` — ${nomeDoDia}` : ""}
        </h2>
        <span className="text-xs text-foreground-muted">
          {tarefas.length === 0 ? "nada por hoje" : abertas === 0 ? "tudo feito 🎉" : `${abertas} ${abertas === 1 ? "aberta" : "abertas"}`}
        </span>
      </div>

      {tarefas.length > 0 && (
        <ul className="flex flex-col gap-1">
          {tarefas.map((t) => (
            <li key={t.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted">
              <button
                type="button"
                disabled={!podeMexer || pendente}
                onClick={() => comecar(() => (t.feita ? reabrirTarefaPessoal(t.id) : concluirTarefaPessoal(t.id)))}
                className="mt-0.5 shrink-0 text-foreground-muted hover:text-accent disabled:opacity-50"
                aria-label={t.feita ? "Desfazer: marcar como não feita" : "Marcar como feita"}
              >
                {t.feita ? <CheckCircle2 size={18} className="text-emerald-500" /> : <Circle size={18} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${t.feita ? "line-through text-foreground-muted" : ""}`}>{t.titulo}</p>
                {!t.feita && (t.quando || t.deQuem) && (
                  <p className={`text-xs flex items-center gap-1 ${t.atrasada ? "text-red-500 font-medium" : "text-foreground-muted"}`}>
                    {t.atrasada ? <AlertTriangle size={11} /> : t.quando.startsWith("to") ? <Repeat size={11} /> : null}
                    {t.atrasada ? `atrasada (${t.quando})` : t.quando}
                    {t.deQuem ? ` · de ${t.deQuem}` : ""}
                  </p>
                )}
              </div>
              {podeMexer && (
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => {
                    if (confirm(t.quando.startsWith("to") ? "Parar esta tarefa que se repete? Ela não volta mais." : "Cancelar esta tarefa?")) comecar(() => pararTarefaPessoal(t.id));
                  }}
                  className="shrink-0 text-foreground-muted/60 hover:text-red-500 disabled:opacity-50"
                  aria-label="Cancelar tarefa"
                  title="Cancelar (ou parar, se repete)"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {podeMexer && (
        <form
          ref={form}
          action={async (fd) => {
            await criar(fd);
            form.current?.reset();
          }}
          className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
        >
          <label className="flex-1 min-w-[12rem] text-xs text-foreground-muted">
            Nova tarefa
            <input name="titulo" required minLength={3} maxLength={300} placeholder="Ex.: ligar pra Vilela" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </label>
          <label className="text-xs text-foreground-muted">
            Quando
            <input type="date" name="quando" className="mt-1 block rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" />
          </label>
          <label className="text-xs text-foreground-muted">
            Repete
            <select name="repete" defaultValue="NENHUMA" className="mt-1 block rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground">
              <option value="NENHUMA">Não repete</option>
              <option value="DIARIA">Todo dia</option>
              <option value="SEMANAL">Toda semana (no dia escolhido)</option>
              <option value="MENSAL">Todo mês (no dia escolhido)</option>
            </select>
          </label>
          {equipe && equipe.length > 0 && (
            <label className="text-xs text-foreground-muted">
              Pra quem
              <select name="responsavelId" defaultValue="" className="mt-1 block rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground">
                <option value="">Pra mim</option>
                {equipe.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" disabled={criando} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
            {criando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar
          </button>
          {estado?.erro && <p className="w-full text-xs text-red-500">{estado.erro}</p>}
          <p className="w-full text-xs text-foreground-muted">
            Pelo WhatsApp também: <em>me lembra de ligar pra Vilela sexta</em>, <em>o que tenho hoje?</em>, <em>feito 2</em>. De manhã o robô manda a lista e às 17h pergunta se está feito.
          </p>
        </form>
      )}
    </section>
  );
}
