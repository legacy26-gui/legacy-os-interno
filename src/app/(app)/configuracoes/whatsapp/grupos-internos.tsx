"use client";

import { useState, useTransition } from "react";
import { Users, Check, AlertTriangle } from "lucide-react";
import { definirGrupoInterno } from "@/lib/actions/whatsapp";
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

export function GruposInternos({
  grupos,
  jaInternos,
}: {
  /** Null enquanto ninguém buscou a lista do número. */
  grupos: GrupoNaTela[] | null;
  jaInternos: string[];
}) {
  const [internos, setInternos] = useState<string[]>(jaInternos);
  const [msg, setMsg] = useState<{ ok?: string; erro?: string }>({});
  const [pendente, comecar] = useTransition();

  // Grupo que já é de uma loja não entra na lista: oferecer a opção seria
  // oferecer o acidente.
  const candidatos = (grupos ?? []).filter((g) => !g.lojaId);

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

      {grupos === null ? (
        <p className="text-sm text-foreground-muted">
          Busque os grupos do número acima pra escolher aqui.
        </p>
      ) : candidatos.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          Todos os grupos do número já estão ligados a alguma loja. Grupo de
          cliente não pode ser interno.
        </p>
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
