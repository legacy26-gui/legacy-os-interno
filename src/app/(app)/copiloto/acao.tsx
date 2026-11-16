"use client";

import { useState, useTransition } from "react";
import { PauseCircle, Wallet, Check, X, AlertTriangle } from "lucide-react";
import { acaoEmLoteNaMeta, definirVerba } from "@/lib/actions/meta-ads";
import type { AcaoSugerida } from "@/lib/copiloto/tipos";

// O que o Copiloto SUGERIU, e o botão que executa.
//
// ── Por que dois cliques, e não um ───────────────────────────────────────
//
// O primeiro clique diz "quero fazer isso". O segundo confirma, com a frase
// que o servidor devolveu — o nome exato do que vai ser mexido, o valor de
// antes e o de depois.
//
// Não é cerimônia. O modelo sugere em cima de números certos, mas a leitura
// que ele faz deles é opinião: "este anúncio gastou R$ 300 sem resultado"
// pode ser um criativo ruim ou uma campanha ligada ontem que ainda não
// aprendeu. Quem sabe disso é o gestor, e a diferença entre uma ferramenta
// que ajuda e uma que atrapalha é exatamente este clique.
//
// ── Quem executa é a MESMA função da tela do Meta Ads ────────────────────
//
// `acaoEmLoteNaMeta` e `definirVerba`, as mesmas do Gerenciador interno.
// Elas já conferem acesso, carteira, formato e pedem confirmação quando o
// valor é estranho. O Copiloto não ganhou um caminho próprio pra mexer na
// Meta — ele só aponta pro caminho que já existia, e que já é auditado.

export function CartaoDaAcao({ acao }: { acao: AcaoSugerida }) {
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recusado, setRecusado] = useState(false);
  const [pendente, comecar] = useTransition();

  const ehPausar = acao.tipo === "pausar_anuncio";
  const Icone = ehPausar ? PauseCircle : Wallet;

  function executar(confirmado: boolean) {
    setErro(null);
    comecar(async () => {
      const r = ehPausar
        ? await acaoEmLoteNaMeta(
            acao.clientId,
            "anuncio",
            [acao.objetoId],
            "desligar",
            confirmado,
          )
        : await definirVerba(
            acao.clientId,
            "conjunto",
            acao.objetoId,
            String(acao.valorReais ?? 0).replace(".", ","),
            confirmado,
          );

      if (r?.precisaConfirmar) {
        setConfirmar(r.precisaConfirmar);
        return;
      }
      if (r?.erro) {
        setErro(r.erro);
        setConfirmar(null);
        return;
      }
      setFeito(r?.ok ?? "Pronto.");
      setConfirmar(null);
    });
  }

  if (recusado) {
    return (
      <p className="text-xs text-foreground-muted px-1">
        Sugestão descartada: {acao.nome}.
      </p>
    );
  }

  if (feito) {
    return (
      <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3.5 py-2.5">
        <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-start gap-2">
          <Check size={15} className="shrink-0 mt-0.5" />
          <span>{feito}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border-forte bg-surface-muted px-3.5 py-3 flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <Icone size={15} className="text-accent shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-sm font-medium">
            {ehPausar
              ? `Pausar ${acao.nome}`
              : `Mudar a verba de ${acao.nome} para R$ ${(acao.valorReais ?? 0)
                  .toFixed(2)
                  .replace(".", ",")}`}
          </p>
          <p className="text-xs text-foreground-muted">
            {acao.loja} · {acao.porQue}
          </p>
        </div>
      </div>

      {confirmar && (
        <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          {confirmar}
        </p>
      )}

      {erro && (
        <p className="text-xs text-red-500 flex items-start gap-1.5">
          <X size={13} className="shrink-0 mt-0.5" />
          {erro}
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          disabled={pendente}
          onClick={() => executar(confirmar !== null)}
          className={`inline-flex items-center gap-1.5 min-h-10 px-3.5 rounded-lg text-xs font-medium
            disabled:opacity-50 ${
              confirmar
                ? "bg-amber-600 text-white hover:opacity-90"
                : "bg-accent text-white hover:opacity-90"
            }`}
        >
          <Check size={13} />
          {pendente
            ? "Fazendo…"
            : confirmar
              ? "Confirmar mesmo assim"
              : ehPausar
                ? "Pausar na Meta"
                : "Mudar a verba"}
        </button>
        <button
          type="button"
          disabled={pendente}
          onClick={() => setRecusado(true)}
          className="inline-flex items-center gap-1.5 min-h-10 px-3.5 rounded-lg text-xs
            border border-border text-foreground-muted hover:text-foreground disabled:opacity-50"
        >
          <X size={13} /> Agora não
        </button>
      </div>
    </div>
  );
}
