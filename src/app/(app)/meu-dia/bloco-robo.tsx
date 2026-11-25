import Link from "next/link";
import { Bot, AlertTriangle, MessageSquareQuote } from "lucide-react";
import type { OQueORoboFez, AcaoDoRobo } from "@/lib/meta/o-que-o-robo-fez";
import { Religar } from "./religar";

// O que o robô do WhatsApp fez, no Meu Dia.
//
// ── A ordem é de propósito: falha primeiro ───────────────────────────────
//
// Sucesso é notícia. Falha é trabalho: o robô tentou desligar, a Meta
// recusou, e agora a loja acha que o carro saiu do ar enquanto a verba
// continua saindo nele. Isso tem que estar em cima e vermelho.
//
// ── Por que a frase do cliente aparece ───────────────────────────────────
//
// Porque é o único jeito de conferir se o robô ENTENDEU. "Tirei o Onix LT do
// ar" parece certo até você ler que o cliente escreveu "vendeu o Onix Plus".
// Sem a frase do lado, a lista é um relatório de coisas que não dá pra
// auditar.

export function BlocoDoRobo({ oQueFez }: { oQueFez: OQueORoboFez }) {
  const { feitos, falhas } = oQueFez;
  if (feitos.length === 0 && falhas.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {falhas.length > 0 && (
        <section className="rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-3 flex flex-col gap-2">
          <p className="text-sm font-semibold text-red-500 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            {falhas.length === 1
              ? "O robô não conseguiu desligar 1 anúncio"
              : `O robô não conseguiu desligar ${falhas.length} anúncios`}
          </p>
          <p className="text-xs text-foreground-muted">
            A loja pediu e acha que saiu do ar. Enquanto não sair, a verba
            continua correndo num carro que já foi vendido.
          </p>
          <ul className="flex flex-col gap-2">
            {falhas.map((a) => (
              <Linha key={a.id} acao={a} />
            ))}
          </ul>
        </section>
      )}

      {feitos.length > 0 && (
        <section className="rounded-xl border border-border bg-surface px-4 py-3 flex flex-col gap-2">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Bot size={15} className="text-accent shrink-0" />
            {feitos.length === 1
              ? "O robô tirou 1 anúncio do ar (hoje e ontem)"
              : `O robô tirou ${feitos.length} anúncios do ar (hoje e ontem)`}
          </p>
          {/* Agrupado por PEDIDO (a mesma frase, na mesma loja): se o robô entendeu errado, religa o pedido inteiro de uma vez. */}
          {porPedido(feitos).map((g) => {
            const pendentes = g.acoes.filter((a) => !a.religado);
            return (
              <div key={g.chave} className="flex flex-col gap-1.5 border-t border-border/60 pt-2 first:border-0 first:pt-0">
                <ul className="flex flex-col gap-2">
                  {g.acoes.map((a) => (
                    <Linha key={a.id} acao={a} />
                  ))}
                </ul>
                {pendentes.length > 1 && (
                  <Religar
                    rotulo={`Religar os ${pendentes.length} deste pedido`}
                    itens={pendentes.map((a) => ({ clientId: a.clientId, nivel: a.nivel, objetoId: a.objetoId }))}
                  />
                )}
              </div>
            );
          })}
          <p className="text-xs text-foreground-muted">
            Pedido no grupo da loja. Se o robô entendeu errado, é só religar aqui — o anúncio foi pausado, não apagado.
          </p>
        </section>
      )}
    </div>
  );
}

function Linha({ acao }: { acao: AcaoDoRobo }) {
  return (
    <li className="text-sm flex flex-col gap-0.5">
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <Link
          href={`/meta-ads/${acao.clientId}?nivel=anuncio`}
          className="font-medium hover:text-accent"
        >
          {acao.loja}
        </Link>
        <span className="text-foreground-muted">·</span>
        <span>{acao.anuncio}</span>
        <span className="text-xs text-foreground-muted">
          {acao.quando.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          })}
        </span>
        {acao.ok &&
          (acao.religado ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">religado</span>
          ) : (
            <Religar rotulo="Religar" itens={[{ clientId: acao.clientId, nivel: acao.nivel, objetoId: acao.objetoId }]} />
          ))}
      </span>

      {acao.frase && (
        <span className="text-xs text-foreground-muted flex items-start gap-1.5">
          <MessageSquareQuote size={11} className="shrink-0 mt-0.5" />
          <span>
            &ldquo;{acao.frase}&rdquo;
            {acao.pedidoPor && <> — {acao.pedidoPor}</>}
          </span>
        </span>
      )}

      {acao.erro && (
        <span className="text-xs text-red-500">A Meta disse: {acao.erro}</span>
      )}
    </li>
  );
}

/** Agrupa as pausas pelo pedido que as causou (loja + frase + minuto). */
function porPedido(acoes: AcaoDoRobo[]) {
  const grupos = new Map<string, { chave: string; acoes: AcaoDoRobo[] }>();
  for (const a of acoes) {
    const chave = `${a.clientId}|${a.frase ?? ""}|${Math.floor(new Date(a.quando).getTime() / 120_000)}`;
    const g = grupos.get(chave) ?? { chave, acoes: [] };
    g.acoes.push(a);
    grupos.set(chave, g);
  }
  return [...grupos.values()];
}
