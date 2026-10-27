"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Pencil, Trash2, Video, X, Clock } from "lucide-react";
import {
  updateGravacao,
  alternarEntrega,
  deleteGravacao,
  type GravacaoFormState,
} from "@/lib/actions/gravacoes";
import { diaDaEntrega, diaCurto } from "@/lib/gravacoes";
import type { LojaOpcao } from "./gravacao-form";

// Uma gravação na lista do mês: o que saiu, quando entrega, e os botões de
// corrigir, marcar como entregue e apagar.
//
// Datas chegam já formatadas pelo servidor (dataForm/horaForm) em vez de ISO
// cru: assim o campo do formulário mostra exatamente o mesmo horário que a
// lista, sem depender do fuso de quem abriu a tela.

export interface GravacaoNaTela {
  id: string;
  clientId: string | null;
  loja: string;
  quantidade: number;
  dataForm: string; // aaaa-mm-dd
  horaForm: string; // hh:mm
  entregaForm: string; // aaaa-mm-dd
  horaLabel: string; // hh:mm
  entregaLabel: string; // dd/mm
  entregue: boolean;
  atrasada: boolean;
  observacao: string | null;
  ownerName: string | null;
  podeApagar: boolean;
}

const campo =
  "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent/40";

const OUTRA = "__outra";

export function GravacaoLinha({
  gravacao: g,
  lojas,
  podeEscolherLoja,
}: {
  gravacao: GravacaoNaTela;
  lojas: LojaOpcao[];
  podeEscolherLoja: boolean;
}) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <FormularioDeEdicao
        gravacao={g}
        lojas={lojas}
        podeEscolherLoja={podeEscolherLoja}
        fechar={() => setEditando(false)}
      />
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm flex items-center gap-1.5 flex-wrap">
          <span className="text-foreground-muted tabular-nums">{g.horaLabel}</span>
          <span className="font-medium truncate">{g.loja}</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-500">
            <Video size={11} />
            {g.quantidade} {g.quantidade === 1 ? "vídeo" : "vídeos"}
          </span>
        </p>
        <p className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
          {g.entregue ? (
            <span className="inline-flex items-center gap-1 text-emerald-500 font-medium">
              <Check size={12} /> Entregue
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 font-medium ${
                g.atrasada ? "text-red-500" : "text-foreground-muted"
              }`}
            >
              <Clock size={12} />
              {g.atrasada ? `Atrasado — era pra entregar ${g.entregaLabel}` : `Entregar ${g.entregaLabel}`}
            </span>
          )}
          {g.ownerName && <span className="text-foreground-muted">· lançou {g.ownerName}</span>}
        </p>
        {g.observacao && <p className="text-xs text-foreground-muted mt-0.5">{g.observacao}</p>}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <form action={alternarEntrega.bind(null, g.id)}>
          <button
            type="submit"
            title={g.entregue ? "Desmarcar entrega" : "Marcar como entregue"}
            className={`p-1.5 rounded-lg transition-colors ${
              g.entregue
                ? "text-emerald-500 hover:bg-emerald-500/10"
                : "text-foreground-muted hover:bg-surface-muted"
            }`}
          >
            <Check size={14} />
          </button>
        </form>
        <button
          type="button"
          onClick={() => setEditando(true)}
          title="Corrigir"
          className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-muted"
        >
          <Pencil size={13} />
        </button>
      </div>
    </div>
  );
}

function FormularioDeEdicao({
  gravacao: g,
  lojas,
  podeEscolherLoja,
  fechar,
}: {
  gravacao: GravacaoNaTela;
  lojas: LojaOpcao[];
  podeEscolherLoja: boolean;
  fechar: () => void;
}) {
  const [state, formAction, salvando] = useActionState<GravacaoFormState, FormData>(
    updateGravacao.bind(null, g.id),
    undefined
  );

  const temNaLista = podeEscolherLoja && lojas.length > 0;
  const [escolha, setEscolha] = useState(temNaLista && g.clientId ? g.clientId : OUTRA);
  const [data, setData] = useState(g.dataForm);

  useEffect(() => {
    if (state?.ok) fechar();
  }, [state, fechar]);

  const digitarNome = escolha === OUTRA;

  return (
    <form action={formAction} className="flex flex-col gap-2 py-3">
      <div className="grid sm:grid-cols-2 gap-2">
        {temNaLista ? (
          <select
            // Igual ao formulário de cima: "Outra loja" é escolha de tela, não
            // id de cliente. O campo escondido é que vai pro servidor.
            value={escolha}
            onChange={(e) => setEscolha(e.target.value)}
            className={campo}
            aria-label="Loja"
          >
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.companyName}
              </option>
            ))}
            <option value={OUTRA}>Outra loja (digitar o nome)</option>
          </select>
        ) : null}
        <input type="hidden" name="clientId" value={digitarNome ? "" : escolha} />
        {digitarNome && (
          <input name="loja" defaultValue={g.loja} placeholder="Nome da loja" required className={campo} />
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <input
          type="date"
          name="data"
          required
          value={data}
          onChange={(e) => setData(e.target.value)}
          className={campo}
          aria-label="Dia da gravação"
        />
        <input
          type="time"
          name="hora"
          required
          defaultValue={g.horaForm}
          className={campo}
          aria-label="Hora"
        />
        <input
          type="number"
          name="quantidade"
          min={1}
          max={200}
          step={1}
          required
          defaultValue={g.quantidade}
          inputMode="numeric"
          className={campo}
          aria-label="Quantos vídeos"
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-foreground-muted">
          Entregar em — o padrão pra {diaCurto(data)} é {diaCurto(diaDaEntrega(data))}
        </span>
        <input type="date" name="entrega" defaultValue={g.entregaForm} className={campo} />
      </label>

      <input
        name="observacao"
        defaultValue={g.observacao ?? ""}
        placeholder="Observação (opcional)"
        className={campo}
      />

      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-60"
        >
          <Check size={13} />
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={fechar}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-surface-muted"
        >
          <X size={13} /> Cancelar
        </button>

        {/* Apagar fica aqui dentro, atrás do "corrigir", pra não existir um
            botão de lixeira à mão de distância na lista do dia a dia. */}
        {g.podeApagar && (
          <form
            action={deleteGravacao.bind(null, g.id)}
            className="ml-auto"
            onSubmit={(e) => {
              if (
                !window.confirm(
                  `Apagar a gravação de "${g.loja}" (${g.quantidade} vídeo(s))?\n\nIsso não dá pra desfazer.`
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-500/10"
            >
              <Trash2 size={13} /> Apagar
            </button>
          </form>
        )}
      </div>
    </form>
  );
}
