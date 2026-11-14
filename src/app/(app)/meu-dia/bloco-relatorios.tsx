"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  FileBarChart,
  Check,
  Undo2,
  ExternalLink,
  Send,
  Loader2,
} from "lucide-react";
import {
  marcarRelatorioEnviado,
  desmarcarRelatorioEnviado,
  enviarRelatorioPeloWhatsapp,
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
  /** Tem grupo de WhatsApp cadastrado na ficha. */
  temGrupo: boolean;
}

export function BlocoRelatorios({
  lojas,
  diaDaSemana,
  zapiLigado,
}: {
  lojas: LojaDoRelatorio[];
  /** 1 = segunda. Vem do servidor, no fuso da casa. */
  diaDaSemana: number;
  /** O WhatsApp está configurado no sistema. */
  zapiLigado: boolean;
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
          <FileBarChart
            size={14}
            className={atrasado ? "text-red-500" : "text-accent"}
          />
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
          <Linha key={l.id} loja={l} zapiLigado={zapiLigado} />
        ))}
      </ul>

      {/* Quantas ainda dependem de alguém abrir o WhatsApp.
          Dito aqui e não escondido na ficha: enquanto faltar grupo, o
          "automático" é meia verdade, e a tela não deve fingir o contrário. */}
      {zapiLigado && lojas.some((l) => !l.temGrupo) && (
        <p className="text-xs text-foreground-muted">
          {lojas.filter((l) => !l.temGrupo).length} sem grupo cadastrado — essas
          vão na mão. O grupo se cadastra na ficha da loja.
        </p>
      )}
    </div>
  );
}

function Linha({
  loja,
  zapiLigado,
}: {
  loja: LojaDoRelatorio;
  zapiLigado: boolean;
}) {
  const [pendendo, iniciar] = useTransition();
  const [mandando, comecarEnvio] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
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

  const mandar = () => {
    setErro(null);
    comecarEnvio(async () => {
      const r = await enviarRelatorioPeloWhatsapp(loja.id);
      // Só marca na tela se o servidor disse que saiu. A ação já grava o
      // "enviado" no banco — aqui é só não mentir enquanto a página não
      // recarrega.
      if (r?.erro) setErro(r.erro);
      else setEnviado(true);
    });
  };

  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5">
      {/* Abrir o relatório é a ação principal, então é ela que ocupa a linha
          inteira. Marcar é o que vem DEPOIS de mandar, e fica no canto. */}
      <Link
        href={`/meta-ads/relatorio?loja=${loja.id}&periodo=7d`}
        className={`flex-1 min-w-0 flex items-center gap-2 min-h-11 text-sm ${
          enviado ? "text-foreground-muted line-through" : "font-medium"
        }`}
      >
        <span className="truncate">{loja.nome}</span>
        {!enviado && (
          <ExternalLink size={13} className="text-foreground-muted shrink-0" />
        )}
      </Link>

      {/* Mandar pelo sistema é o caminho principal quando existe grupo. O
          "Enviei" continua ao lado porque nem toda loja tem grupo, e porque
          alguém pode ter mandado por fora. */}
      {zapiLigado && loja.temGrupo && !enviado && (
        <button
          type="button"
          onClick={mandar}
          disabled={mandando}
          className="shrink-0 inline-flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-xs font-medium bg-accent text-white hover:opacity-90 disabled:opacity-50"
        >
          {mandando ? (
            <>
              <Loader2 size={13} className="animate-spin" /> Mandando
            </>
          ) : (
            <>
              <Send size={13} /> Mandar no grupo
            </>
          )}
        </button>
      )}

      <button
        type="button"
        onClick={alternar}
        disabled={pendendo || mandando}
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

      {/* O erro fica na linha da loja, não num aviso geral: com quarenta
          lojas, "algo deu errado" no topo não diz em qual. */}
      {erro && (
        <p className="basis-full text-xs text-red-600 dark:text-red-400">
          {erro}
        </p>
      )}
    </li>
  );
}
