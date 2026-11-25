"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Plus, Trash2, ExternalLink } from "lucide-react";
import { abrirCampanha, ajustar, listarCampanhas, type Ajuste } from "@/lib/actions/ajustar-campanha";
import type { CampanhaParaAjustar } from "@/lib/meta/ajustar-campanha";

const campo = "rounded-lg border border-border bg-surface px-3 py-2 text-sm";
const caixa = "rounded-2xl border border-border p-4 flex flex-col gap-3";
const reais = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));
const emCentavos = (v: string) => Math.round(Number(v.replace(/\./g, "").replace(",", ".")) * 100);

type Aberta = Extract<CampanhaParaAjustar, { ok: true }>;

export function Ajustador(p: { clientId: string; contas: { id: string; nome: string }[]; contaInicial: string; campanhaInicial: string | null }) {
  const [conta, setConta] = useState(p.contaInicial);
  const [campanhas, setCampanhas] = useState<{ id: string; nome: string; status: string }[]>([]);
  const [campanhaId, setCampanhaId] = useState(p.campanhaInicial ?? "");
  const [camp, setCamp] = useState<Aberta | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; erro?: string }>({});
  const [pendente, comecar] = useTransition();
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [novo, setNovo] = useState({ nome: "", valor: "" });

  useEffect(() => {
    comecar(async () => {
      const r = await listarCampanhas(p.clientId, conta);
      if (r.ok) setCampanhas(r.campanhas);
      else setMsg({ erro: r.erro });
    });
  }, [conta, p.clientId]);

  const abrir = (id: string) =>
    comecar(async () => {
      if (!id) return setCamp(null);
      const r = await abrirCampanha(p.clientId, conta, id);
      if (r.ok) setCamp(r);
      else {
        setCamp(null);
        setMsg({ erro: r.erro });
      }
    });
  useEffect(() => {
    if (p.campanhaInicial) abrir(p.campanhaInicial);
    // só na primeira vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fazer = (a: Ajuste) =>
    comecar(async () => {
      setMsg({});
      const r = await ajustar(p.clientId, conta, campanhaId, a);
      setMsg(r.ok ? { ok: r.msg.replace(/\*/g, "") } : { erro: r.erro });
      const de = await abrirCampanha(p.clientId, conta, campanhaId);
      if (de.ok) setCamp(de);
    });

  return (
    <div className="flex flex-col gap-4">
      <section className={caixa}>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Conta de anúncio
            <select value={conta} onChange={(e) => { setConta(e.target.value); setCampanhaId(""); setCamp(null); }} className={campo}>
              {p.contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Campanha
            <select aria-label="Campanha" value={campanhaId} onChange={(e) => { setCampanhaId(e.target.value); abrir(e.target.value); }} className={campo}>
              <option value="">— escolha a campanha —</option>
              {campanhaId && !campanhas.some((c) => c.id === campanhaId) && <option value={campanhaId}>{camp?.nome ?? campanhaId}</option>}
              {campanhas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} {c.status === "ACTIVE" ? "(ativa)" : "(pausada)"}
                </option>
              ))}
            </select>
          </label>
        </div>
        {pendente && <span className="text-xs text-foreground-muted inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> conversando com a Meta…</span>}
        {msg.ok && <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg.ok}</p>}
        {msg.erro && <p className="text-sm text-red-500">{msg.erro}</p>}
        {camp && (
          <a href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${camp.contaMeta.replace(/^act_/, "")}&selected_campaign_ids=${camp.id}`} target="_blank" rel="noreferrer" className="text-xs text-accent inline-flex items-center gap-1 w-fit">
            Abrir no Gerenciador <ExternalLink size={12} />
          </a>
        )}
      </section>

      {camp &&
        camp.conjuntos.map((c) => {
          const dele = camp.anuncios.filter((a) => a.conjuntoId === c.id);
          const rodando = c.status === "ACTIVE";
          return (
            <section
              key={c.id}
              data-conjunto={c.nome}
              onDragOver={(e) => { if (arrastando) { e.preventDefault(); setAlvo(c.id); } }}
              onDragLeave={() => setAlvo((x) => (x === c.id ? null : x))}
              onDrop={(e) => {
                e.preventDefault();
                setAlvo(null);
                const id = e.dataTransfer.getData("text/x-anuncio");
                setArrastando(null);
                if (id) fazer({ tipo: "mover", anuncioId: id, paraConjuntoId: c.id });
              }}
              className={`${caixa} ${alvo === c.id ? "border-accent bg-accent/10" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={`Nome do conjunto ${c.nome}`}
                  defaultValue={c.nome}
                  disabled={pendente || rodando}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== c.nome && fazer({ tipo: "renomear", nivel: "conjunto", id: c.id, nome: e.target.value })}
                  className={`${campo} font-semibold flex-1 min-w-48`}
                />
                {c.orcamentoCents !== null && (
                  <label className="flex items-center gap-1 text-sm">
                    R$
                    <input
                      aria-label={`Orçamento do conjunto ${c.nome}`}
                      defaultValue={reais(c.orcamentoCents)}
                      disabled={pendente || rodando}
                      onBlur={(e) => {
                        const v = emCentavos(e.target.value);
                        if (v && v !== c.orcamentoCents) fazer({ tipo: "orcamento", conjuntoId: c.id, centavosPorDia: v });
                      }}
                      className={`${campo} w-24`}
                    />
                    /dia
                  </label>
                )}
                <span className="text-xs text-foreground-muted">{rodando ? "rodando (só pelo Gerenciador)" : "pausado"} · {dele.length} anúncio(s)</span>
              </div>
              {dele.length === 0 && <p className="text-xs text-foreground-muted">Sem anúncio. Arraste um anúncio pra cá.</p>}
              <ul className="flex flex-col gap-2">
                {dele.map((a) => {
                  const ar = a.status === "ACTIVE";
                  return (
                    <li
                      key={a.id}
                      data-anuncio={a.nome}
                      draggable={!ar && !pendente}
                      onDragStart={(e) => { e.dataTransfer.setData("text/x-anuncio", a.id); setArrastando(a.id); }}
                      onDragEnd={() => setArrastando(null)}
                      className={`flex flex-wrap items-center gap-2 rounded-xl border border-border p-2 ${ar ? "" : "cursor-grab"}`}
                    >
                      {a.miniatura && /^https:\/\//.test(a.miniatura) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.miniatura} alt="" className="w-12 h-12 rounded object-cover pointer-events-none" />
                      )}
                      <input
                        aria-label={`Nome do anúncio ${a.nome}`}
                        defaultValue={a.nome}
                        disabled={pendente || ar}
                        onBlur={(e) => e.target.value.trim() && e.target.value !== a.nome && fazer({ tipo: "renomear", nivel: "anuncio", id: a.id, nome: e.target.value })}
                        className={`${campo} flex-1 min-w-48`}
                      />
                      <select
                        aria-label={`Mover ${a.nome}`}
                        disabled={pendente || ar}
                        value=""
                        onChange={(e) => e.target.value && fazer({ tipo: "mover", anuncioId: a.id, paraConjuntoId: e.target.value })}
                        className={`${campo} text-xs`}
                      >
                        <option value="">mover pra…</option>
                        {camp.conjuntos.filter((x) => x.id !== c.id).map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.nome}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label={`Excluir ${a.nome}`}
                        disabled={pendente || ar}
                        onClick={() => confirm(`Excluir o anúncio "${a.nome}"? Não dá pra desfazer.`) && fazer({ tipo: "excluir", anuncioId: a.id })}
                        className="p-2 rounded-lg border border-border text-red-600 disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                      </button>
                      {ar && <span className="text-xs text-amber-600">rodando</span>}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

      {camp && camp.conjuntos.length > 0 && (
        <section className={caixa}>
          <h2 className="font-semibold text-sm">Novo conjunto nesta campanha</h2>
          <p className="text-xs text-foreground-muted">Copia o público e a configuração do primeiro conjunto; nasce pausado e vazio — depois é só arrastar os carros pra ele.</p>
          <div className="flex flex-wrap gap-2">
            <input aria-label="Nome do novo conjunto" placeholder="Nome do conjunto" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} className={`${campo} flex-1 min-w-48`} />
            <input aria-label="Orçamento do novo conjunto" placeholder="R$/dia (igual ao modelo)" value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} className={`${campo} w-44`} />
            <button
              type="button"
              disabled={pendente || !novo.nome.trim()}
              onClick={() => {
                fazer({ tipo: "novo-conjunto", modeloId: camp.conjuntos[0].id, nome: novo.nome, centavosPorDia: novo.valor.trim() ? emCentavos(novo.valor) : null });
                setNovo({ nome: "", valor: "" });
              }}
              className="px-3 py-2 rounded-lg border border-accent bg-accent/10 text-sm inline-flex items-center gap-1"
            >
              <Plus size={14} /> Criar conjunto
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
