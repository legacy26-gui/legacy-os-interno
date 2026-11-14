"use client";

import { useState, useTransition, useMemo } from "react";
import { Copy, Check, X, Send, MessageCircle, Pencil } from "lucide-react";
import { marcarVerbaEnviada, type MetaAdsState } from "@/lib/actions/meta-ads";
import {
  quantoPedirCents,
  diasQueCompra,
  textoDaCobranca,
  DIAS_DA_COBRANCA,
} from "@/lib/meta/cobranca-de-verba";
import { saldoEmReais } from "@/lib/meta/saldo";

// A janela que monta a cobrança de verba.
//
// ── Por que o valor é editável, e vem preenchido ──────────────────────────
//
// Porque o sistema sabe o ritmo da loja, mas não sabe o mês do cliente. Ele
// chuta bem — sete dias no gasto real dos últimos quatorze — e às vezes o
// gestor sabe de algo que o número não conta: feirão no fim de semana, loja
// de férias, cliente que só põe de quinhentos em quinhentos.
//
// Campo vazio obrigaria a fazer a conta de cabeça toda vez, que é exatamente
// o trabalho que isto existe pra tirar. Campo travado faria o gestor ignorar
// a tela e mandar pelo WhatsApp dele. Preenchido e editável resolve os dois.
//
// ── Por que copiar e marcar são o MESMO botão ─────────────────────────────
//
// Porque marcar é a parte que não tem recompensa imediata: o gestor copia,
// vai pro WhatsApp, manda, e aí teria que VOLTAR aqui pra clicar "marquei".
// Ninguém volta. E sem a marcação a loja segue vermelha, o alerta segue
// gritando, e em duas semanas o vermelho não quer dizer mais nada.
//
// Copiar É a prova de que a cobrança foi feita. Então copiar marca.

export function JanelaDeCobranca({
  clientId,
  loja,
  saldoCents,
  diasDeSaldo,
  gastoDiarioCents,
  link,
  aoFechar,
}: {
  clientId: string;
  loja: string;
  saldoCents: number | null;
  diasDeSaldo: number | null;
  gastoDiarioCents: number | null;
  link: string | null;
  aoFechar: () => void;
}) {
  const sugerido = quantoPedirCents(gastoDiarioCents, saldoCents);
  const [reais, setReais] = useState(() =>
    sugerido === null ? "" : (sugerido / 100).toFixed(2).replace(".", ",")
  );
  const [copiado, setCopiado] = useState(false);
  const [estado, setEstado] = useState<MetaAdsState>({});
  const [pendente, comecar] = useTransition();
  // Mexer na mensagem à mão: o gestor conhece o cliente, e às vezes a frase
  // certa é outra. Só aparece quando ele pede, pra não transformar uma ação
  // de dois cliques numa tela de redação.
  const [editando, setEditando] = useState(false);
  const [escrito, setEscrito] = useState<string | null>(null);

  const centavos = useMemo(() => {
    const limpo = reais.replace(/\./g, "").replace(",", ".").trim();
    const n = Number(limpo);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
  }, [reais]);

  const texto = useMemo(() => {
    if (escrito !== null) return escrito;
    if (centavos === null) return "";
    return textoDaCobranca({
      loja,
      saldoCents,
      diasDeSaldo,
      pedirCents: centavos,
      diasQueCompra: diasQueCompra(centavos, gastoDiarioCents, saldoCents),
      link,
    });
  }, [escrito, centavos, loja, saldoCents, diasDeSaldo, gastoDiarioCents, link]);

  async function copiarEMarcar() {
    if (!texto) return;
    let deu = false;
    try {
      await navigator.clipboard.writeText(texto);
      deu = true;
    } catch {
      // Navegador que recusa a área de transferência (acontece em http e em
      // aba sem foco). A mensagem continua na tela pra copiar na mão, então
      // não é erro fatal — mas não marca como cobrada, porque aí ninguém
      // garante que ela foi copiada.
      setEstado({ erro: "Não consegui copiar. Selecione o texto e copie na mão." });
      return;
    }
    if (deu) {
      setCopiado(true);
      comecar(async () => {
        const r = await marcarVerbaEnviada(clientId);
        setEstado(r);
      });
    }
  }

  const semRitmo = gastoDiarioCents === null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/50 cursor-default"
        onClick={aoFechar}
      />
      <div
        role="dialog"
        aria-label={`Cobrar verba de ${loja}`}
        className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl
          border border-border-forte bg-surface shadow-2xl p-5 flex flex-col gap-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Cobrar verba</h2>
            <p className="text-sm text-foreground-muted">{loja}</p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-muted"
          >
            <X size={18} />
          </button>
        </div>

        {/* O estado da conta, em uma linha. É o que justifica o valor. */}
        <p className="text-sm text-foreground-muted">
          {saldoCents === null ? (
            <>Saldo não lido nesta conta.</>
          ) : (
            <>
              Hoje tem <strong className="text-foreground">{saldoEmReais(saldoCents)}</strong>
              {diasDeSaldo !== null && (
                <> — {diasDeSaldo < 1 ? "nem fecha o dia" : `dura ${diasDeSaldo} dia${diasDeSaldo === 1 ? "" : "s"}`}</>
              )}
              .
            </>
          )}
          {gastoDiarioCents !== null && (
            <> Gasta {saldoEmReais(gastoDiarioCents)} por dia.</>
          )}
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-foreground-muted font-semibold">
            Quanto pedir
          </span>
          <div className="flex items-center gap-2">
            <span className="text-foreground-muted">R$</span>
            <input
              inputMode="decimal"
              value={reais}
              onChange={(e) => {
                setReais(e.target.value);
                // Mudou o valor: a mensagem escrita à mão não vale mais,
                // senão ela ficaria prometendo o número velho.
                setEscrito(null);
                setCopiado(false);
              }}
              placeholder={semRitmo ? "digite o valor" : "0,00"}
              className="flex-1 min-h-11 px-3 rounded-lg border border-border bg-surface-muted
                text-lg font-semibold tabular-nums focus:outline-none focus:border-accent"
            />
          </div>
          <span className="text-xs text-foreground-muted">
            {semRitmo
              ? "Sem gasto recente nem verba combinada, o sistema não tem como sugerir um valor."
              : sugerido === null
                ? `Essa conta já tem saldo pros próximos ${DIAS_DA_COBRANCA} dias.`
                : `Sugestão: ${DIAS_DA_COBRANCA} dias no ritmo atual, descontando o que já tem em conta.`}
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-foreground-muted font-semibold">
              Mensagem
            </span>
            {!editando && texto && (
              <button
                type="button"
                onClick={() => {
                  setEscrito(texto);
                  setEditando(true);
                }}
                className="text-xs text-foreground-muted hover:text-foreground inline-flex items-center gap-1"
              >
                <Pencil size={11} /> mexer no texto
              </button>
            )}
          </div>
          {texto ? (
            <textarea
              value={texto}
              readOnly={!editando}
              onChange={(e) => setEscrito(e.target.value)}
              rows={10}
              className={`w-full px-3 py-2.5 rounded-lg border border-border text-sm leading-relaxed
                resize-y focus:outline-none focus:border-accent ${
                  editando ? "bg-surface" : "bg-surface-muted"
                }`}
            />
          ) : (
            <p className="text-sm text-foreground-muted px-3 py-6 rounded-lg bg-surface-muted text-center">
              Digite o valor pra montar a mensagem.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={copiarEMarcar}
            disabled={!texto || pendente}
            className="inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg
              bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {copiado ? <Check size={16} /> : <Copy size={16} />}
            {pendente
              ? "Marcando…"
              : copiado
                ? "Copiada — é só colar no WhatsApp"
                : "Copiar e marcar como cobrada"}
          </button>

          {/* O envio automático ainda não existe. O botão fica à vista,
              apagado e dizendo por quê — é mais honesto que esconder, e
              lembra que falta ligar a Z-API. */}
          <button
            type="button"
            disabled
            title="Precisa da Z-API ligada e do WhatsApp do cliente cadastrado"
            className="inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg
              border border-border text-foreground-muted text-sm disabled:opacity-60"
          >
            <MessageCircle size={15} /> Mandar sozinho no WhatsApp — ainda não ligado
          </button>
        </div>

        {estado.erro && <p className="text-sm text-red-500">{estado.erro}</p>}
        {estado.ok && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-start gap-1.5">
            <Send size={14} className="shrink-0 mt-0.5" />
            <span>{estado.ok}</span>
          </p>
        )}
      </div>
    </div>
  );
}
