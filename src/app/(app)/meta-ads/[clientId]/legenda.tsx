"use client";

import { useState, useTransition } from "react";
import { Pencil, AlertTriangle, Loader2 } from "lucide-react";
import { definirTexto, conferirAntesDeEditar } from "@/lib/actions/meta-ads";

// O texto do anúncio, editável na própria linha.
//
// ── O aviso vem ANTES de digitar, não depois ─────────────────────────────
//
// Porque depois é tarde. Quem escreveu a legenda nova inteira e só então lê
// "isto apaga os 180 comentários" já gastou o esforço, e a chance de seguir
// mesmo assim é grande. Lido antes, o número decide se vale abrir o campo.
//
// Por isso abrir a edição dispara uma pergunta à Meta (quantas curtidas e
// comentários tem o post) e o aviso aparece em cima do formulário. É uma
// chamada por abertura, não por linha da lista — contar isso em vinte
// anúncios que ninguém vai editar seria pagar por nada.
//
// ── Por que não é <form action={...}> ────────────────────────────────────
//
// Porque formulário com action se APAGA quando a ação resolve, inclusive
// quando ela devolve erro. Já aconteceu no Studio: a pessoa corrigia um
// campo, mandava de novo, e enviava um formulário vazio sem perceber. Aqui
// seria pior — o texto que ela acabou de escrever sumiria, e o anúncio tem
// legenda de dez linhas.

export function Legenda({
  clientId,
  adId,
  legenda,
  titulo,
  descricao,
  podeMexer,
}: {
  clientId: string;
  adId: string;
  legenda: string | null;
  titulo: string | null;
  descricao: string | null;
  podeMexer: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [campos, setCampos] = useState({
    legenda: legenda ?? "",
    titulo: titulo ?? "",
    descricao: descricao ?? "",
  });
  // O que está na tela depois de salvar. Sem isto a linha mostraria o texto
  // velho até alguém recarregar, e a pessoa editaria de novo.
  const [mostrado, setMostrado] = useState(legenda);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();
  const [conferindo, setConferindo] = useState(false);

  function abrir() {
    setAberto(true);
    setErro(null);
    setOk(null);
    setConfirmar(null);
    setConferindo(true);
    comecar(async () => {
      const r = await conferirAntesDeEditar(clientId, adId);
      setConferindo(false);
      if (r.erro) setErro(r.erro);
      if (r.aviso) setAviso(r.aviso);
    });
  }

  function salvar(confirmado: boolean) {
    setErro(null);
    setConfirmar(null);
    comecar(async () => {
      const r = await definirTexto(clientId, adId, campos, confirmado);
      if (r?.precisaConfirmar) {
        setConfirmar(r.precisaConfirmar);
        return;
      }
      if (r?.erro) {
        setErro(r.erro);
        return;
      }
      setMostrado(campos.legenda);
      setOk(r?.ok ?? "Texto trocado.");
      setAberto(false);
    });
  }

  if (!aberto) {
    return (
      <div className="mt-1 max-w-md">
        {mostrado && (
          <span className="block text-xs text-foreground-muted line-clamp-2">
            {mostrado}
          </span>
        )}
        {podeMexer && (
          <button
            type="button"
            onClick={abrir}
            className="inline-flex items-center gap-1.5 min-h-11 -my-2 text-xs text-foreground-muted hover:text-accent"
          >
            <Pencil size={12} />{" "}
            {mostrado ? "Mudar o texto" : "Escrever o texto"}
          </button>
        )}
        {ok && (
          <span className="block text-xs text-emerald-600 dark:text-emerald-400 mt-1">
            {ok}
          </span>
        )}
        {erro && (
          <span className="block text-xs text-red-600 dark:text-red-400 mt-1">
            {erro}
          </span>
        )}
      </div>
    );
  }

  // ── Por que isto vira painel por cima, e não cresce na linha ───────────
  //
  // Porque a linha fica numa TABELA, e a célula do nome é estreita. Aberto
  // ali dentro, o editor saiu com 165px de largura: a legenda, que tem dez
  // linhas, aparecia em quatro palavras por linha. A coluna não pode alargar
  // sem empurrar gasto, leads e custo pra fora da tela, que é o que a pessoa
  // está olhando quando decide mexer no texto.
  //
  // Por cima resolve os dois: a tabela fica como está por baixo, e no celular
  // — onde essa tela é muito usada — o editor ocupa a tela inteira em vez de
  // uma coluna de uma tabela que rola de lado.
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      {/* Clicar fora fecha. O texto digitado fica no estado, então reabrir
          traz tudo de volta — fechar sem querer não apaga trabalho. */}
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 cursor-default"
        onClick={() => setAberto(false)}
      />
      <div className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border bg-surface p-4 flex flex-col gap-2.5 text-left">
        <p className="text-sm font-semibold">Texto do anúncio</p>
        {/* O aviso, em cima de tudo. */}
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
          <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              {conferindo ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Conferindo o
                  post na Meta…
                </span>
              ) : (
                (aviso ??
                  "A Meta pode não deixar trocar o texto neste anúncio sem refazê-lo, e aí nasce um post novo.")
              )}
            </span>
          </p>
        </div>

        <Campo
          rotulo="Legenda"
          valor={campos.legenda}
          aoMudar={(v) => setCampos((c) => ({ ...c, legenda: v }))}
          linhas={5}
          desabilitado={pendente}
        />
        <Campo
          rotulo="Título"
          valor={campos.titulo}
          aoMudar={(v) => setCampos((c) => ({ ...c, titulo: v }))}
          linhas={1}
          desabilitado={pendente}
        />
        <Campo
          rotulo="Descrição"
          valor={campos.descricao}
          aoMudar={(v) => setCampos((c) => ({ ...c, descricao: v }))}
          linhas={2}
          desabilitado={pendente}
        />

        {confirmar && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-2.5">
            <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>{confirmar}</span>
            </p>
            <div className="flex gap-1.5 mt-2">
              <button
                type="button"
                onClick={() => salvar(true)}
                disabled={pendente}
                className="px-3 min-h-11 rounded-lg bg-red-600 text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                Sim, criar o anúncio novo
              </button>
              <button
                type="button"
                onClick={() => setConfirmar(null)}
                className="px-3 min-h-11 text-xs text-foreground-muted hover:text-foreground"
              >
                Não
              </button>
            </div>
          </div>
        )}

        {erro && (
          <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => salvar(false)}
            disabled={pendente}
            className="px-4 min-h-11 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {pendente ? "Mandando pra Meta…" : "Salvar na Meta"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAberto(false);
              setConfirmar(null);
              setErro(null);
            }}
            className="px-3 min-h-11 text-sm text-foreground-muted hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  aoMudar,
  linhas,
  desabilitado,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  linhas: number;
  desabilitado: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-foreground-muted">
        {rotulo}
      </span>
      <textarea
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        rows={linhas}
        disabled={desabilitado}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-y disabled:opacity-60"
      />
    </label>
  );
}
