"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  HelpCircle,
  MessageSquareQuote,
  Target,
  TrendingUp,
  Ban,
  Play,
  Repeat,
  ArrowUpRight,
  ShoppingBag,
  Clock,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { regenerarDiagnostico, salvarNotasReuniao } from "@/lib/actions/onboarding";
import {
  CATEGORIA_COMERCIAL_LABELS,
  type Diagnostico,
  type Acao,
} from "@/lib/ai/diagnostico-schema";

export interface AnaliseSerializada {
  id: string;
  kind: "PRE_DIAGNOSTICO" | "PLANO_FINAL";
  version: number;
  status: "PROCESSANDO" | "CONCLUIDO" | "ERRO";
  model: string;
  promptVersion: string;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  diagnostico: Diagnostico | null;
}

const PRIORIDADE_CLASSES: Record<string, string> = {
  alta: "bg-red-500/15 text-red-500",
  media: "bg-amber-500/15 text-amber-500",
  baixa: "bg-surface-muted text-foreground-muted",
};

const CONFIANCA_CLASSES: Record<string, string> = {
  alto: "bg-emerald-500/15 text-emerald-500",
  medio: "bg-amber-500/15 text-amber-500",
  baixo: "bg-surface-muted text-foreground-muted",
};

function quando(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function Secao({
  icon: Icon,
  titulo,
  children,
  tom = "neutro",
}: {
  icon: typeof Sparkles;
  titulo: string;
  children: React.ReactNode;
  tom?: "neutro" | "verde" | "vermelho" | "ambar";
}) {
  const cor =
    tom === "verde"
      ? "text-emerald-500"
      : tom === "vermelho"
        ? "text-red-500"
        : tom === "ambar"
          ? "text-amber-500"
          : "text-accent";
  return (
    <section className="flex flex-col gap-3">
      <h3 className={`text-xs uppercase tracking-wide font-semibold flex items-center gap-1.5 ${cor}`}>
        <Icon size={13} /> {titulo}
      </h3>
      {children}
    </section>
  );
}

function ListaAcoes({ titulo, acoes }: { titulo: string; acoes: Acao[] }) {
  return (
    <div className="rounded-xl border border-border p-4 flex flex-col gap-3">
      <p className="text-sm font-semibold flex items-center gap-2">
        <Clock size={13} className="text-foreground-muted" /> {titulo}
        <span className="text-xs font-normal text-foreground-muted">({acoes.length})</span>
      </p>
      {acoes.length === 0 ? (
        <p className="text-xs text-foreground-muted">Nada previsto para esta janela.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {acoes.map((a, i) => (
            <li key={i} className="flex flex-col gap-1 border-t border-border pt-3 first:border-0 first:pt-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{a.acao}</p>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${PRIORIDADE_CLASSES[a.prioridade]}`}
                >
                  {a.prioridade}
                </span>
              </div>
              <p className="text-xs text-foreground-muted">{a.motivo}</p>
              <p className="text-xs text-foreground-muted">
                <span className="font-medium">Quem:</span> {a.responsavel_sugerido} ·{" "}
                <span className="font-medium">Medir por:</span> {a.indicador}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Conteudo({ d }: { d: Diagnostico }) {
  return (
    <div className="flex flex-col gap-7">
      <Secao icon={Sparkles} titulo="Resumo executivo">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{d.resumo_executivo}</p>
      </Secao>

      {d.numeros_principais.length > 0 && (
        <Secao icon={TrendingUp} titulo="Números principais">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {d.numeros_principais.map((n, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface-muted/40 p-3.5">
                <p className="text-[10px] uppercase tracking-wide text-foreground-muted font-medium">{n.indicador}</p>
                <p className="text-lg font-semibold mt-1">{n.valor}</p>
                {n.observacao && <p className="text-xs text-foreground-muted mt-1">{n.observacao}</p>}
              </div>
            ))}
          </div>
        </Secao>
      )}

      {d.pontos_positivos.length > 0 && (
        <Secao icon={CheckCircle2} titulo="Pontos positivos" tom="verde">
          <ul className="flex flex-col gap-1.5">
            {d.pontos_positivos.map((p, i) => (
              <li key={i} className="text-sm flex gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                {p}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {d.gargalos.length > 0 && (
        <Secao icon={AlertTriangle} titulo="Gargalos" tom="vermelho">
          <div className="flex flex-col gap-3">
            {d.gargalos.map((g, i) => (
              <div key={i} className="rounded-xl border border-red-500/25 bg-red-500/5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{g.nome}</p>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${CONFIANCA_CLASSES[g.nivel_confianca]}`}
                  >
                    confiança {g.nivel_confianca}
                  </span>
                </div>
                <p className="text-xs text-foreground-muted mt-1.5">
                  <span className="font-medium">Evidência:</span> {g.evidencia}
                </p>
                <p className="text-xs text-foreground-muted mt-1">
                  <span className="font-medium">Impacto:</span> {g.impacto}
                </p>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {d.oportunidades.length > 0 && (
        <Secao icon={Lightbulb} titulo="Oportunidades" tom="ambar">
          <div className="flex flex-col gap-3">
            {d.oportunidades.map((o, i) => (
              <div key={i} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{o.oportunidade}</p>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${PRIORIDADE_CLASSES[o.prioridade]}`}
                  >
                    {o.prioridade}
                  </span>
                </div>
                <p className="text-xs text-foreground-muted mt-1.5">{o.motivo}</p>
                <p className="text-xs mt-1">
                  <span className="text-foreground-muted">Impacto potencial:</span> {o.impacto_potencial}
                </p>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {d.hipoteses_resolvidas && d.hipoteses_resolvidas.length > 0 && (
        <Secao icon={CheckCircle2} titulo="O que a reunião resolveu" tom="verde">
          <div className="flex flex-col gap-2">
            {d.hipoteses_resolvidas.map((h, i) => (
              <div key={i} className="rounded-xl border border-border p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">{h.hipotese}</p>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      h.conclusao === "confirmada"
                        ? "bg-emerald-500/15 text-emerald-500"
                        : h.conclusao === "descartada"
                          ? "bg-surface-muted text-foreground-muted"
                          : "bg-amber-500/15 text-amber-500"
                    }`}
                  >
                    {h.conclusao.replace("_", " ")}
                  </span>
                </div>
                <p className="text-xs text-foreground-muted mt-1">{h.base}</p>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {d.hipoteses.length > 0 && (
        <Secao icon={HelpCircle} titulo="Hipóteses para validar">
          <div className="flex flex-col gap-2">
            {d.hipoteses.map((h, i) => (
              <div key={i} className="rounded-xl border border-dashed border-border p-3.5">
                <p className="text-sm">{h.hipotese}</p>
                <p className="text-xs text-foreground-muted mt-1">
                  <span className="font-medium">Como validar:</span> {h.como_validar}
                </p>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {d.perguntas_onboarding.length > 0 && (
        <Secao icon={MessageSquareQuote} titulo="Perguntas para a reunião">
          <ol className="flex flex-col gap-2">
            {d.perguntas_onboarding.map((p, i) => (
              <li key={i} className="text-sm flex gap-2.5">
                <span className="text-xs font-semibold text-accent shrink-0 mt-0.5">{i + 1}.</span>
                {p}
              </li>
            ))}
          </ol>
        </Secao>
      )}

      <Secao icon={Target} titulo="Plano de ação">
        <div className="grid lg:grid-cols-2 gap-3">
          <ListaAcoes titulo="Primeiros 7 dias" acoes={d.plano_acao.primeiros_7_dias} />
          <ListaAcoes titulo="Primeiros 30 dias" acoes={d.plano_acao.primeiros_30_dias} />
          <ListaAcoes titulo="30 a 60 dias" acoes={d.plano_acao.dias_30_60} />
          <ListaAcoes titulo="60 a 90 dias" acoes={d.plano_acao.dias_60_90} />
        </div>
      </Secao>

      <Secao icon={Repeat} titulo="Parar / Começar / Manter / Aumentar">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(
            [
              ["Parar", d.decisoes.parar, Ban, "text-red-500"],
              ["Começar", d.decisoes.comecar, Play, "text-emerald-500"],
              ["Manter", d.decisoes.manter, Repeat, "text-foreground-muted"],
              ["Aumentar", d.decisoes.aumentar, ArrowUpRight, "text-accent"],
            ] as const
          ).map(([titulo, itens, Icone, cor]) => (
            <div key={titulo} className="rounded-xl border border-border p-4">
              <p className={`text-xs font-semibold flex items-center gap-1.5 mb-2 ${cor}`}>
                <Icone size={13} /> {titulo}
              </p>
              {itens.length === 0 ? (
                <p className="text-xs text-foreground-muted">—</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {itens.map((t, i) => (
                    <li key={i} className="text-xs leading-relaxed">
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Secao>

      {d.alertas.length > 0 && (
        <Secao icon={AlertTriangle} titulo="Alertas" tom="ambar">
          <ul className="flex flex-col gap-2">
            {d.alertas.map((a, i) => (
              <li key={i} className="text-sm flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                {a}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {d.oportunidades_comerciais.length > 0 && (
        <Secao icon={ShoppingBag} titulo="Oportunidades comerciais (o que a Legacy pode vender)">
          <div className="flex flex-col gap-2">
            {d.oportunidades_comerciais.map((o, i) => (
              <div key={i} className="rounded-xl border border-border p-3.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                    {CATEGORIA_COMERCIAL_LABELS[o.categoria]}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRIORIDADE_CLASSES[o.prioridade]}`}
                  >
                    {o.prioridade}
                  </span>
                </div>
                <p className="text-sm font-medium mt-2">{o.oportunidade}</p>
                <p className="text-xs text-foreground-muted mt-1">
                  <span className="font-medium">Evidência:</span> {o.evidencia}
                </p>
              </div>
            ))}
          </div>
        </Secao>
      )}

      <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
        <p className="text-xs uppercase tracking-wide text-accent font-semibold flex items-center gap-1.5">
          <ChevronRight size={13} /> Próximo passo
        </p>
        <p className="text-sm mt-1.5">{d.proximo_passo}</p>
      </div>
    </div>
  );
}

export interface ParSerializado {
  ultima: AnaliseSerializada | null;
  concluida: AnaliseSerializada | null;
}

export function DiagnosticoPanel({
  onboardingId,
  pre,
  final,
  meetingNotes,
}: {
  onboardingId: string;
  pre: ParSerializado;
  final: ParSerializado;
  meetingNotes: string | null;
}) {
  const router = useRouter();
  const [aba, setAba] = useState<"pre" | "final">(final.concluida ? "final" : "pre");
  const [pendente, startTransition] = useTransition();

  const par = aba === "final" ? final : pre;
  const tentativa = par.ultima; // pode estar processando ou ter dado erro
  const conteudo = par.concluida; // o que a equipe lê
  const processando =
    pre.ultima?.status === "PROCESSANDO" || final.ultima?.status === "PROCESSANDO";

  // Enquanto a IA está gerando, a tela se atualiza sozinha até terminar.
  useEffect(() => {
    if (!processando) return;
    const t = setInterval(() => router.refresh(), 6000);
    return () => clearInterval(t);
  }, [processando, router]);

  function gerar(kind: "PRE_DIAGNOSTICO" | "PLANO_FINAL") {
    startTransition(async () => {
      await regenerarDiagnostico(onboardingId, kind);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setAba("pre")}
            className={`text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
              aba === "pre" ? "bg-accent text-accent-foreground" : "border border-border hover:bg-surface-muted"
            }`}
          >
            Pré-diagnóstico{pre.concluida ? ` · v${pre.concluida.version}` : ""}
          </button>
          <button
            type="button"
            onClick={() => setAba("final")}
            className={`text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
              aba === "final" ? "bg-accent text-accent-foreground" : "border border-border hover:bg-surface-muted"
            }`}
          >
            Plano de ação final{final.concluida ? ` · v${final.concluida.version}` : ""}
          </button>
        </div>

        <button
          type="button"
          onClick={() => gerar(aba === "final" ? "PLANO_FINAL" : "PRE_DIAGNOSTICO")}
          disabled={pendente || processando}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-border hover:bg-surface-muted disabled:opacity-60"
        >
          {pendente || processando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {conteudo ? "Regenerar análise" : "Gerar análise"}
        </button>
      </div>

      {conteudo && (
        <p className="text-xs text-foreground-muted">
          {`Gerado em ${quando(conteudo.completedAt ?? conteudo.createdAt)} · versão ${conteudo.version} · ${conteudo.model} · prompt ${conteudo.promptVersion}`}
        </p>
      )}

      {/* Estados: processando, erro, vazio, pronto */}
      {tentativa?.status === "PROCESSANDO" && (
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-6 flex items-center gap-3">
          <Loader2 size={18} className="animate-spin text-accent shrink-0" />
          <div>
            <p className="text-sm font-medium">A IA está analisando a operação...</p>
            <p className="text-xs text-foreground-muted mt-0.5">
              Costuma levar menos de um minuto. Esta tela se atualiza sozinha quando terminar.
            </p>
          </div>
        </div>
      )}

      {tentativa?.status === "ERRO" && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <p className="text-sm font-medium text-red-500 flex items-center gap-2">
            <AlertTriangle size={15} /> A última geração falhou ({quando(tentativa.createdAt)})
          </p>
          <p className="text-xs text-foreground-muted mt-1.5">{tentativa.error}</p>
          <p className="text-xs text-foreground-muted mt-2">
            As respostas do formulário estão salvas normalmente — só a análise não foi gerada. Pode tentar de novo pelo
            botão acima.
            {conteudo && " Abaixo continua a última análise que deu certo."}
          </p>
        </div>
      )}

      {!tentativa && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-sm text-foreground-muted">
            {aba === "final"
              ? "O plano final é gerado depois da reunião, com o resumo do que foi conversado (campo abaixo)."
              : "Nenhuma análise gerada ainda para esta ficha."}
          </p>
        </div>
      )}

      {conteudo?.diagnostico && <Conteudo d={conteudo.diagnostico} />}

      {conteudo && !conteudo.diagnostico && (
        <p className="text-sm text-foreground-muted">
          Esta análise foi gerada num formato antigo e não pode mais ser exibida. Gere de novo pelo botão acima.
        </p>
      )}

      {/* Reunião de onboarding → plano de ação final */}
      <details className="rounded-xl border border-border p-4" open={aba === "final" && !final.concluida}>
        <summary className="cursor-pointer text-sm font-medium">Reunião de onboarding</summary>
        <form action={salvarNotasReuniao.bind(null, onboardingId)} className="mt-4 flex flex-col gap-2">
          <p className="text-xs text-foreground-muted">
            Cole aqui o resumo ou a transcrição da reunião. É isso que a IA usa pra confirmar ou derrubar as hipóteses e
            transformar o pré-diagnóstico em plano de ação final.
          </p>
          <textarea
            name="meetingNotes"
            rows={6}
            defaultValue={meetingNotes ?? ""}
            placeholder="O que o cliente contou na reunião, números que ele corrigiu, o que ficou combinado..."
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="text-xs font-medium px-3.5 py-2 rounded-lg border border-border hover:bg-surface-muted"
            >
              Salvar resumo da reunião
            </button>
            <button
              type="button"
              onClick={() => {
                setAba("final");
                gerar("PLANO_FINAL");
              }}
              disabled={pendente || processando || !meetingNotes}
              title={!meetingNotes ? "Salve o resumo da reunião primeiro" : undefined}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Sparkles size={14} /> Gerar plano de ação final
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
