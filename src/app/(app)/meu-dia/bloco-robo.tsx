import Link from "next/link";
import { Bot, AlertTriangle, MessageSquareQuote } from "lucide-react";
import type { OQueORoboFez, AcaoDoRobo } from "@/lib/meta/o-que-o-robo-fez";

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
              ? "O robô tirou 1 carro do ar hoje"
              : `O robô tirou ${feitos.length} carros do ar hoje`}
          </p>
          <ul className="flex flex-col gap-2">
            {feitos.map((a) => (
              <Linha key={a.id} acao={a} />
            ))}
          </ul>
          <p className="text-xs text-foreground-muted">
            Pedido no grupo da loja. Se algum estiver errado, é só religar na
            tela da loja — o anúncio foi pausado, não apagado.
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
          {acao.quando.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          })}
        </span>
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
