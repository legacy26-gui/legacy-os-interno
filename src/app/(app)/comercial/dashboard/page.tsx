import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Users,
  UserCheck,
  CalendarClock,
  CalendarCheck,
  CalendarX,
  FileText,
  Handshake,
  Wallet,
  Repeat,
  Timer,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  UserX,
  Plus,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { getComercialDashboard, getVerbaDoMes } from "@/lib/comercial-metrics";
import { getCommercialPanel } from "@/lib/metrics";
import { deleteCommercialEvent } from "@/lib/actions/commercial";
import {
  LEAD_CHANNEL_LABELS,
  LEAD_CHANNEL_COLORS,
  formatCurrency,
  formatDate,
} from "@/lib/labels";
import { AbasComercial } from "../abas";
import { DeleteEventoButton } from "../delete-evento-button";
import { SalesGoalForm } from "../sales-goal-form";
import { VerbaForm } from "./verba-form";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function nomeDoMes(month: string) {
  const [ano, mes] = month.split("-").map(Number);
  return `${MESES[mes - 1]} de ${ano}`;
}

function deslocar(month: string, passos: number) {
  const [ano, mes] = month.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 + passos, 1));
  return d.toISOString().slice(0, 7);
}

const numero = (n: number) => n.toLocaleString("pt-BR");
const dinheiro = (v: number | null) => (v === null ? "—" : formatCurrency(v));
const porcento = (v: number | null) =>
  v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`;
const emMeses = (v: number | null) =>
  v === null ? "—" : `${v.toFixed(1).replace(".", ",")} ${v === 1 ? "mês" : "meses"}`;

export default async function ComercialDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  await requireModuleAccess("comercial");
  const { mes } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(mes ?? "") ? mes! : new Date().toISOString().slice(0, 7);

  const [dados, verba, panel, eventos] = await Promise.all([
    getComercialDashboard(month),
    getVerbaDoMes(month),
    getCommercialPanel(),
    prisma.commercialEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
  ]);

  const m = dados.geral;

  // O funil desenhado: cada etapa comparada com a anterior e com o total de
  // leads, que é a base de tudo.
  const funil = [
    { label: "Leads", valor: m.leads, icone: Users },
    { label: "Leads qualificados", valor: m.qualificados, icone: UserCheck },
    { label: "Reuniões agendadas", valor: m.reunioesAgendadas, icone: CalendarClock },
    { label: "Reuniões realizadas", valor: m.reunioesRealizadas, icone: CalendarCheck },
    { label: "Propostas", valor: m.propostas, icone: FileText },
    { label: "Vendas", valor: m.vendas, icone: Handshake },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Comercial</h1>
          <p className="text-sm text-foreground-muted mt-0.5">Números do funil em {nomeDoMes(month)}</p>
        </div>
        <AbasComercial />
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={`/comercial/dashboard?mes=${deslocar(month, -1)}`}
          className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted"
          title="Mês anterior"
        >
          <ChevronLeft size={16} />
        </Link>
        <span className="text-sm font-medium px-2 first-letter:uppercase">{nomeDoMes(month)}</span>
        <Link
          href={`/comercial/dashboard?mes=${deslocar(month, 1)}`}
          className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted"
          title="Próximo mês"
        >
          <ChevronRight size={16} />
        </Link>
      </div>

      {dados.canaisSemVerba.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-3.5 flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm">
            <span className="font-semibold text-amber-500">
              {dados.canaisSemVerba.map((c) => LEAD_CHANNEL_LABELS[c]).join(", ")} gerou lead sem verba lançada.
            </span>{" "}
            <span className="text-foreground-muted">
              Enquanto o investimento do mês não for preenchido lá embaixo, CPL, custo por reunião e CAC saem sem
              valor em vez de sair errado.
            </span>
          </p>
        </div>
      )}

      {/* ── Topo: o que entrou e o que custou ───────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Indicador icone={Eye} label="Impressões" valor={numero(m.impressoes)} />
        <Indicador icone={Wallet} label="Investimento" valor={formatCurrency(m.investimento)} tom="red" />
        <Indicador icone={Repeat} label="Novo MRR" valor={formatCurrency(m.novoMrr)} tom="emerald" />
        <Indicador
          icone={TrendingUp}
          label="Receita contratada"
          valor={formatCurrency(m.receitaContratada)}
          tom="emerald"
          dica="mensalidade × meses + entrada"
        />
      </div>

      {/* ── O funil desenhado ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">Funil do mês</p>
        {m.leads === 0 && m.reunioesAgendadas === 0 ? (
          <p className="text-sm text-foreground-muted">Nenhum movimento no funil neste mês.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {funil.map((etapa, i) => {
              const base = funil[0].valor;
              const largura = base > 0 ? Math.max(3, (etapa.valor / base) * 100) : 0;
              const anterior = i > 0 ? funil[i - 1].valor : null;
              const conversao = anterior && anterior > 0 ? etapa.valor / anterior : null;
              const Icone = etapa.icone;
              return (
                <div key={etapa.label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-foreground-muted">
                      <Icone size={14} /> {etapa.label}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold">{numero(etapa.valor)}</span>
                      {conversao !== null && (
                        <span className="text-xs text-foreground-muted w-14 text-right">
                          {porcento(conversao)}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-surface-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${largura}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-foreground-muted">
          A porcentagem à direita é a conversão em relação à etapa de cima.
        </p>
      </div>

      {/* ── Custos ──────────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-3">
          Quanto custou cada passo
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Indicador icone={Users} label="CPL" valor={dinheiro(m.cpl)} dica="investimento ÷ leads" />
          <Indicador
            icone={UserCheck}
            label="Custo por lead qualificado"
            valor={dinheiro(m.custoPorQualificado)}
          />
          <Indicador
            icone={CalendarClock}
            label="Custo por reunião agendada"
            valor={dinheiro(m.custoPorReuniaoAgendada)}
          />
          <Indicador
            icone={CalendarCheck}
            label="Custo por reunião realizada"
            valor={dinheiro(m.custoPorReuniaoRealizada)}
          />
          <Indicador icone={Handshake} label="CAC" valor={dinheiro(m.cac)} dica="investimento ÷ vendas" />
          <Indicador
            icone={Timer}
            label="Payback"
            valor={emMeses(m.paybackMeses)}
            dica="meses de mensalidade pra pagar o CAC"
          />
        </div>
      </div>

      {/* ── Taxas ───────────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium mb-3">
          Como o time está convertendo
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Indicador
            icone={UserCheck}
            label="% qualificação"
            valor={porcento(m.taxaQualificacao)}
            dica="qualificados ÷ leads"
          />
          <Indicador
            icone={CalendarCheck}
            label="Show rate"
            valor={porcento(m.showRate)}
            dica="realizadas ÷ agendadas"
          />
          <Indicador icone={CalendarX} label="No-show" valor={numero(m.noShow)} tom={m.noShow > 0 ? "red" : undefined} />
          <Indicador
            icone={Handshake}
            label="Taxa reunião/venda"
            valor={porcento(m.taxaReuniaoVenda)}
            dica="vendas ÷ reuniões realizadas"
          />
        </div>
      </div>

      {/* ── Por canal ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-sm font-medium">Por canal</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Canal</th>
                <th className="px-5 py-3 font-medium text-right">Investido</th>
                <th className="px-5 py-3 font-medium text-right">Leads</th>
                <th className="px-5 py-3 font-medium text-right">CPL</th>
                <th className="px-5 py-3 font-medium text-right hidden md:table-cell">Qualif.</th>
                <th className="px-5 py-3 font-medium text-right hidden lg:table-cell">Reuniões</th>
                <th className="px-5 py-3 font-medium text-right">Vendas</th>
                <th className="px-5 py-3 font-medium text-right">CAC</th>
                <th className="px-5 py-3 font-medium text-right hidden sm:table-cell">Novo MRR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dados.porCanal.map(({ canal, metricas }) => (
                <tr key={canal} className="hover:bg-surface-muted transition-colors">
                  <td className="px-5 py-3">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${LEAD_CHANNEL_COLORS[canal]}`}
                    >
                      {LEAD_CHANNEL_LABELS[canal]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-foreground-muted">
                    {metricas.investimento > 0 ? formatCurrency(metricas.investimento) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-medium">{metricas.leads}</td>
                  <td className="px-5 py-3 text-right">{dinheiro(metricas.cpl)}</td>
                  <td className="px-5 py-3 text-right text-foreground-muted hidden md:table-cell">
                    {metricas.qualificados}
                  </td>
                  <td className="px-5 py-3 text-right text-foreground-muted hidden lg:table-cell">
                    {metricas.reunioesRealizadas} de {metricas.reunioesAgendadas}
                  </td>
                  <td className="px-5 py-3 text-right font-medium">{metricas.vendas}</td>
                  <td className="px-5 py-3 text-right">{dinheiro(metricas.cac)}</td>
                  <td className="px-5 py-3 text-right text-emerald-500 hidden sm:table-cell">
                    {metricas.novoMrr > 0 ? formatCurrency(metricas.novoMrr) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Entrada de impressões e verba ───────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium">Impressões e investimento de {nomeDoMes(month)}</p>
          <p className="text-xs text-foreground-muted mt-0.5">
            É daqui que saem CPL, custo por reunião, CAC e payback. Sem esses números, os custos aparecem como
            &quot;—&quot;.
          </p>
        </div>
        <VerbaForm month={month} linhas={verba} />
      </div>

      {/* ── Meta e eventos (o que já existia) ───────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Indicador icone={ShoppingCart} label="Vendas no mês" valor={panel.mes.vendasQtd.toString()} />
        <Indicador
          icone={TrendingUp}
          label="Valor vendido"
          valor={formatCurrency(panel.mes.vendasValor)}
          tom="emerald"
        />
        <Indicador icone={UserX} label="Churn" valor={panel.mes.churnQtd.toString()} />
        <Indicador
          icone={TrendingDown}
          label="Valor de churn"
          valor={formatCurrency(panel.mes.churnValor)}
          tom="red"
        />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">Meta de vendas do mês</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Meta
            label="Quantidade de vendas"
            atual={panel.mes.vendasQtd}
            alvo={panel.goal.targetSalesQty}
            formata={(n) => n.toString()}
          />
          <Meta
            label="Valor vendido"
            atual={panel.mes.vendasValor}
            alvo={panel.goal.targetSalesValue}
            formata={formatCurrency}
          />
        </div>
        <SalesGoalForm
          month={panel.month}
          currentQty={panel.goal.targetSalesQty}
          currentValue={panel.goal.targetSalesValue}
        />
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-5 pt-5 pb-2 flex items-center justify-between gap-3">
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium">
            Eventos recentes (vendas e churn)
          </p>
          <Link
            href="/comercial/eventos/novo"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline shrink-0"
          >
            <Plus size={14} /> Lançar manualmente
          </Link>
        </div>
        <p className="px-5 pb-3 text-xs text-foreground-muted">
          Cartão que chega em &quot;Fechado&quot; no funil vira venda aqui sozinho, pelo valor da mensalidade.
        </p>
        {eventos.length === 0 ? (
          <p className="text-sm text-foreground-muted px-5 pb-5">Nenhum evento registrado ainda.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {eventos.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                      e.type === "VENDA" ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
                    }`}
                  >
                    {e.type === "VENDA" ? "Venda" : "Churn"}
                  </span>
                  <span className="text-sm truncate">{e.companyName}</span>
                  {e.leadId && (
                    <span className="text-[10px] text-foreground-muted border border-border rounded-full px-2 py-0.5 shrink-0 hidden sm:inline">
                      do funil
                    </span>
                  )}
                  <span className="text-xs text-foreground-muted shrink-0">{formatDate(e.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-medium">{formatCurrency(e.value.toString())}</span>
                  {!e.leadId && (
                    <>
                      <Link
                        href={`/comercial/eventos/${e.id}/editar`}
                        title="Editar"
                        className="p-1.5 rounded-lg hover:bg-surface-muted text-foreground-muted hover:text-foreground"
                      >
                        <Pencil size={14} />
                      </Link>
                      <DeleteEventoButton action={deleteCommercialEvent.bind(null, e.id)} label={e.companyName} />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const TONS: Record<string, string> = {
  emerald: "text-emerald-500",
  red: "text-red-500",
};

function Indicador({
  icone: Icone,
  label,
  valor,
  tom,
  dica,
}: {
  icone: typeof Eye;
  label: string;
  valor: string;
  tom?: "emerald" | "red";
  dica?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 mb-2 text-foreground-muted">
        <Icone size={15} className="shrink-0" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-xl font-semibold ${tom ? TONS[tom] : ""}`}>{valor}</p>
      {dica && <p className="text-[11px] text-foreground-muted mt-1">{dica}</p>}
    </div>
  );
}

function Meta({
  label,
  atual,
  alvo,
  formata,
}: {
  label: string;
  atual: number;
  alvo: number;
  formata: (n: number) => string;
}) {
  const percent = alvo > 0 ? Math.min(100, (atual / alvo) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground-muted">{label}</span>
        <span className="font-medium">
          {formata(atual)} {alvo > 0 ? `de ${formata(alvo)}` : "(sem meta definida)"}
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
        <div
          className={`h-full transition-all ${percent >= 100 ? "bg-emerald-500" : "bg-accent"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
