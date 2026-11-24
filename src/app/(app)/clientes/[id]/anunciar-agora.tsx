"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Rocket, X, Loader2, ExternalLink, AlertTriangle, Check, ImageIcon } from "lucide-react";
import { anunciarAgora, prepararAnunciarAgora } from "@/lib/actions/anunciar-do-estoque";
import type { EscolhaDoAnuncio, PlanoDoAnuncio } from "@/lib/estoque/anunciar-tipos";
import type { ResultadoDoAnunciarAgora } from "@/lib/estoque/anunciar-agora";

// "Anunciar agora": numa bolha por cima da tela, o carro do estoque vira RASCUNHO PAUSADO na Meta.
//
// Ao abrir, o sistema já traz tudo pronto: as fotos do carro no site (até 6, dá pra tirar), a campanha e o conjunto do "mesmo de
// sempre" da loja e uma legenda escrita pela IA. A pessoa só ajusta o que quiser: campanha EXISTENTE ou NOVA, conjunto
// EXISTENTE ou NOVO (e o orçamento dele). Nada vai ao ar — quem confere e publica é a pessoa, no Gerenciador.

const reais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const Seg = ({ ativo, onClick, children, desligado = false }: { ativo: boolean; onClick: () => void; children: React.ReactNode; desligado?: boolean }) => (
  <button
    type="button"
    disabled={desligado}
    onClick={onClick}
    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-40 ${
      ativo ? "border-accent bg-accent/10 text-foreground" : "border-border bg-surface text-foreground-muted hover:text-foreground"
    }`}
  >
    {children}
  </button>
);
const campo = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent/40";

export function AnunciarAgora({ carroId, carro, grande = false }: { carroId: string; carro: string; grande?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [plano, setPlano] = useState<PlanoDoAnuncio | null>(null);
  const [resultado, setResultado] = useState<ResultadoDoAnunciarAgora | null>(null);
  const [carregando, carregar] = useTransition();
  const [enviando, enviar] = useTransition();

  // as escolhas
  const [campanhaModo, setCampanhaModo] = useState<"existente" | "nova">("existente");
  const [campanhaId, setCampanhaId] = useState("");
  const [campanhaNome, setCampanhaNome] = useState("");
  const [conjuntoModo, setConjuntoModo] = useState<"existente" | "novo">("existente");
  const [conjuntoId, setConjuntoId] = useState("");
  const [conjuntoNome, setConjuntoNome] = useState("");
  const [orcamento, setOrcamento] = useState("");
  const [moldeId, setMoldeId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [legenda, setLegenda] = useState("");

  function abrir() {
    setAberto(true);
    setPlano(null);
    setResultado(null);
    carregar(async () => {
      const p = await prepararAnunciarAgora(carroId);
      setPlano(p);
      if (!p.ok) return;
      const cs = p.conjuntos ?? [];
      const padrao = p.padrao;
      const camp = padrao?.campaignId ?? p.campanhas?.[0]?.id ?? "";
      const conjDaCamp = cs.filter((c) => c.campaignId === camp);
      const conj = padrao && cs.some((c) => c.id === padrao.adsetId) ? padrao.adsetId : conjDaCamp[0]?.id ?? cs[0]?.id ?? "";
      setCampanhaModo("existente");
      setCampanhaId(camp);
      setCampanhaNome("");
      setConjuntoModo(padrao?.duplicarConjunto ? "novo" : "existente");
      setConjuntoId(conj);
      setConjuntoNome(p.carro?.titulo ?? "");
      setOrcamento(padrao?.orcamentoCents ? String(padrao.orcamentoCents / 100).replace(".", ",") : "");
      setMoldeId(conj);
      const dosAnuncios = (p.anuncios ?? []).filter((a) => a.adsetId === conj);
      setBaseId(padrao && dosAnuncios.some((a) => a.id === padrao.baseAdId) ? padrao.baseAdId : dosAnuncios[0]?.id ?? "");
      setFotos(p.fotos ?? []);
      setLegenda(p.legenda ?? "");
    });
  }

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && !enviando && setAberto(false);
    document.addEventListener("keydown", aoTeclar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [aberto, enviando]);

  const conjuntos = useMemo(() => plano?.conjuntos ?? [], [plano]);
  const anuncios = useMemo(() => plano?.anuncios ?? [], [plano]);
  const conjuntosDaCampanha = conjuntos.filter((c) => c.campaignId === campanhaId);
  // De onde o anúncio-base sai: do conjunto escolhido (existente) ou do molde (quando algo é novo).
  const origemDoBase = conjuntoModo === "existente" && campanhaModo === "existente" ? conjuntoId : moldeId;
  const baseDisponiveis = anuncios.filter((a) => a.adsetId === origemDoBase);
  const algoNovo = campanhaModo === "nova" || conjuntoModo === "novo";

  function trocarCampanha(id: string) {
    setCampanhaId(id);
    const dela = conjuntos.filter((c) => c.campaignId === id);
    if (conjuntoModo === "existente") {
      const novo = dela[0]?.id ?? "";
      setConjuntoId(novo);
      ajustarBase(novo);
    }
  }
  function trocarConjunto(id: string) {
    setConjuntoId(id);
    ajustarBase(id);
  }
  function trocarMolde(id: string) {
    setMoldeId(id);
    ajustarBase(id);
  }
  function ajustarBase(adsetId: string) {
    const lista = anuncios.filter((a) => a.adsetId === adsetId);
    const padrao = plano?.padrao;
    setBaseId(padrao && lista.some((a) => a.id === padrao.baseAdId) ? padrao.baseAdId : lista[0]?.id ?? "");
  }
  function trocarModoDaCampanha(m: "existente" | "nova") {
    setCampanhaModo(m);
    if (m === "nova") {
      setConjuntoModo("novo");
      if (!campanhaNome) setCampanhaNome(`${plano?.loja ?? ""} — ${plano?.carro?.titulo ?? ""}`.slice(0, 120));
    }
  }

  function criar() {
    if (!plano?.carro) return;
    const orc = orcamento.trim() ? Number(orcamento.replace(/\./g, "").replace(",", ".")) : null;
    const escolha: EscolhaDoAnuncio = {
      campanha: campanhaModo === "nova" ? { tipo: "nova", nome: campanhaNome } : { tipo: "existente", id: campanhaId },
      conjunto: conjuntoModo === "novo" ? { tipo: "novo", nome: conjuntoNome, orcamentoReais: orc !== null && Number.isFinite(orc) ? orc : null } : { tipo: "existente", id: conjuntoId },
      moldeAdsetId: algoNovo ? moldeId || null : null,
      baseAdId: baseId,
      fotos,
      legenda,
    };
    enviar(async () => setResultado(await anunciarAgora(carroId, escolha)));
  }

  const pronto = !!plano?.ok && !!plano.podeEscrever;
  const semFotos = fotos.length === 0;

  const bolha = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Anunciar ${carro}`}>
      <button type="button" aria-label="Fechar" onClick={() => !enviando && setAberto(false)} className="absolute inset-0 bg-black/60 backdrop-blur-[2px] cursor-default" />
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
          <div className="min-w-0">
            <h2 className="font-semibold flex items-center gap-2 truncate">
              <Rocket size={17} className="text-emerald-500 shrink-0" /> Anunciar agora — {carro}
            </h2>
            <p className="text-xs text-foreground-muted mt-0.5">
              {plano?.loja ? `${plano.loja} · ` : ""}vira um <strong>rascunho pausado</strong> na Meta: nada vai ao ar sem você publicar.
            </p>
          </div>
          <button type="button" onClick={() => setAberto(false)} disabled={enviando} className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-muted shrink-0" title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {carregando || plano === null ? (
            <p className="text-sm text-foreground-muted py-10 text-center flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Pegando as fotos no site, as campanhas da loja e escrevendo a legenda…
            </p>
          ) : !plano.ok ? (
            <p className="text-sm text-red-500 flex items-start gap-1.5 whitespace-pre-line">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {plano.erro}
            </p>
          ) : resultado?.ok ? (
            <div className="text-sm rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex flex-col gap-2">
              {resultado.jaTinha ? (
                <p>Esse carro já tinha rascunho criado. Procure no Gerenciador (anúncio {resultado.adId}).</p>
              ) : (
                <>
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Check size={15} className="text-emerald-500" /> Rascunho pausado criado
                  </p>
                  <p>
                    {resultado.formato === "carrossel" ? "Carrossel" : "Foto única"} com {resultado.fotos} {resultado.fotos === 1 ? "foto" : "fotos"} do site.
                    {resultado.campanhaNova ? ` Campanha nova “${resultado.campanhaNova}” (pausada).` : ""}
                    {resultado.conjuntoNovo ? ` Conjunto novo “${resultado.conjuntoNovo}” (pausado).` : ""} Ele <strong>não está no ar</strong> e não gasta nada.
                  </p>
                  {resultado.avisos?.map((a, i) => (
                    <p key={i} className="text-amber-600 dark:text-amber-400">⚠️ {a}</p>
                  ))}
                  {resultado.linkDoGerenciador && (
                    <a href={resultado.linkDoGerenciador} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent underline">
                      <ExternalLink size={13} /> Conferir e publicar no Gerenciador
                    </a>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              {/* Carro */}
              <div className="text-sm">
                <p className="font-medium">{plano.carro?.titulo}</p>
                <p className="text-xs text-foreground-muted">
                  {[plano.carro?.ano, plano.carro?.km !== null && plano.carro?.km !== undefined ? `${plano.carro.km.toLocaleString("pt-BR")} km` : null, plano.carro?.cor, plano.carro?.precoCents ? reais(plano.carro.precoCents) : null].filter(Boolean).join(" · ")}
                </p>
              </div>

              {!plano.podeEscrever && (
                <p className="text-sm text-amber-600 dark:text-amber-400">⚠️ O acesso de escrita na Meta ainda não está configurado neste ambiente: dá pra ver tudo, mas não criar o rascunho.</p>
              )}

              {/* Fotos */}
              <section className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted flex items-center gap-1.5">
                  <ImageIcon size={13} /> Fotos do site ({fotos.length} de {plano.fotos?.length ?? 0} escolhidas) — {fotos.length > 1 ? "carrossel" : "foto única"}
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {(plano.fotos ?? []).map((u) => {
                    const on = fotos.includes(u);
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setFotos(on ? fotos.filter((x) => x !== u) : (plano.fotos ?? []).filter((x) => x === u || fotos.includes(x)))}
                        className={`relative aspect-square overflow-hidden rounded-lg border-2 ${on ? "border-accent" : "border-border opacity-45"}`}
                        title={on ? "Clique pra tirar esta foto" : "Clique pra usar esta foto"}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
                        {on && <span className="absolute top-1 right-1 rounded-full bg-accent text-accent-foreground p-0.5"><Check size={11} /></span>}
                      </button>
                    );
                  })}
                </div>
                {semFotos && <p className="text-xs text-red-500">Escolhe pelo menos uma foto.</p>}
              </section>

              {/* Onde vai ficar */}
              <section className="flex flex-col gap-3 rounded-xl border border-border p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Onde vai ficar</p>

                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Campanha</p>
                  <div className="flex gap-2">
                    <Seg ativo={campanhaModo === "existente"} onClick={() => trocarModoDaCampanha("existente")} desligado={(plano.campanhas ?? []).length === 0}>Existente</Seg>
                    <Seg ativo={campanhaModo === "nova"} onClick={() => trocarModoDaCampanha("nova")}>Nova</Seg>
                  </div>
                  {campanhaModo === "existente" ? (
                    <select value={campanhaId} onChange={(e) => trocarCampanha(e.target.value)} className={campo}>
                      {(plano.campanhas ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                          {c.status && c.status !== "ACTIVE" ? ` (${c.status === "PAUSED" ? "pausada" : c.status.toLowerCase()})` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={campanhaNome} onChange={(e) => setCampanhaNome(e.target.value)} placeholder="Nome da campanha nova" className={campo} />
                  )}
                  {campanhaModo === "nova" && <p className="text-xs text-foreground-muted">A campanha nova é uma cópia (pausada) da campanha do conjunto que você escolher abaixo como molde.</p>}
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Conjunto</p>
                  <div className="flex gap-2">
                    <Seg ativo={conjuntoModo === "existente"} onClick={() => setConjuntoModo("existente")} desligado={campanhaModo === "nova"}>Existente</Seg>
                    <Seg ativo={conjuntoModo === "novo"} onClick={() => setConjuntoModo("novo")}>Novo (um por carro)</Seg>
                  </div>
                  {conjuntoModo === "existente" ? (
                    <select value={conjuntoId} onChange={(e) => trocarConjunto(e.target.value)} className={campo}>
                      {conjuntosDaCampanha.length === 0 && <option value="">Essa campanha não tem conjunto</option>}
                      {conjuntosDaCampanha.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                          {c.status && c.status !== "ACTIVE" ? ` (${c.status === "PAUSED" ? "pausado" : c.status.toLowerCase()})` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-2">
                      <input value={conjuntoNome} onChange={(e) => setConjuntoNome(e.target.value)} placeholder="Nome do conjunto novo" className={campo} />
                      <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
                        R$/dia
                        <input value={orcamento} onChange={(e) => setOrcamento(e.target.value)} inputMode="decimal" placeholder="igual ao molde" className={campo} />
                      </label>
                    </div>
                  )}
                </div>

                {algoNovo && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-sm font-medium">Copiar as configurações de (público, localização, otimização)</p>
                    <select value={moldeId} onChange={(e) => trocarMolde(e.target.value)} className={campo}>
                      {conjuntos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                          {c.orcamentoCents ? ` — ${reais(c.orcamentoCents)}/dia` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-medium">Anúncio-base (de onde herda página, botão e rastreamento)</p>
                  <select value={baseId} onChange={(e) => setBaseId(e.target.value)} className={campo}>
                    {baseDisponiveis.length === 0 && <option value="">Esse conjunto não tem anúncio pra servir de base</option>}
                    {baseDisponiveis.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nome}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-foreground-muted">Tem que ser de foto ou carrossel (vídeo e Advantage+ não servem de base).</p>
                </div>
              </section>

              {/* Legenda */}
              <section className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Legenda (escrita pela IA com a voz da loja — edite à vontade)</p>
                <textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={8} className={campo} placeholder="Escreva a legenda do anúncio…" />
                {plano.erroDaLegenda && <p className="text-xs text-amber-600 dark:text-amber-400">⚠️ {plano.erroDaLegenda}</p>}
                {plano.avisosDaLegenda?.map((a, i) => (
                  <p key={i} className="text-xs text-amber-600 dark:text-amber-400">⚠️ {a}</p>
                ))}
              </section>

              {resultado && !resultado.ok && (
                <p className="text-sm text-red-500 flex items-start gap-1.5 whitespace-pre-line">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {resultado.erro}
                </p>
              )}
            </>
          )}
        </div>

        {plano?.ok && !resultado?.ok && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
            <p className="text-xs text-foreground-muted">Campanha, conjunto e anúncio nascem <strong>pausados</strong>.</p>
            <button
              type="button"
              disabled={!pronto || enviando || semFotos || !baseId}
              onClick={criar}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {enviando ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
              {enviando ? "Subindo o rascunho…" : "Criar rascunho pausado"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className={`inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white font-medium hover:opacity-90 ${grande ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"}`}
      >
        <Rocket size={grande ? 15 : 13} /> Anunciar agora
      </button>
      {/* Só existe depois do clique (no navegador), então o portal pode usar o document direto. */}
      {aberto ? createPortal(bolha, document.body) : null}
    </>
  );
}
