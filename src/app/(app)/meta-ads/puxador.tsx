"use client";

import Link from "next/link";
import { useState, useTransition, useRef } from "react";
import { BarChart3, FileText, RefreshCw, Send, Undo2, Check } from "lucide-react";
import {
  marcarVerbaEnviada,
  desmarcarVerbaEnviada,
  atualizarLojaAgora,
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
}: {
  clientId: string;
  tom: TomDaLoja;
  /** Já existe um link marcado como enviado e esperando a verba. */
  temPedidoAberto: boolean;
  podeAtualizar: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<MetaAdsState>({});
  const [pendente, comecar] = useTransition();
  // Um respiro antes de fechar: sem ele, o caminho do mouse da faixa até o
  // painel passa por um pixel de fora e o painel some no meio do movimento.
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  function segurarAberto() {
    if (relogio.current) clearTimeout(relogio.current);
    setAberto(true);
  }
  function soltar() {
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
