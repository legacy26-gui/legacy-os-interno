"use client";

import { useState, useTransition } from "react";
import { Stethoscope, RefreshCw } from "lucide-react";
import { verRecadosDaZapi } from "@/lib/actions/whatsapp";

// A lupa: o que a Z-API mandou nas últimas mensagens.
//
// ── Por que uma tela pra isto ────────────────────────────────────────────
//
// Porque quando o robô não responde, não há nada pra olhar. O atendimento
// acontece depois da resposta HTTP, e uma mensagem descartada — justamente a
// que a gente precisa investigar — não deixa rastro nenhum.
//
// Sem isto, descobrir por que uma mensagem de grupo sumiu é mandar mensagem,
// esperar, não ver nada, e chutar de novo. Com isto é uma olhada.
//
// Mostra a ESTRUTURA do recado, nunca o texto da mensagem. O que interessa
// pra descobrir por que o robô ficou mudo é se ele foi marcado, não o que
// foi escrito.

interface Recado {
  id: string;
  recebidoEm: Date | string;
  chaves: string;
  isGroup: boolean | null;
  fromMe: boolean | null;
  de: string | null;
  participante: string | null;
  numeroDoRobo: string | null;
  mencionados: string | null;
  temArrobaComNumero: boolean;
  tamanhoDoTexto: number;
}

export function RecadosDaZapi() {
  const [recados, setRecados] = useState<Recado[] | null>(null);
  const [pendente, comecar] = useTransition();

  function buscar() {
    comecar(async () => {
      const r = await verRecadosDaZapi();
      setRecados(r as unknown as Recado[]);
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <Stethoscope size={16} /> O que a Z-API mandou
          </h2>
          <p className="text-sm text-foreground-muted mt-0.5">
            Quando o robô não responde, é aqui que se descobre por quê. Mostra
            os campos do recado, nunca o texto da mensagem.
          </p>
        </div>
        <button
          type="button"
          onClick={buscar}
          disabled={pendente}
          className="inline-flex items-center gap-2 px-3 min-h-10 rounded-lg border border-border
            bg-surface-muted text-sm hover:bg-border/60 disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={14} className={pendente ? "animate-spin" : ""} />
          {pendente ? "Lendo…" : "Ver os últimos"}
        </button>
      </div>

      {recados !== null &&
        (recados.length === 0 ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Nenhum recado chegou ainda. Se você acabou de mandar mensagem pro
            robô e isto está vazio, a Z-API não está chamando o nosso endereço
            — o problema é o webhook, não o sistema.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-foreground-muted uppercase tracking-wide">
                  <th className="py-2 pr-3 font-medium">Quando</th>
                  <th className="py-2 pr-3 font-medium">Grupo?</th>
                  <th className="py-2 pr-3 font-medium">De</th>
                  <th className="py-2 pr-3 font-medium">Quem escreveu</th>
                  <th className="py-2 pr-3 font-medium">Nº do robô</th>
                  <th className="py-2 pr-3 font-medium">Marcou?</th>
                  <th className="py-2 pr-3 font-medium">Texto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-mono">
                {recados.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {new Date(r.recebidoEm).toLocaleTimeString("pt-BR")}
                    </td>
                    <td className="py-2 pr-3">
                      {r.isGroup === null ? "—" : r.isGroup ? "sim" : "não"}
                    </td>
                    <td className="py-2 pr-3 max-w-[14rem] truncate">
                      {r.de ?? "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <Falta valor={r.participante} />
                    </td>
                    <td className="py-2 pr-3">
                      <Falta valor={r.numeroDoRobo} />
                    </td>
                    <td className="py-2 pr-3">
                      {r.temArrobaComNumero ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          no texto
                        </span>
                      ) : r.mencionados ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          na lista
                        </span>
                      ) : (
                        <span className="text-red-500">não</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{r.tamanhoDoTexto} car.</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="text-[11px] text-foreground-muted mt-3 font-mono break-all">
              campos do último: {recados[0].chaves}
            </p>
          </div>
        ))}
    </section>
  );
}

/** Campo ausente aparece em vermelho: é quase sempre ele a causa. */
function Falta({ valor }: { valor: string | null }) {
  if (!valor) return <span className="text-red-500">não veio</span>;
  return <span>{valor}</span>;
}
