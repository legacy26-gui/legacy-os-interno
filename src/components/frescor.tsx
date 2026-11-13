"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { tempoDesde } from "@/lib/meta/saldo";

// A idade do número, dita na cara da tela.
//
// ── O que isto acrescenta ao que já havia ─────────────────────────────────
//
// A lista do Meta Ads já tinha a coluna LIDO, com a idade de cada linha. Ela
// continua, e é ela que responde "e ESTA loja, de quando é?".
//
// O que faltava era a pergunta de cima: "posso confiar nesta tela inteira?".
// Quarenta e duas linhas com quarenta e duas idades não respondem isso — pra
// saber se alguma está velha é preciso varrer a coluna com o olho, e ninguém
// varre. Uma linha só, no cabeçalho, com a idade da PIOR delas, responde.
//
// Velho e avisado é informação ("esse dado é de ontem, vou atualizar"). Velho
// e calado é armadilha: alguém decide não mandar Pix porque "tem saldo", e o
// saldo acabou às onze da manhã.
//
// O robô agora passa de quinze em quinze minutos, então na prática isto vai
// dizer "há 3 min" quase sempre. Justamente por isso precisa existir: no dia
// em que a varredura parar — token vencido, Meta fora do ar, conta suspensa —
// a tela continuaria mostrando os mesmos números bonitos. O que denuncia a
// parada é este rótulo envelhecendo e mudando de cor.
//
// ── Por que o MAIS VELHO, e não o mais novo ───────────────────────────────
//
// Numa lista de 42 lojas há 42 idades diferentes. Mostrar a mais nova seria
// propaganda: bastaria uma loja recém-lida pra tela dizer "há 1 min" com
// quarenta e uma lojas de ontem atrás. Mostrar a mais velha é promessa:
// "nada aqui é mais antigo do que isto".
//
// ── Por que ele também recarrega a tela ───────────────────────────────────
//
// Porque rótulo que envelhece sozinho numa tela parada é meia verdade. Se a
// aba fica aberta a tarde inteira — e fica, é a tela que o gestor deixa num
// monitor —, o robô atualiza o banco e a tela não fica sabendo. Então o
// mesmo componente que conta o tempo também vai buscar o dado novo.
//
// Só quando a aba está visível: recarregar em aba de fundo é gastar banco e
// bateria pra ninguém ver. Ao voltar pra aba, recarrega na hora — é o momento
// exato em que a pessoa vai olhar o número.

/** De quanto em quanto tempo o texto é redesenhado ("há 2 min" → "há 3 min"). */
const RELOGIO_MS = 30_000;

/** De quanto em quanto tempo a tela vai buscar dado novo no servidor. */
const RECARGA_MS = 60_000;

/**
 * A partir de quando a idade deixa de ser normal.
 *
 * O robô passa de 15 em 15 minutos, então 40 minutos já significa que ele
 * perdeu duas voltas — não é demora, é defeito. E a partir de três horas não
 * há mais o que supor: parou.
 */
const MINUTOS_ESTRANHO = 40;
const MINUTOS_PARADO = 180;

export function Frescor({ quando }: { quando: string | null }) {
  const router = useRouter();
  const [recarregando, iniciar] = useTransition();
  // Guardado em estado só pra forçar o redesenho a cada volta do relógio.
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), RELOGIO_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const visivel = () => document.visibilityState === "visible";
    // Dentro de uma transição: assim o React sabe que é atualização de fundo,
    // mantém a tela atual no lugar enquanto busca (nada de pisca-pisca) e
    // acende o `recarregando` que faz o ícone girar.
    const buscar = () => {
      if (visivel()) iniciar(() => router.refresh());
    };

    const t = setInterval(buscar, RECARGA_MS);
    // Ao voltar pra aba, não espera o próximo intervalo: é agora que a pessoa
    // está olhando.
    document.addEventListener("visibilitychange", buscar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", buscar);
    };
  }, [router, iniciar]);

  if (!quando) {
    return (
      <span className="text-xs text-foreground-muted">Nunca atualizado</span>
    );
  }

  const data = new Date(quando);
  const minutos = Math.floor((agora - data.getTime()) / 60_000);

  const cor =
    minutos >= MINUTOS_PARADO
      ? "text-red-600 dark:text-red-400"
      : minutos >= MINUTOS_ESTRANHO
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground-muted";

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${cor}`}
      // O servidor e o navegador têm relógios ligeiramente diferentes, então
      // o texto pode nascer "há 2 min" num e "há 3 min" no outro. É diferença
      // sem consequência, e avisar sobre ela no console só esconderia
      // divergências de verdade.
      suppressHydrationWarning
      title={`Buscado na Meta em ${data.toLocaleString("pt-BR")}`}
    >
      <RefreshCw
        size={12}
        className={recarregando ? "animate-spin" : undefined}
        aria-hidden
      />
      {/* "Tudo" porque o número é o do mais velho da lista: é uma garantia
          sobre o conjunto, não sobre uma loja. */}
      Tudo atualizado {tempoDesde(data, new Date(agora))}
    </span>
  );
}
