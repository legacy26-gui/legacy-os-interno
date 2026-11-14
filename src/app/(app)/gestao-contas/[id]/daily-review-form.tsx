"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Pin, Check as Tique } from "lucide-react";
import { submitDailyReview } from "@/lib/actions/account-management";
import { PlaybookHint } from "@/components/playbook-hint";
import { DAILY_REVIEW_CHECKS } from "@/lib/labels";

// A revisão do dia de um cliente.
//
// ── O que esta tela virou ────────────────────────────────────────────────
//
// Era uma lista de conferência operacional: saldo, orçamento diário, gasto de
// hoje, limite de cobrança, pagamentos pendentes. Cinco quadradinhos pra
// confirmar números que o sistema hoje mostra sozinho, atualizados de quinze
// em quinze minutos, com alerta quando saem do lugar.
//
// Marcar à mão o que a máquina já olha não é conferência, é digitação. E
// quadradinho que se marca sem olhar ensina a marcar sem olhar o resto.
//
// Então sobrou o que é de RELACIONAMENTO — o que só uma pessoa sabe se fez —
// e entrou o que a pessoa precisa ter na frente pra falar com a loja: as
// observações do cliente, onde ficam senha, verba combinada e o que mais a
// equipe anotou.
//
// ── E por que não se apaga mais ──────────────────────────────────────────
//
// Porque apagava. Terminava de preencher, salvava, e o formulário voltava
// vazio no mesmo instante — sem nada dizendo que tinha dado certo, e sem
// jeito de ver o que foi marcado. Quem reabria depois do almoço não sabia se
// já tinha passado por ali, e remarcava.
//
// Agora o que foi salvo hoje continua na tela até o dia virar: as marcações
// aparecem como feitas, a observação escrita fica legível, e dá pra escrever
// mais uma sem perder a anterior.

export interface RevisaoDeHoje {
  /** Os nomes dos campos marcados hoje. */
  marcados: string[];
  notas: string | null;
  /** Quem fez, primeiro nome. */
  quem: string | null;
  /** Hora, já formatada. */
  hora: string | null;
}

export interface ObservacaoFixada {
  label: string;
  value: string;
}

function Check({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-2.5 py-1.5 cursor-pointer text-sm">
      <input
        type="checkbox"
        name={name}
        className="w-4 h-4 rounded border-border accent-[var(--accent,#6366f1)]"
      />
      {label}
    </label>
  );
}

export function DailyReviewForm({
  clientId,
  suggestions = [],
  observacoes = null,
  fixadas = [],
  revisaoDeHoje = null,
}: {
  clientId: string;
  suggestions?: { id: string; title: string }[];
  /** As observações internas da loja: senha, verba combinada, o que houver. */
  observacoes?: string | null;
  /** As informações fixadas da loja, se houver. */
  fixadas?: ObservacaoFixada[];
  /** O que já foi salvo hoje. Null quando ninguém passou por aqui ainda. */
  revisaoDeHoje?: RevisaoDeHoje | null;
}) {
  const [state, formAction, saving] = useActionState(
    submitDailyReview.bind(null, clientId),
    undefined,
  );
  // Depois de salvar, a tela passa a mostrar o que foi salvo. O estado do
  // servidor só chega na próxima renderização da página, então isto segura a
  // confirmação no meio tempo — senão pisca "vazio" por um instante, que é
  // exatamente a sensação de "sumiu" que a gente veio consertar.
  const [salvouAgora, setSalvouAgora] = useState(false);
  const jaFoiHoje = revisaoDeHoje !== null || salvouAgora;

  const temObservacao = Boolean(observacoes?.trim()) || fixadas.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ── As observações da loja, em cima de tudo ────────────────────
          É o que a pessoa precisa ANTES de falar com a loja: senha, verba
          combinada, o combinado da semana. Estava só na ficha do cliente,
          a dois cliques daqui — e dois cliques no meio de uma ligação é o
          mesmo que não ter. */}
      {temObservacao && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-1.5">
            <Pin size={12} /> Observações da loja
          </p>
          {fixadas.length > 0 && (
            <ul className="flex flex-col gap-0.5 mb-1.5">
              {fixadas.map((f) => (
                <li key={`${f.label}-${f.value}`} className="text-sm">
                  <span className="text-foreground-muted">{f.label}: </span>
                  <span className="font-medium break-all">{f.value}</span>
                </li>
              ))}
            </ul>
          )}
          {observacoes?.trim() && (
            <p className="text-sm whitespace-pre-wrap break-words">
              {observacoes}
            </p>
          )}
        </div>
      )}

      {jaFoiHoje && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
            <Tique size={13} />
            Revisão de hoje feita
            {revisaoDeHoje?.quem && ` por ${revisaoDeHoje.quem}`}
            {revisaoDeHoje?.hora && ` às ${revisaoDeHoje.hora}`}
          </p>
          {revisaoDeHoje && revisaoDeHoje.marcados.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {DAILY_REVIEW_CHECKS.filter(([nome]) =>
                revisaoDeHoje.marcados.includes(nome),
              ).map(([nome, rotulo]) => (
                <li
                  key={nome}
                  className="text-xs text-foreground-muted flex items-center gap-1.5"
                >
                  <Tique size={11} className="text-emerald-500 shrink-0" />{" "}
                  {rotulo}
                </li>
              ))}
            </ul>
          )}
          {revisaoDeHoje?.notas && (
            <p className="mt-1.5 text-sm whitespace-pre-wrap break-words">
              {revisaoDeHoje.notas}
            </p>
          )}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <PlaybookHint playbooks={suggestions} />
        <div>
          {DAILY_REVIEW_CHECKS.map(([name, label]) => (
            <Check key={name} name={name} label={label} />
          ))}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium mb-1">
            {jaFoiHoje ? "Acrescentar uma observação" : "Observações"}
          </p>
          <textarea
            name="notes"
            rows={2}
            placeholder="O que ficou combinado, o que a loja pediu…"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        {state?.error && <p className="text-xs text-red-500">{state.error}</p>}

        <button
          type="submit"
          onClick={() => setSalvouAgora(true)}
          disabled={saving}
          className="self-start inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          <CheckCircle2 size={15} />
          {saving
            ? "Salvando..."
            : jaFoiHoje
              ? "Salvar de novo"
              : "Concluir revisão do dia"}
        </button>
      </form>
    </div>
  );
}
