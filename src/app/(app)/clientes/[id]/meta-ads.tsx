"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  Megaphone,
  RefreshCw,
  AlertTriangle,
  Plus,
  BarChart3,
  Sparkles,
  CreditCard,
  QrCode,
  Target,
} from "lucide-react";
import {
  vincularContaAnuncios,
  atualizarLojaAgora,
  definirFormaDePagamento,
  definirGastoMensal,
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
  gastoMensalTexto,
}: {
  clientId: string;
  contas: ContaNaTela[];
  podeVincular: boolean;
  /** O investimento mensal combinado, já escrito ("3.000,00"), ou "". */
  gastoMensalTexto: string;
}) {
  const [estado, setEstado] = useState<MetaAdsState>({});
  const [pendente, comecar] = useTransition();
  const [abrirForm, setAbrirForm] = useState(false);

  function atualizar() {
    comecar(async () => setEstado(await atualizarLojaAgora(clientId)));
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

  function trocarPagamento(contaId: string, prePago: boolean) {
    comecar(async () => setEstado(await definirFormaDePagamento(clientId, contaId, prePago)));
  }

  function salvarGasto(formData: FormData) {
    const valor = (formData.get("gastoMensal") as string) ?? "";
    comecar(async () => setEstado(await definirGastoMensal(clientId, valor)));
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
          {podeVincular && (
            <>
              {" "}
              <Link href="/meta-ads/vincular" className="text-accent hover:underline">
                Ver as contas disponíveis na Meta
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {contas.map((c) => (
            <div key={c.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-mono truncate">{c.metaAccountId}</p>
                  {podeVincular ? (
                    /* A forma de pagamento é um botão, não um rótulo.
                       Marcar Pix como cartão é um clique errado fácil de dar,
                       e o estrago é silencioso: a conta sai de toda a
                       vigilância de saldo e um dia simplesmente para. Antes,
                       consertar isso pedia desvincular e vincular de novo —
                       perdendo o histórico. */
                    <div className="mt-1.5 inline-flex rounded-lg border border-border overflow-hidden">
                      <BotaoForma
                        ativo={c.isPrepay}
                        icone={QrCode}
                        texto="Pix"
                        onClick={() => trocarPagamento(c.id, true)}
                        pendente={pendente}
                      />
                      <BotaoForma
                        ativo={!c.isPrepay}
                        icone={CreditCard}
                        texto="Cartão"
                        onClick={() => trocarPagamento(c.id, false)}
                        pendente={pendente}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-foreground-muted mt-0.5">
                      {c.isPrepay ? "Pré-paga (Pix)" : "Cartão — sem saldo a acompanhar"}
                    </p>
                  )}
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

      {/* Quanto a loja investe por mês.
          Não é enfeite de cadastro: é a régua do aviso de saldo acabando.
          R$ 100 é uma semana pra quem gasta R$ 300 no mês e é meio dia pra
          quem gasta R$ 6.000 — sem referência, nenhum aviso de saldo faz
          sentido, e era por isso que o alerta antigo (valor fixo) gritava na
          loja errada. */}
      <div className="border-t border-border pt-4">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium flex items-center gap-2">
          <Target size={13} /> Investimento mensal combinado
        </p>
        {podeVincular ? (
          <form action={salvarGasto} className="mt-2 flex flex-wrap items-center gap-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">
                R$
              </span>
              <input
                name="gastoMensal"
                defaultValue={gastoMensalTexto}
                inputMode="decimal"
                autoComplete="off"
                placeholder="3.000,00"
                className="w-40 pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm tabular-nums"
              />
            </div>
            <button
              type="submit"
              disabled={pendente}
              className="px-3.5 py-2 border border-border rounded-lg text-sm hover:bg-surface-muted disabled:opacity-60"
            >
              Salvar
            </button>
          </form>
        ) : (
          <p className="text-sm mt-1.5 tabular-nums">
            {gastoMensalTexto ? `R$ ${gastoMensalTexto}` : "não definido"}
          </p>
        )}
        <p className="text-xs text-foreground-muted mt-2 max-w-prose">
          Serve pra dizer se o saldo está acabando. Quando a loja já tem gasto de verdade nos
          últimos dias, a conta usa o gasto <strong>real</strong> — este número entra quando a loja
          é nova ou ficou parada. Deixe em branco se não houver combinado.
        </p>
      </div>

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
            {/* O caminho bom vem PRIMEIRO.
                Este formulário pede um número que quase ninguém sabe de cor —
                é preciso caçar no Gerenciador. A tela de vincular pergunta à
                Meta e traz a lista pronta. Deixar só o campo aqui, como estava,
                era mandar a pessoa procurar o que o sistema já sabe. */}
            <Link
              href="/meta-ads/vincular"
              className="flex items-start gap-2.5 rounded-xl border border-accent/40 bg-accent/5 px-3.5 py-3 hover:bg-accent/10 transition-colors"
            >
              <Sparkles size={15} className="text-accent shrink-0 mt-0.5" />
              <span className="text-sm">
                <span className="font-medium block">Não sabe o ID? Deixa comigo.</span>
                <span className="text-xs text-foreground-muted">
                  A tela de vincular pergunta à Meta quais contas temos acesso e já sugere a loja
                  de cada uma.
                </span>
              </span>
            </Link>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="metaAccountId" className="text-xs text-foreground-muted">
                Ou digite o ID da conta, se você já tem
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
                No Gerenciador de Anúncios ele está na URL (<span className="font-mono">?act=…</span>)
                e embaixo do nome da conta. Começa com <span className="font-mono">act_</span> e
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

/** Um lado do par Pix/Cartão. O lado aceso é o que a conta é hoje. */
function BotaoForma({
  ativo,
  icone: Icone,
  texto,
  onClick,
  pendente,
}: {
  ativo: boolean;
  icone: typeof QrCode;
  texto: string;
  onClick: () => void;
  pendente: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // O lado aceso não é clicável: clicar nele não faria nada e o cursor de
      // mão prometeria que faria.
      disabled={pendente || ativo}
      aria-pressed={ativo}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
        ativo
          ? "bg-accent text-accent-foreground"
          : "text-foreground-muted hover:bg-surface-muted disabled:opacity-60"
      }`}
    >
      <Icone size={12} /> {texto}
    </button>
  );
}
