"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FileBarChart, Check, Undo2, ExternalLink } from "lucide-react";
import {
  marcarRelatorioEnviado,
  desmarcarRelatorioEnviado,
} from "@/lib/actions/relatorio-semanal";

// Os relatórios da semana, no Meu Dia.
//
// ── Por que aqui, e não só na tela de Relatório ───────────────────────────
//
// Porque a tela de Relatório é um lugar onde se vai; o Meu Dia é a tela que
// abre. "O relatório está pronto lá" só funciona pra quem lembra de ir —
// e lembrar é exatamente a parte que falha. Nas palavras do Guilherme:
// "ngm pode esquecer".
//
// ── Por que ele não some na terça ─────────────────────────────────────────
//
// O bloco aparece na segunda e FICA até a última loja ser marcada, mesmo que
// isso leve a semana inteira. Sumir na terça-feira seria transformar o
// esquecimento em silêncio — que é o defeito que ele existe pra corrigir.
//
// A partir de quarta ele muda de cor: o que estava pendente passa a estar
// atrasado, e a tela precisa dizer isso sem ninguém ter que contar os dias.
//
// ── Por que marcar à mão, se o relatório é automático ─────────────────────
//
// Porque o que é automático é a IMAGEM, não o envio. Enquanto o WhatsApp não
// estiver ligado, quem manda é gente — e o sistema não pode fingir que sabe
// de uma coisa que não viu acontecer. No dia em que o envio for do sistema,
// esta marcação passa a ser feita por ele, e a tela não muda.

export interface LojaDoRelatorio {
  id: string;
  nome: string;
  enviado: boolean;
}

export function BlocoRelatorios({
  lojas,
  diaDaSemana,
}: {
  lojas: LojaDoRelatorio[];
  /** 1 = segunda. Vem do servidor, no fuso da casa. */
  diaDaSemana: number;
}) {
  // Carteira sem loja com conta de anúncio não ganha bloco nenhum.
  if (lojas.length === 0) return null;

  const faltam = lojas.filter((l) => !l.enviado);
  const atrasado = diaDaSemana >= 3 && faltam.length > 0;

  return (
    <div
      className={`rounded-2xl border bg-surface p-4 flex flex-col gap-3 ${
        atrasado ? "border-red-500" : "border-border-forte"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium flex items-center gap-2">
          <FileBarChart size={14} className={atrasado ? "text-red-500" : "text-accent"} />
          Relatórios da semana
        </p>
        <p
          className={`text-xs font-medium ${
            faltam.length === 0
              ? "text-emerald-600 dark:text-emerald-400"
              : atrasado
                ? "text-red-600 dark:text-red-400"
                : "text-foreground-muted"
          }`}
        >
          {faltam.length === 0
            ? "todos enviados"
            : `${lojas.length - faltam.length} de ${lojas.length}`}
        </p>
      </div>

      {atrasado && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {faltam.length === 1
            ? "Uma loja ainda não recebeu o relatório desta semana."
            : `${faltam.length} lojas ainda não receberam o relatório desta semana.`}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-border">
        {lojas.map((l) => (
          <Linha key={l.id} loja={l} />
        ))}
      </ul>
    </div>
  );
}

function Linha({ loja }: { loja: LojaDoRelatorio }) {
  const [pendendo, iniciar] = useTransition();
  // Otimista: o clique marca na hora e volta atrás se o servidor recusar.
  // Quem está mandando quarenta relatórios não pode esperar a rede a cada um.
  const [enviado, setEnviado] = useState(loja.enviado);

  const alternar = () => {
    const antes = enviado;
    setEnviado(!antes);
    iniciar(async () => {
      const r = antes
        ? await desmarcarRelatorioEnviado(loja.id)
        : await marcarRelatorioEnviado(loja.id);
      if (r?.erro) setEnviado(antes);
    });
  };

  return (
    <li className="flex items-center gap-2 py-1.5">
      {/* Abrir o relatório é a ação principal, então é ela que ocupa a linha
          inteira. Marcar é o que vem DEPOIS de mandar, e fica no canto. */}
      <Link
        href={`/meta-ads/relatorio?loja=${loja.id}&periodo=7d`}
        className={`flex-1 min-w-0 flex items-center gap-2 min-h-11 text-sm ${
          enviado ? "text-foreground-muted line-through" : "font-medium"
        }`}
      >
        <span className="truncate">{loja.nome}</span>
        {!enviado && <ExternalLink size={13} className="text-foreground-muted shrink-0" />}
      </Link>

      <button
        type="button"
        onClick={alternar}
        disabled={pendendo}
        // 44px de alvo: esta tela é usada de pé, com o telefone na mão.
        className={`shrink-0 inline-flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-xs font-medium border disabled:opacity-50 ${
          enviado
            ? "border-border text-foreground-muted hover:bg-surface-muted"
            : "border-emerald-500/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
        }`}
      >
        {enviado ? (
          <>
            <Undo2 size={13} /> Desfazer
          </>
        ) : (
          <>
            <Check size={13} /> Enviei
          </>
        )}
      </button>
    </li>
  );
}
