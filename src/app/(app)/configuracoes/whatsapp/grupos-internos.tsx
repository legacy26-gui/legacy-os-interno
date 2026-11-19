"use client";

import { useState, useTransition } from "react";
import { Users, Check, AlertTriangle, RefreshCw } from "lucide-react";
import {
  definirGrupoInterno,
  buscarGruposDaZapi,
} from "@/lib/actions/whatsapp";
import type { GrupoNaTela } from "@/lib/whatsapp/ligacao";

// Os grupos onde a IA responde PERGUNTA da equipe.
//
// ── Por que esta seção é separada da lista de lojas ──────────────────────
//
// Porque são dois comportamentos opostos no mesmo robô, e confundi-los é o
// jeito de vazar dado de cliente:
//
//   grupo de LOJA    → a IA desliga carro quando pedem, e não responde mais
//                      nada. O cliente está lendo.
//   grupo INTERNO    → a IA responde sobre a carteira de quem perguntou. Só
//                      a equipe está lendo.
//
// Um grupo de cliente marcado como interno faria a IA listar as lojas dos
// outros clientes dentro da conversa de um deles. Por isso os grupos que já
// são de alguma loja nem aparecem aqui — e o servidor recusa de novo, porque
// tela se contorna e servidor não.
//
// ── Por que esta seção busca os grupos sozinha ───────────────────────────
//
// Porque antes ela dependia de alguém ter clicado em "buscar grupos" numa
// seção ACIMA dela. Quem abria a tela via um título, uma frase e nenhuma
// opção — e concluía, com razão, que a opção não existia. Foi o que
// aconteceu com o Guilherme.
//
// Uma seção que precisa de um clique em outro lugar pra funcionar é uma
// seção quebrada, por mais que o texto explique. O botão é dela agora.

export function GruposInternos({
  grupos,
  jaInternos,
}: {
  /** O que a seção de cima já buscou, se buscou. Null quando ninguém buscou. */
  grupos: GrupoNaTela[] | null;
  jaInternos: string[];
}) {
  const [internos, setInternos] = useState<string[]>(jaInternos);
  const [msg, setMsg] = useState<{ ok?: string; erro?: string }>({});
  const [pendente, comecar] = useTransition();
  /** A lista que ESTA seção buscou, quando a de cima não tinha buscado. */
  const [meus, setMeus] = useState<GrupoNaTela[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  const lista = grupos ?? meus;

  function buscar() {
    setMsg({});
    setBuscando(true);
    comecar(async () => {
      const r = await buscarGruposDaZapi();
      setBuscando(false);
      if (r.ok) setMeus(r.grupos);
      else setMsg({ erro: r.erro });
    });
  }

  // Grupo que já é de uma loja não entra na lista: oferecer a opção seria
  // oferecer o acidente.
  const candidatos = (lista ?? []).filter((g) => !g.lojaId);

  function alternar(g: GrupoNaTela, querInterno: boolean) {
    setMsg({});
    comecar(async () => {
      const r = await definirGrupoInterno(g.id, g.nome, querInterno);
      setMsg(r.erro ? { erro: r.erro } : { ok: r.ok });
      if (!r.erro) {
        setInternos((atual) =>
          querInterno ? [...atual, g.id] : atual.filter((x) => x !== g.id),
        );
      }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold flex items-center gap-2">
          <Users size={16} /> Grupos internos da agência
        </h2>
        <p className="text-sm text-foreground-muted mt-0.5">
          Aqui a equipe marca a IA com @ e pergunta sobre as lojas — cada
          pessoa recebe a resposta da carteira dela. Em grupo de cliente a IA
          nunca faz isso: a resposta mostraria as lojas dos outros.
        </p>
      </div>

      {lista === null ? (
        <button
          type="button"
          onClick={buscar}
          disabled={pendente}
          className="inline-flex items-center gap-2 px-4 min-h-11 rounded-lg border border-border
            bg-surface-muted text-sm font-medium hover:bg-border/60 disabled:opacity-50 w-fit"
        >
          <RefreshCw size={14} className={buscando ? "animate-spin" : ""} />
          {buscando ? "Buscando…" : "Buscar os grupos do número"}
        </button>
      ) : candidatos.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-foreground-muted">
            Todos os {lista.length} grupos do número já estão ligados a alguma
            loja. Grupo de cliente não pode ser interno — a IA listaria as
            lojas dos outros lá dentro.
          </p>
          <button
            type="button"
            onClick={buscar}
            disabled={pendente}
            className="text-xs text-foreground-muted hover:text-foreground underline w-fit"
          >
            Buscar de novo
          </button>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {candidatos.map((g) => {
            const ligado = internos.includes(g.id);
            return (
              <label
                key={g.id}
                className="py-2.5 flex items-center gap-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={ligado}
                  disabled={pendente}
                  onChange={(e) => alternar(g, e.target.checked)}
                  className="accent-current"
                />
                <span className="text-sm flex-1">{g.nome}</span>
                {ligado && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                    a IA responde aqui
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}

      {msg.ok && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-start gap-1.5">
          <Check size={15} className="shrink-0 mt-0.5" />
          {msg.ok}
        </p>
      )}
      {msg.erro && (
        <p className="text-sm text-red-500 flex items-start gap-1.5">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          {msg.erro}
        </p>
      )}
    </section>
  );
}
