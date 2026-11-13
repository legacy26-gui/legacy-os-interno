"use client";

import { useState, useTransition } from "react";
import { RefreshCw, SlidersHorizontal, QrCode, CreditCard } from "lucide-react";
import {
  atualizarLojaAgora,
  definirTipoDeLead,
  definirFormaDePagamento,
  type MetaAdsState,
} from "@/lib/actions/meta-ads";
import { TIPOS_DE_LEAD } from "@/lib/meta/insights";

interface ContaConfig {
  id: string;
  metaAccountId: string;
  leadActionType: string;
  isPrepay: boolean;
}

/**
 * Os botões da tela da loja.
 *
 * UM botão de atualizar, não dois. Tinha separado saldo e números achando que
 * economizava chamada; o que isso economiza é uma chamada e o que custa é a
 * pessoa apertar um, não apertar o outro e ler meia tela velha achando que é
 * nova. Uma loja são duas chamadas de rede: não vale a pena.
 */
export function AcoesDaLoja({
  clientId,
  contas,
  podeConfigurar,
}: {
  clientId: string;
  contas: ContaConfig[];
  podeConfigurar: boolean;
}) {
  const [estado, setEstado] = useState<MetaAdsState>({});
  const [pendente, comecar] = useTransition();
  const [abrirConfig, setAbrirConfig] = useState(false);

  return (
    <div className="flex flex-col items-start sm:items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pendente}
          onClick={() => comecar(async () => setEstado(await atualizarLojaAgora(clientId)))}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-muted disabled:opacity-60"
        >
          <RefreshCw size={14} className={pendente ? "animate-spin" : ""} />
          {pendente ? "Buscando…" : "Atualizar agora"}
        </button>
        {podeConfigurar && contas.length > 0 && (
          <button
            type="button"
            onClick={() => setAbrirConfig((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-border rounded-lg text-sm text-foreground-muted hover:text-foreground hover:bg-surface-muted"
          >
            <SlidersHorizontal size={14} /> Ajustes da conta
          </button>
        )}
      </div>

      {estado.erro && <p className="text-xs text-red-500 max-w-md sm:text-right">{estado.erro}</p>}
      {estado.ok && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 max-w-md sm:text-right">
          {estado.ok}
        </p>
      )}

      {abrirConfig && podeConfigurar && (
        /* Os dois ajustes que se faz numa conta já vinculada moram juntos.
           A forma de pagamento estava só na ficha do cliente, e da tela do
           Meta Ads não havia caminho até lá — ou seja, estava onde ninguém
           ia procurar. Ajuste de conta se faz olhando a conta. */
        <div className="w-full sm:w-[26rem] rounded-xl border border-border bg-surface p-4 flex flex-col gap-5 text-left">
          {contas.map((c) => (
            <div key={c.id} className="flex flex-col gap-3">
              <p className="text-xs font-mono text-foreground-muted">{c.metaAccountId}</p>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">Como esta conta é paga</span>
                <div className="inline-flex self-start rounded-lg border border-border overflow-hidden">
                  <BotaoForma
                    ativo={c.isPrepay}
                    icone={QrCode}
                    texto="Pix (pré-paga)"
                    pendente={pendente}
                    onClick={() =>
                      comecar(async () =>
                        setEstado(await definirFormaDePagamento(clientId, c.id, true))
                      )
                    }
                  />
                  <BotaoForma
                    ativo={!c.isPrepay}
                    icone={CreditCard}
                    texto="Cartão"
                    pendente={pendente}
                    onClick={() =>
                      comecar(async () =>
                        setEstado(await definirFormaDePagamento(clientId, c.id, false))
                      )
                    }
                  />
                </div>
                <span className="text-xs text-foreground-muted">
                  Só conta de Pix tem saldo a acompanhar. No cartão o número que a Meta devolve é
                  limite de crédito, que é outra conversa.
                </span>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">O que conta como lead</span>
                <select
                  defaultValue={c.leadActionType}
                  disabled={pendente}
                  onChange={(e) =>
                    comecar(async () =>
                      setEstado(await definirTipoDeLead(clientId, c.id, e.target.value))
                    )
                  }
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
                >
                  {TIPOS_DE_LEAD.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-foreground-muted">
                  Trocar não reescreve o que já está gravado — aperte “Atualizar agora” depois pra
                  recontar os 30 dias.
                </span>
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "cartão" com um botão de trocar, dentro do próprio cartão de Saldo.
 *
 * A troca já existia em "Ajustes da conta" e na ficha do cliente, e mesmo
 * assim o Guilherme não achou — porque quando se quer corrigir isso, o que se
 * está olhando é a palavra "cartão" no lugar do saldo. O controle tem que
 * estar embaixo da palavra errada, não a dois cliques dela.
 */
export function TrocarPraPix({ clientId, contaIds }: { clientId: string; contaIds: string[] }) {
  const [pendente, comecar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function trocar() {
    comecar(async () => {
      setErro(null);
      // Uma por uma: loja com duas contas no cartão troca as duas, e se uma
      // falhar as outras já trocaram em vez de tudo voltar atrás.
      for (const id of contaIds) {
        const r = await definirFormaDePagamento(clientId, id, true);
        if (r.erro) {
          setErro(r.erro);
          return;
        }
      }
    });
  }

  return (
    <>
      <p className="text-sm text-foreground-muted mt-1.5">cartão</p>
      <button
        type="button"
        onClick={trocar}
        disabled={pendente}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline disabled:opacity-60"
      >
        <QrCode size={12} /> {pendente ? "Trocando…" : "É Pix? Trocar"}
      </button>
      {erro && <p className="text-xs text-red-500 mt-1">{erro}</p>}
    </>
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
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
        ativo
          ? "bg-accent text-accent-foreground"
          : "text-foreground-muted hover:bg-surface-muted disabled:opacity-60"
      }`}
    >
      <Icone size={13} /> {texto}
    </button>
  );
}
