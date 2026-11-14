"use client";

import { useTransition, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { definirTipoDeLead } from "@/lib/actions/meta-ads";

// "Esta conta está contando a coisa errada."
//
// ── Por que isto precisa ser um aviso, e não uma opção escondida ─────────
//
// Porque o sintoma é zero, e zero é um número plausível. Uma loja que vende
// pelo site ficou configurada como "conversa iniciada no WhatsApp": a Meta
// devolvia as compras todo dia, o sistema procurava conversas, não achava
// nenhuma, e escrevia 0. Ninguém desconfia de um zero — desconfia-se de
// erro, e não havia erro nenhum.
//
// Agora a varredura guarda TODAS as ações que a Meta devolveu, somadas por
// tipo. Quando o tipo configurado não apareceu nenhuma vez e outro apareceu
// muitas, o sistema diz isso com o número na frente e oferece a troca num
// clique. Não troca sozinho: qual resultado importa é decisão de negócio, e
// a Meta devolve ação demais pra chutar.

export function TipoErrado({
  clientId,
  contaId,
  nomeDaConta,
  configurado,
  sugerido,
  rotuloSugerido,
  quantas,
  periodo,
}: {
  clientId: string;
  contaId: string;
  nomeDaConta: string;
  configurado: string;
  sugerido: string;
  rotuloSugerido: string;
  quantas: number;
  periodo: string;
}) {
  const [pendente, comecar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  if (pronto) {
    return (
      <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-3">
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          Pronto: {nomeDaConta} passa a contar <strong>{rotuloSugerido}</strong>
          . Os dias já gravados continuam com a contagem antiga até a próxima
          busca — use o <strong>Atualizar agora</strong> aí em cima pra refazer.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 flex flex-col gap-2">
      <p className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
        <AlertTriangle size={15} className="shrink-0 mt-0.5" />
        <span>
          <strong>{nomeDaConta} pode estar contando a coisa errada.</strong> No
          período de {periodo} a Meta devolveu{" "}
          <strong>{quantas.toLocaleString("pt-BR")}</strong> de{" "}
          <strong>{rotuloSugerido}</strong> e <strong>nenhum</strong> de{" "}
          {configurado}, que é o que está configurado aqui. Por isso o resultado
          aparece zerado.
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pendente}
          onClick={() => {
            setErro(null);
            comecar(async () => {
              const r = await definirTipoDeLead(clientId, contaId, sugerido);
              if (r?.erro) setErro(r.erro);
              else setPronto(true);
            });
          }}
          className="inline-flex items-center gap-1.5 px-3 min-h-10 rounded-lg bg-amber-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pendente ? "Trocando…" : "Contar "}
          {!pendente && (
            <>
              <ArrowRight size={13} /> {rotuloSugerido}
            </>
          )}
        </button>
        <span className="text-xs text-foreground-muted">
          Ou escolha outro em <strong>Ajustes da conta</strong>.
        </span>
      </div>
      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
