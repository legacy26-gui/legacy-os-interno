"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Users, X, Loader2, MapPin, Trash2, Plus, AlertTriangle, Check, Search } from "lucide-react";
import { abrirPublicoDoConjunto, procurarLocais, salvarPublico } from "@/lib/actions/publico-do-conjunto";
import { IDADE_MAXIMA, IDADE_MINIMA, RAIOS_DA_CIDADE, resumoDoPublico, type GeneroDoPublico, type LocalDoPublico, type PublicoDoConjunto } from "@/lib/meta/publico-puro";

// O público de um conjunto, do jeito do Gerenciador: idade, gênero e localização (cidades com raio). Abre numa bolha por cima.
//
// O Advantage+ público NÃO é opção: fica SEMPRE desligado, e todo "Salvar" garante isso na Meta.
// Interesses, públicos personalizados e exclusões não são mexidos (só aparece quantos existem).

const idades = Array.from({ length: IDADE_MAXIMA - IDADE_MINIMA + 1 }, (_, i) => IDADE_MINIMA + i);
const campo = "rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent/40";

export function PublicoDoConjuntoBotao({ clientId, adsetId, nome, podeMexer }: { clientId: string; adsetId: string; nome: string; podeMexer: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [carregando, carregar] = useTransition();
  const [salvando, salvar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ resumo: string; avisos: string[] } | null>(null);
  const [lido, setLido] = useState<{ nome: string; noAr: boolean; publico: PublicoDoConjunto; tecnico: string } | null>(null);

  const [idadeMin, setIdadeMin] = useState(IDADE_MINIMA);
  const [idadeMax, setIdadeMax] = useState(IDADE_MAXIMA);
  const [genero, setGenero] = useState<GeneroDoPublico>("todos");
  const [locais, setLocais] = useState<LocalDoPublico[]>([]);

  // busca de localização
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<LocalDoPublico[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  function abrir() {
    setAberto(true);
    setLido(null);
    setErro(null);
    setResultado(null);
    setTermo("");
    setAchados([]);
    carregar(async () => {
      const r = await abrirPublicoDoConjunto(clientId, adsetId);
      if (!r.ok) return setErro(r.erro);
      setLido({ nome: r.nome, noAr: r.noAr, publico: r.publico, tecnico: r.tecnico });
      setIdadeMin(r.publico.idadeMin);
      setIdadeMax(r.publico.idadeMax);
      setGenero(r.publico.genero);
      setLocais(r.publico.locais);
    });
  }

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && !salvando && document.querySelectorAll('[role="dialog"]').length <= 1 && setAberto(false);
    document.addEventListener("keydown", aoTeclar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [aberto, salvando]);

  function digitar(v: string) {
    setTermo(v);
    setErroBusca(null);
    if (relogio.current) clearTimeout(relogio.current);
    if (v.trim().length < 2) return setAchados([]);
    relogio.current = setTimeout(async () => {
      setBuscando(true);
      const r = await procurarLocais(clientId, v);
      setBuscando(false);
      if (!r.ok) return setErroBusca(r.erro ?? "A busca falhou.");
      setAchados(r.locais ?? []);
    }, 400);
  }

  function adicionar(l: LocalDoPublico) {
    if (locais.some((x) => x.tipo === l.tipo && x.chave === l.chave)) return;
    setLocais([...locais, l]);
    setTermo("");
    setAchados([]);
  }

  function atual(): { idadeMin: number; idadeMax: number; genero: GeneroDoPublico; locais: LocalDoPublico[] } {
    return { idadeMin, idadeMax, genero, locais };
  }

  function gravar() {
    if (!lido) return;
    const mudou = resumoDoPublico(lido.publico) !== resumoDoPublico(atual());
    const aviso = lido.noAr ? "\n\nEste conjunto está NO AR: mudar o público reinicia o aprendizado da Meta." : "";
    const exp = lido.publico.expansaoLigada === true ? "\n\nO Advantage+ público está LIGADO e vai ser DESLIGADO." : "";
    if (!mudou && lido.publico.expansaoLigada !== true) {
      return setErro("Você não mudou nada.");
    }
    if (!confirm(`Salvar no Meta?\n\nDe: ${resumoDoPublico(lido.publico)}\nPara: ${resumoDoPublico(atual())}${aviso}${exp}`)) return;
    setErro(null);
    salvar(async () => {
      const r = await salvarPublico(clientId, adsetId, atual());
      if (!r.ok) return setErro(r.erro ?? "Não consegui salvar.");
      setResultado({ resumo: r.resumo ?? "", avisos: r.avisos ?? [] });
    });
  }

  const bolha = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Público de ${nome}`}>
      <button type="button" aria-label="Fechar" onClick={() => !salvando && setAberto(false)} className="absolute inset-0 bg-black/60 backdrop-blur-[2px] cursor-default" />
      <div className="relative w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
          <div className="min-w-0">
            <h2 className="font-semibold flex items-center gap-2 truncate">
              <Users size={17} className="text-accent shrink-0" /> Público — {nome}
            </h2>
            <p className="text-xs text-foreground-muted mt-0.5">Idade, gênero e localização do conjunto. O que mudar vale na Meta na hora.</p>
          </div>
          <button type="button" onClick={() => setAberto(false)} disabled={salvando} className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-muted shrink-0" title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {carregando || (!lido && !erro) ? (
            <p className="text-sm text-foreground-muted py-8 text-center flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Lendo o público na Meta…
            </p>
          ) : !lido ? (
            <p className="text-sm text-red-500 flex items-start gap-1.5">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {erro}
            </p>
          ) : resultado ? (
            <div className="text-sm rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex flex-col gap-2">
              <p className="flex items-center gap-1.5 font-semibold">
                <Check size={15} className="text-emerald-500" /> Salvo na Meta
              </p>
              <p>{resultado.resumo}</p>
              <p className="text-xs text-foreground-muted">Advantage+ público está desligado. A caixinha de cidades e regiões não foi mexida.</p>
              {resultado.avisos.map((a, i) => (
                <p key={i} className="text-amber-600 dark:text-amber-400">⚠️ {a}</p>
              ))}
            </div>
          ) : (
            <>
              {lido.noAr && <p className="text-xs text-amber-600 dark:text-amber-400">⚠️ Este conjunto está no ar: mudar o público reinicia o aprendizado da Meta.</p>}

              {/* Idade e gênero */}
              <section className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Idade e gênero</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-sm flex items-center gap-1.5">
                    De
                    <select value={idadeMin} onChange={(e) => setIdadeMin(Number(e.target.value))} className={campo}>
                      {idades.map((i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm flex items-center gap-1.5">
                    até
                    <select value={idadeMax} onChange={(e) => setIdadeMax(Number(e.target.value))} className={campo}>
                      {idades.map((i) => (
                        <option key={i} value={i}>{i === IDADE_MAXIMA ? `${i}+` : i}</option>
                      ))}
                    </select>
                    anos
                  </label>
                  <div className="flex gap-1.5 ml-auto">
                    {(["todos", "homens", "mulheres"] as const).map((g) => (
                      <button key={g} type="button" onClick={() => setGenero(g)} className={`px-3 py-1.5 text-xs font-medium rounded-lg border capitalize ${genero === g ? "border-accent bg-accent/10" : "border-border text-foreground-muted hover:text-foreground"}`}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* Localização */}
              <section className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted flex items-center gap-1.5">
                  <MapPin size={13} /> Localização
                </p>
                <ul className="flex flex-col gap-1.5">
                  {locais.map((l, i) => (
                    <li key={`${l.tipo}-${l.chave ?? i}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{l.nome}</p>
                        <p className="text-[11px] text-foreground-muted">{l.detalhe}</p>
                      </div>
                      {(l.tipo === "cidade" || l.tipo === "ponto") && (
                        <label className="text-xs text-foreground-muted flex items-center gap-1">
                          Raio
                          <select
                            value={l.raioKm ?? 0}
                            onChange={(e) => setLocais(locais.map((x, j) => (j === i ? { ...x, raioKm: Number(e.target.value) || null } : x)))}
                            className={campo}
                          >
                            <option value={0}>{l.tipo === "cidade" ? "só a cidade" : "sem raio"}</option>
                            {(l.tipo === "ponto" && l.raioKm !== null && !RAIOS_DA_CIDADE.includes(l.raioKm) ? [...RAIOS_DA_CIDADE, l.raioKm].sort((a, b) => a - b) : RAIOS_DA_CIDADE).map((r) => (
                              <option key={r} value={r}>{r} km</option>
                            ))}
                          </select>
                        </label>
                      )}
                      <button type="button" onClick={() => setLocais(locais.filter((_, j) => j !== i))} title="Tirar esta localização" className="p-1 rounded text-foreground-muted hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                  {locais.length === 0 && <li className="text-xs text-red-500">Deixe pelo menos uma localização.</li>}
                </ul>
                {lido.publico.locaisIntocados.length > 0 && (
                  <p className="text-xs text-foreground-muted">Também tem {lido.publico.locaisIntocados.join(", ")} — esta tela não edita, e eles ficam como estão.</p>
                )}

                <div className="relative">
                  <div className="flex items-center gap-2">
                    <Search size={14} className="text-foreground-muted shrink-0" />
                    <input value={termo} onChange={(e) => digitar(e.target.value)} placeholder="Adicionar cidade ou estado (digite o nome)…" className={`${campo} w-full`} />
                    {buscando && <Loader2 size={14} className="animate-spin text-foreground-muted shrink-0" />}
                  </div>
                  {erroBusca && <p className="text-xs text-red-500 mt-1">{erroBusca}</p>}
                  {achados.length > 0 && (
                    <ul className="absolute z-10 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                      {achados.map((a) => (
                        <li key={`${a.tipo}-${a.chave}`}>
                          <button type="button" onClick={() => adicionar(a)} className="w-full text-left px-3 py-2 hover:bg-surface-muted flex items-center justify-between gap-2">
                            <span className="text-sm">{a.nome}</span>
                            <span className="text-[11px] text-foreground-muted flex items-center gap-1">
                              {a.detalhe} <Plus size={12} />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              {/* O que fica sempre desligado */}
              <section className="rounded-xl border border-border bg-surface-muted/40 p-3 flex flex-col gap-1.5">
                <label className="flex items-start gap-2 text-sm opacity-80 cursor-not-allowed">
                  <input type="checkbox" checked={false} disabled readOnly className="mt-1" />
                  <span>
                    <strong>Advantage+ público</strong> (deixar a Meta ampliar o público)
                    <span className="block text-xs text-foreground-muted">Sempre desligado. Ao salvar, o sistema garante que está desligado na Meta.</span>
                  </span>
                </label>
                {lido.publico.expansaoLigada === true && (
                  <p className="text-xs text-red-500 flex items-start gap-1.5">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" /> Está LIGADO neste conjunto agora. Ao salvar, vai ser desligado.
                  </p>
                )}
              </section>

              {/* A caixinha das cidades e regiões: a Meta não documenta o campo, então o sistema ainda não a controla. */}
              <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex flex-col gap-1.5 text-xs">
                <p className="text-sm">
                  <strong>“Alcançar mais pessoas com probabilidade de responder aos seus anúncios”</strong> (cidades e regiões)
                </p>
                <p className="text-foreground-muted">
                  Esta caixinha eu ainda <strong>não consigo ler nem desligar</strong> por aqui: a Meta não informa o nome dela na documentação. Ao salvar,
                  o que estiver marcado lá <strong>fica como está</strong>. Confere no Gerenciador e desmarque por lá, se precisar.
                </p>
                {lido.tecnico && (
                  <details>
                    <summary className="cursor-pointer text-foreground-muted">Detalhe técnico (o que a Meta devolveu)</summary>
                    <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg bg-surface p-2 text-[11px] leading-snug whitespace-pre-wrap">{lido.tecnico}</pre>
                  </details>
                )}
              </section>

              {lido.publico.outros.length > 0 && (
                <p className="text-xs text-foreground-muted">Este conjunto também tem {lido.publico.outros.join(", ")}. Isso não é mexido por aqui.</p>
              )}

              {erro && (
                <p className="text-sm text-red-500 flex items-start gap-1.5 whitespace-pre-line">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {erro}
                </p>
              )}
            </>
          )}
        </div>

        {lido && !resultado && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
            <p className="text-xs text-foreground-muted">Vale na Meta assim que salvar.</p>
            <button
              type="button"
              disabled={!podeMexer || salvando || locais.length === 0}
              onClick={gravar}
              title={podeMexer ? "" : "O acesso de escrita na Meta ainda não está configurado"}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium disabled:opacity-50"
            >
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar no Meta
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button type="button" onClick={abrir} title="Público: idade, gênero e localização" className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border border-border text-foreground-muted hover:text-foreground hover:bg-surface-muted">
        <Users size={12} /> Público
      </button>
      {aberto ? createPortal(bolha, document.body) : null}
    </>
  );
}
