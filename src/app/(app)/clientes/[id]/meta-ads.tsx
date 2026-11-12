"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Megaphone, RefreshCw, AlertTriangle, Plus, BarChart3 } from "lucide-react";
import {
  vincularContaAnuncios,
  atualizarSaldoAgora,
  type MetaAdsState,
} from "@/lib/actions/meta-ads";

// O bloco "Meta Ads" na ficha do cliente.
//
// Os números chegam prontos do servidor (saldo já em R$, "atualizado há X" já
// escrito). Formatar aqui dentro daria hidratação divergente — o servidor e o
// navegador não têm a mesma hora nem o mesmo idioma — e, pior, daria dois
// lugares calculando a mesma coisa.

export interface ContaNaTela {
  id: string;
  metaAccountId: string;
  isPrepay: boolean;
  /** Saldo já formatado, ou null quando não há leitura confiável. */
  saldoTexto: string | null;
  /** "há 5 min", "há 2 dias" — da última vez que o sistema OLHOU. */
  atualizadoTexto: string | null;
  erro: string | null;
}

export function BlocoMetaAds({
  clientId,
  contas,
  podeVincular,
}: {
  clientId: string;
  contas: ContaNaTela[];
  podeVincular: boolean;
}) {
  const [estado, setEstado] = useState<MetaAdsState>({});
  const [pendente, comecar] = useTransition();
  const [abrirForm, setAbrirForm] = useState(false);

  function atualizar() {
    comecar(async () => setEstado(await atualizarSaldoAgora(clientId)));
  }

  function vincular(formData: FormData) {
    const conta = ((formData.get("metaAccountId") as string) ?? "").trim();
    const prePago = formData.get("isPrepay") === "on";
    comecar(async () => {
      const r = await vincularContaAnuncios(clientId, conta, prePago);
      setEstado(r);
      if (r.ok) setAbrirForm(false);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium flex items-center gap-2">
            <Megaphone size={14} /> Meta Ads
          </p>
          <p className="text-xs text-foreground-muted mt-1">
            Saldo pré-pago (Pix) lido direto da conta de anúncio.
          </p>
        </div>
        {contas.length > 0 && (
          <button
            type="button"
            onClick={atualizar}
            disabled={pendente}
            className="self-start inline-flex items-center gap-1.5 px-3.5 py-2 border border-border rounded-lg text-sm hover:bg-surface-muted disabled:opacity-60"
          >
            <RefreshCw size={14} className={pendente ? "animate-spin" : ""} />
            {pendente ? "Buscando…" : "Atualizar agora"}
          </button>
        )}
      </div>

      {contas.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          Nenhuma conta de anúncio vinculada ainda.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {contas.map((c) => (
            <div key={c.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-mono truncate">{c.metaAccountId}</p>
                  <p className="text-xs text-foreground-muted mt-0.5">
                    {c.isPrepay ? "Pré-paga (Pix)" : "Cartão — sem saldo a acompanhar"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {c.isPrepay &&
                    (c.saldoTexto ? (
                      <p className="text-lg font-semibold leading-none">{c.saldoTexto}</p>
                    ) : (
                      // "indisponível" e não "R$ 0,00": saldo que o sistema não
                      // conseguiu ler não é saldo zerado, e confundir os dois
                      // faz alguém fazer um Pix que não precisava.
                      <p className="text-sm font-medium text-foreground-muted leading-none">
                        indisponível
                      </p>
                    ))}
                  {c.atualizadoTexto && (
                    <p className="text-xs text-foreground-muted mt-1">
                      atualizado {c.atualizadoTexto}
                    </p>
                  )}
                </div>
              </div>
              {c.erro && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-start gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>{c.erro}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {estado.erro && <p className="text-sm text-red-500">{estado.erro}</p>}
      {estado.ok && <p className="text-sm text-emerald-600 dark:text-emerald-400">{estado.ok}</p>}

      {contas.length > 0 && (
        <Link
          href={`/meta-ads/${clientId}`}
          className="self-start inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground"
        >
          <BarChart3 size={14} /> Ver campanhas: investido, leads e custo por lead
        </Link>
      )}

      {podeVincular &&
        (abrirForm ? (
          <form action={vincular} className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="metaAccountId" className="text-xs text-foreground-muted">
                ID da conta de anúncio
              </label>
              <input
                id="metaAccountId"
                name="metaAccountId"
                required
                autoComplete="off"
                placeholder="act_1234567890"
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono"
              />
              <p className="text-xs text-foreground-muted">
                No Gerenciador de Anúncios, começa com <span className="font-mono">act_</span> e
                tem só números depois.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isPrepay"
                defaultChecked
                className="w-4 h-4 rounded border-border"
              />
              Conta pré-paga (abastecida por Pix)
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pendente}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {pendente ? "Vinculando…" : "Vincular conta"}
              </button>
              <button
                type="button"
                onClick={() => setAbrirForm(false)}
                className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-surface-muted"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAbrirForm(true)}
            className="self-start inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground"
          >
            <Plus size={14} /> Vincular conta de anúncio
          </button>
        ))}
    </div>
  );
}
