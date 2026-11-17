"use client";

import Link from "next/link";
import { useState, useTransition, useRef } from "react";
import {
  BarChart3,
  FileText,
  RefreshCw,
  Send,
  Undo2,
  Check,
  EyeOff,
  Eye,
  Unplug,
  AlertTriangle,
} from "lucide-react";
import {
  marcarVerbaEnviada,
  desmarcarVerbaEnviada,
  atualizarLojaAgora,
  definirForaDoMetaAds,
  desligarLojaDoMetaAds,
  type MetaAdsState,
} from "@/lib/actions/meta-ads";
import { FAIXA_DA_LOJA, type TomDaLoja } from "@/lib/meta/tons";

// A faixa colorida na beirada da linha, que puxa as ações da loja.
//
// ── Por que na faixa ──────────────────────────────────────────────────────
//
// Foi ideia do Guilherme e ela é boa: a faixa já é o lugar pra onde o olho
// vai quando ele varre a lista procurando o que está vermelho. Botão por
// linha numa tabela de dez colunas ou vira mais uma coluna apertada, ou vira
// um menuzinho de três pontinhos que ninguém abre.
//
// ── Mouse E dedo ──────────────────────────────────────────────────────────
//
// Abre no hover no computador, como ele pediu, e no TOQUE no celular — que é
// onde o gestor trabalha e onde passar o mouse não existe. Um painel que só
// abre no hover seria, no telefone, um painel que não abre.
//
// Por isso é um <button> de verdade: com teclado se chega nele pelo Tab e se
// abre com Enter, o que de quebra deixa a tela utilizável por quem não usa
// mouse.

const FECHA_DEPOIS_MS = 250;

export function PuxadorDaLoja({
  clientId,
  tom,
  temPedidoAberto,
  podeAtualizar,
  foraDoMetaAds = false,
  podeRetirar = false,
  podeDesligar = false,
}: {
  clientId: string;
  tom: TomDaLoja;
  /** Já existe um link marcado como enviado e esperando a verba. */
  temPedidoAberto: boolean;
  podeAtualizar: boolean;
  /** Já está fora do acompanhamento? Então a ação é trazer de volta. */
  foraDoMetaAds?: boolean;
  /** Só a direção tira loja do acompanhamento. */
  podeRetirar?: boolean;
  /**
   * Oferece o "desligar de vez", que APAGA os números.
   *
   * Só na aba das retiradas, de propósito: quem chegou lá já decidiu que
   * não acompanha esta loja. Pôr um botão que apaga histórico ao lado de
   * "buscar números agora", na lista do dia a dia, é esperar o acidente.
   */
  podeDesligar?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<MetaAdsState>({});
  // A frase de confirmação do desligar de vez. Vem do servidor com o
  // tamanho do estrago contado — quantos registros, quantas contas.
  const [confirmarDesligar, setConfirmarDesligar] = useState<string | null>(
    null,
  );
  const [pendente, comecar] = useTransition();
  // Um respiro antes de fechar: sem ele, o caminho do mouse da faixa até o
  // painel passa por um pixel de fora e o painel some no meio do movimento.
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  function segurarAberto() {
    if (relogio.current) clearTimeout(relogio.current);
    setAberto(true);
  }
  function soltar() {
    // Com uma confirmação de apagar na tela, o painel NÃO fecha sozinho.
    //
    // Clicar num botão aqui dentro dispara blur no contêiner, e o blur
    // agenda o fechamento. Pras ações de um clique isso nunca importou —
    // elas fechavam o painel de qualquer jeito ao terminar. Mas a confirmação
    // de "desligar de vez" aparece DEPOIS do primeiro clique: sem esta
    // guarda, ela surgia e sumia em 250 ms, e o segundo clique nunca era
    // possível.
    if (confirmarDesligar) return;
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setAberto(false), FECHA_DEPOIS_MS);
  }

  function rodar(acao: () => Promise<MetaAdsState>) {
    comecar(async () => {
      const r = await acao();
      setEstado(r);
      // Deu certo: fecha sozinho, porque a linha atrás já mudou e é ela que
      // responde. Deu erro: fica aberto, senão a mensagem some junto.
      if (r.ok) setTimeout(() => setAberto(false), 1200);
    });
  }

  return (
    <div
      className="relative h-full"
      onMouseEnter={segurarAberto}
      onMouseLeave={soltar}
      onFocus={segurarAberto}
      onBlur={soltar}
    >
      <button
        type="button"
        // ABRIR, não alternar. No celular o toque dispara mouseenter ANTES do
        // clique: o mouseenter abria o painel e o clique, encontrando-o
        // aberto, fechava na mesma batida — ou seja, no telefone o painel
        // simplesmente não abria. Quem fecha é o mouse saindo (computador) ou
        // o toque fora (a cortina abaixo).
        onClick={segurarAberto}
        aria-expanded={aberto}
        aria-label="Ações desta loja"
        // A faixa tem 8px, que é um alvo bom pro olho e péssimo pro dedo. O
        // ::after estica a área de toque 12px pra direita sem pintar nada —
        // e para antes dos 16px de respiro da coluna do nome, pra não roubar
        // o clique do link da loja.
        className={`block w-2 h-full min-h-[4.5rem] cursor-pointer relative
          after:absolute after:inset-y-0 after:left-full after:w-3 after:content-['']
          ${FAIXA_DA_LOJA[tom]}`}
      />

      {/* A cortina que fecha no toque fora. Só existe com o painel aberto, e
          fica ATRÁS dele (z-10 contra z-20). No computador ela mal aparece:
          o mouse saindo já fecha antes. */}
      {aberto && (
        <button
          type="button"
          aria-label="Fechar"
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setAberto(false)}
        />
      )}

      {aberto && (
        /* Sai por cima de tudo (z-20) e à direita da faixa. `w-max` pra
           largura vir do conteúdo: nome de ação em português não cabe em
           largura fixa sem quebrar feio.

           Começa uns 40px abaixo do topo da linha pra NÃO cobrir o nome da
           loja: quem abriu o painel precisa continuar vendo em qual loja
           está mexendo. */
        <div
          className="absolute left-3 top-10 z-20 w-max max-w-[16rem] rounded-xl border border-border-forte
            bg-surface shadow-xl p-1.5 flex flex-col gap-0.5 text-left"
        >
          {temPedidoAberto ? (
            <Acao
              icone={Undo2}
              texto="Desfazer: não mandei"
              pendente={pendente}
              onClick={() => rodar(() => desmarcarVerbaEnviada(clientId))}
            />
          ) : (
            <Acao
              icone={Send}
              texto="Marquei: link de verba enviado"
              destaque
              pendente={pendente}
              onClick={() => rodar(() => marcarVerbaEnviada(clientId))}
            />
          )}

          {podeAtualizar && (
            <Acao
              icone={RefreshCw}
              texto="Buscar números agora"
              pendente={pendente}
              onClick={() => rodar(() => atualizarLojaAgora(clientId))}
            />
          )}

          <div className="border-t border-border my-0.5" />

          <Atalho href={`/meta-ads/${clientId}`} icone={BarChart3} texto="Campanhas da loja" />
          <Atalho href={`/clientes/${clientId}`} icone={FileText} texto="Ficha do cliente" />

          {/* Tirar do acompanhamento fica por último e sem destaque: é
              decisão rara e de direção, não ação do dia a dia. Não apaga
              nada — ver definirForaDoMetaAds. */}
          {podeRetirar && (
            <>
              <div className="border-t border-border my-0.5" />
              <Acao
                icone={foraDoMetaAds ? Eye : EyeOff}
                texto={
                  foraDoMetaAds
                    ? "Trazer de volta pro Meta Ads"
                    : "Tirar do acompanhamento"
                }
                pendente={pendente}
                onClick={() =>
                  rodar(() => definirForaDoMetaAds(clientId, !foraDoMetaAds))
                }
              />
            </>
          )}

          {/* Desligar de vez: APAGA os números. Fica em vermelho e por
              último, e o segundo clique só aparece depois que o servidor
              disse o tamanho do estrago. */}
          {podeDesligar && (
            <>
              {confirmarDesligar ? (
                <div className="px-2.5 py-2 flex flex-col gap-2 max-w-[15rem]">
                  <p className="text-xs text-red-500 flex items-start gap-1.5">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    {confirmarDesligar}
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={pendente}
                      onClick={() => {
                        setConfirmarDesligar(null);
                        rodar(() => desligarLojaDoMetaAds(clientId, true));
                      }}
                      className="min-h-10 px-3 rounded-lg bg-red-600 text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      Apagar mesmo assim
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmarDesligar(null)}
                      className="min-h-10 px-3 rounded-lg border border-border text-xs text-foreground-muted hover:text-foreground"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => {
                    // O blur deste mesmo clique já agendou o fechamento.
                    // Cancela antes de pedir a confirmação ao servidor.
                    segurarAberto();
                    setEstado({});
                    comecar(async () => {
                      const r = await desligarLojaDoMetaAds(clientId, false);
                      if (r?.precisaConfirmar) {
                        setConfirmarDesligar(r.precisaConfirmar);
                        return;
                      }
                      setEstado(r);
                    });
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left whitespace-nowrap
                    text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-60"
                >
                  <Unplug size={14} className="shrink-0" />
                  Desligar do Meta Ads de vez
                </button>
              )}
            </>
          )}

          {estado.erro && (
            <p className="text-xs text-red-500 px-2.5 py-1.5 max-w-[15rem]">{estado.erro}</p>
          )}
          {estado.ok && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 px-2.5 py-1.5 max-w-[15rem] flex items-start gap-1.5">
              <Check size={13} className="shrink-0 mt-0.5" />
              <span>{estado.ok}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Acao({
  icone: Icone,
  texto,
  onClick,
  pendente,
  destaque,
}: {
  icone: typeof Send;
  texto: string;
  onClick: () => void;
  pendente: boolean;
  destaque?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pendente}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left whitespace-nowrap
        disabled:opacity-60 ${
          destaque
            ? "font-medium text-accent hover:bg-accent/10"
            : "text-foreground-muted hover:text-foreground hover:bg-surface-muted"
        }`}
    >
      <Icone size={14} className="shrink-0" />
      {texto}
    </button>
  );
}

function Atalho({
  href,
  icone: Icone,
  texto,
}: {
  href: string;
  icone: typeof Send;
  texto: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm whitespace-nowrap
        text-foreground-muted hover:text-foreground hover:bg-surface-muted"
    >
      <Icone size={14} className="shrink-0" />
      {texto}
    </Link>
  );
}
