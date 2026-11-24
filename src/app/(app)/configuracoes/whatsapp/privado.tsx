"use client";

import { useState, useTransition } from "react";
import { UserSearch, RefreshCw } from "lucide-react";
import { verQuemOPrivadoReconhece } from "@/lib/actions/whatsapp";

// "Quem o robô reconhece no privado?": a lupa pra quando alguém da casa escreve e recebe o recado de "número desconhecido".
// Mostra o fim dos números e o que o robô concluiu — nunca o texto das mensagens.

type Resultado = NonNullable<Awaited<ReturnType<typeof verQuemOPrivadoReconhece>>>;

const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function PrivadoDoRobo() {
  const [r, setR] = useState<Resultado | null | undefined>(undefined);
  const [pendente, comecar] = useTransition();

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <UserSearch size={16} /> Quem o robô reconhece no privado
          </h2>
          <p className="text-sm text-foreground-muted mt-0.5">
            Se alguém da casa escreve pro robô e recebe “este número é um atendimento interno”, é aqui que se vê por quê.
          </p>
        </div>
        <button
          type="button"
          onClick={() => comecar(async () => setR(await verQuemOPrivadoReconhece()))}
          disabled={pendente}
          className="inline-flex items-center gap-2 px-3 min-h-10 rounded-lg border border-border bg-surface-muted text-sm hover:bg-border/60 disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={14} className={pendente ? "animate-spin" : ""} />
          {pendente ? "Conferindo…" : "Conferir agora"}
        </button>
      </div>

      {r === null && <p className="text-sm text-red-500">Só o administrador vê isto.</p>}
      {r && (
        <div className="flex flex-col gap-4 text-xs">
          <div className="overflow-x-auto">
            <p className="font-medium mb-1">Pessoas com WhatsApp na ficha</p>
            <table className="w-full">
              <thead>
                <tr className="text-left text-foreground-muted uppercase tracking-wide">
                  <th className="py-1.5 pr-3 font-medium">Pessoa</th>
                  <th className="py-1.5 pr-3 font-medium">Ativa?</th>
                  <th className="py-1.5 pr-3 font-medium">Número</th>
                  <th className="py-1.5 pr-3 font-medium">Achou na Z-API?</th>
                  <th className="py-1.5 pr-3 font-medium">Repetido com</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {r.pessoas.map((p) => (
                  <tr key={p.nome + p.numero}>
                    <td className="py-1.5 pr-3">{p.nome}</td>
                    <td className="py-1.5 pr-3">{p.ativa ? "sim" : <span className="text-red-500">NÃO (inativa)</span>}</td>
                    <td className="py-1.5 pr-3 font-mono">{p.numero} <span className="text-foreground-muted">({p.comoFicou})</span></td>
                    <td className="py-1.5 pr-3">{p.lidAchado ? <span className="text-emerald-600 dark:text-emerald-400">sim</span> : <span className="text-amber-600 dark:text-amber-400">não achou</span>}</td>
                    <td className="py-1.5 pr-3">{p.repetidoCom.length ? <span className="text-red-500">{p.repetidoCom.join(", ")}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-foreground-muted mt-1">“Achou na Z-API” = a Z-API conhece esse número no WhatsApp. “Repetido” = dois cadastros com o mesmo número: o robô não escolhe, e não reconhece nenhum dos dois.</p>
          </div>

          <div className="overflow-x-auto">
            <p className="font-medium mb-1">Últimas mensagens privadas que chegaram</p>
            {r.recentes.length === 0 ? (
              <p className="text-amber-600 dark:text-amber-400">Nenhuma mensagem privada chegou ainda.</p>
            ) : (
              <table className="w-full">
                <tbody className="divide-y divide-border/60 font-mono">
                  {r.recentes.map((x, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{hora(x.quando)}</td>
                      <td className="py-1.5 pr-3">{x.origem}</td>
                      <td className="py-1.5 pr-3">{x.reconhecida ? <span className="text-emerald-600 dark:text-emerald-400">é {x.reconhecida}</span> : <span className="text-red-500">ninguém</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="overflow-x-auto">
            <p className="font-medium mb-1">O que o robô fez com elas</p>
            {r.trilha.length === 0 ? (
              <p className="text-foreground-muted">Sem rastro ainda.</p>
            ) : (
              <table className="w-full">
                <tbody className="divide-y divide-border/60 font-mono">
                  {r.trilha.map((t, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{hora(t.quando)}</td>
                      <td className="py-1.5 pr-3">{t.de}</td>
                      <td className="py-1.5 pr-3">{t.passo}</td>
                      <td className="py-1.5 pr-3 text-foreground-muted">{t.detalhe ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
