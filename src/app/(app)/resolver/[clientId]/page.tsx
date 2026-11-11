import Link from "next/link";
import {
  ArrowLeft,
  Video,
  Paintbrush,
  Users,
  AlertTriangle,
  Check,
  Store,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { exigirClienteDaCarteira } from "@/lib/carteira";
import { formatDate } from "@/lib/labels";
import { estadoDaVenda, ESTILO_DO_SELO, ROTULO_DO_TOM } from "@/lib/controle-vendas";
import {
  passoDoComercial,
  diasDesde,
  estadoDaArte,
  ESTILO_DA_ARTE,
  ROTULO_DA_ARTE,
  DIAS_DE_ARTE,
} from "@/lib/resgate";
import { ArteRenovada, PassoComercial } from "./acoes";

// Resolver: a tela de uma loja que parou de vender.
//
// São três motivos, e a tela responde os três de cima pra baixo: faltou
// vídeo? a arte cansou? o comercial travou? Cada bloco diz há quanto tempo e
// oferece a ação daquele motivo — e mais nada, pra a pessoa não precisar
// decidir por onde começar.
//
// Não inventa diagnóstico: mostra as datas e deixa quem conhece a loja
// decidir. Sistema que adivinha o motivo erra e ensina a equipe a ignorá-lo.

export const metadata = { title: "Resolver" };

export default async function ResolverPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const user = await requireModuleAccess("gestao-contas");
  const { clientId } = await params;

  // 404 pro que não é da carteira — a lista filtrada não protege a ficha.
  const cliente = await exigirClienteDaCarteira(user, clientId, {
    id: true,
    companyName: true,
    city: true,
    state: true,
    startDate: true,
    createdAt: true,
    ultimaArteEm: true,
    manager: { select: { name: true } },
  });

  const hoje = new Date();
  const [ultimaVenda, ultimaGravacao, resgates] = await Promise.all([
    prisma.clientSale.findFirst({
      where: { clientId },
      orderBy: { soldAt: "desc" },
      select: { soldAt: true, value: true },
    }),
    prisma.gravacao.findFirst({
      where: { clientId, entregueEm: { not: null } },
      orderBy: { entregueEm: "desc" },
      select: { gravadoEm: true, entregueEm: true, quantidade: true },
    }),
    prisma.acaoDeResgate.findMany({
      where: { clientId },
      orderBy: { quando: "desc" },
      take: 8,
      select: {
        id: true,
        tipo: true,
        quando: true,
        observacao: true,
        avisados: true,
        quem: { select: { name: true } },
      },
    }),
  ]);

  const venda = estadoDaVenda(
    ultimaVenda?.soldAt ?? null,
    cliente.startDate ?? cliente.createdAt,
    hoje
  );
  const escada = passoDoComercial(venda.dias);

  const diasSemVideo = diasDesde(ultimaGravacao?.entregueEm ?? null, hoje);
  const diasComAArte = diasDesde(cliente.ultimaArteEm, hoje);
  const arte = estadoDaArte(diasComAArte);

  // Uma ação do comercial só conta se foi DEPOIS da última venda: contato de
  // três meses atrás não resolve a parada de agora.
  const desdeAParada = ultimaVenda?.soldAt ?? cliente.startDate ?? cliente.createdAt;
  const feitosNaParada = resgates.filter((r) => r.quando > desdeAParada);
  const contatoFeito = feitosNaParada.find((r) => r.tipo === "CONTATO");
  const reuniaoFeita = feitosNaParada.find((r) => r.tipo === "REUNIAO");
  const passoJaFeito =
    (escada.passo === "contato" && (contatoFeito || reuniaoFeita)) ||
    (escada.passo === "reuniao" && reuniaoFeita);

  const onde = [cliente.city, cliente.state].filter(Boolean).join("/");

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <Link
        href="/controle-vendas"
        className="self-start inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> Voltar ao controle
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold flex items-center gap-2 min-w-0">
            <Store size={20} className="text-accent shrink-0" />
            <span className="truncate">{cliente.companyName}</span>
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            {onde && `${onde} · `}
            {cliente.manager?.name ? `gestor ${cliente.manager.name.split(" ")[0]}` : "sem gestor"}
          </p>
        </div>
        <span
          className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 ${ESTILO_DO_SELO[venda.tom]}`}
        >
          {venda.tom === "critico" && <AlertTriangle size={12} />}
          {ROTULO_DO_TOM[venda.tom]} · {venda.texto}
        </span>
      </div>

      <p className="text-sm text-foreground-muted">
        Três coisas fazem uma loja parar de vender. Confira as três de cima
        pra baixo.
      </p>

      {/* ── 1. Vídeos ────────────────────────────────────────────────── */}
      <Bloco
        numero={1}
        icone={<Video size={15} className="text-indigo-500" />}
        titulo="Vídeos"
        estado={
          diasSemVideo === null
            ? { texto: "Nenhuma entrega registrada", tom: "ruim" }
            : diasSemVideo >= 15
              ? { texto: `Última entrega há ${diasSemVideo} dias`, tom: "ruim" }
              : { texto: `Última entrega há ${diasSemVideo} dias`, tom: "bom" }
        }
        detalhe={
          ultimaGravacao
            ? `Gravado em ${formatDate(ultimaGravacao.gravadoEm)} · ${ultimaGravacao.quantidade} ${ultimaGravacao.quantidade === 1 ? "carro" : "carros"}`
            : "Nenhuma gravação com entrega confirmada pra esta loja."
        }
      >
        <Link
          href="/gravacoes"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
        >
          <Video size={13} /> Agendar gravação
        </Link>
      </Bloco>

      {/* ── 2. Arte ──────────────────────────────────────────────────── */}
      <Bloco
        numero={2}
        icone={<Paintbrush size={15} className="text-fuchsia-500" />}
        titulo="Arte"
        estado={{
          texto:
            diasComAArte === null
              ? "Nunca renovada"
              : `Mesma arte há ${diasComAArte} ${diasComAArte === 1 ? "dia" : "dias"}`,
          tom: arte === "gasta" || arte === "nunca" ? "ruim" : arte === "envelhecendo" ? "meio" : "bom",
        }}
        selo={<span className={`text-[11px] px-2 py-0.5 rounded-full ${ESTILO_DA_ARTE[arte]}`}>{ROTULO_DA_ARTE[arte]}</span>}
        detalhe={
          cliente.ultimaArteEm
            ? `Renovada em ${formatDate(cliente.ultimaArteEm)}. A casa considera gasta a partir de ${DIAS_DE_ARTE} dias.`
            : `Nunca foi marcada uma renovação. A casa considera gasta a partir de ${DIAS_DE_ARTE} dias.`
        }
      >
        <ArteRenovada
          clientId={cliente.id}
          dataForm={cliente.ultimaArteEm ? cliente.ultimaArteEm.toISOString().slice(0, 10) : ""}
        />
      </Bloco>

      {/* ── 3. Comercial ─────────────────────────────────────────────── */}
      <Bloco
        numero={3}
        icone={<Users size={15} className="text-cyan-500" />}
        titulo="Comercial"
        estado={{
          texto: passoJaFeito ? "Passo da vez já feito" : escada.titulo,
          tom: passoJaFeito ? "bom" : escada.passo === "reuniao" ? "ruim" : escada.passo === "contato" ? "meio" : "bom",
        }}
        detalhe={escada.explicacao}
      >
        {passoJaFeito ? (
          <p className="text-sm text-emerald-500 flex items-center gap-1.5">
            <Check size={14} className="shrink-0" />
            {escada.passo === "reuniao"
              ? `Reunião registrada em ${formatDate(reuniaoFeita!.quando)}${reuniaoFeita!.quem ? ` por ${reuniaoFeita!.quem.name.split(" ")[0]}` : ""}. ${
                  reuniaoFeita!.avisados > 0
                    ? "Guilherme avisado no celular, Andrielli nos alertas."
                    : "Andrielli avisada nos alertas. O celular do Guilherme não tocou — avise por fora."
                }`
              : `Contato registrado em ${formatDate((contatoFeito ?? reuniaoFeita)!.quando)}.`}
          </p>
        ) : (
          <PassoComercial clientId={cliente.id} passo={escada.passo} />
        )}
      </Bloco>

      {resgates.length > 0 && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <p className="px-4 py-2.5 border-b border-border text-xs uppercase tracking-wide text-foreground-muted font-medium">
            O que já foi feito nesta loja
          </p>
          <div className="flex flex-col divide-y divide-border/60">
            {resgates.map((r) => (
              <div key={r.id} className="px-4 py-2 text-sm">
                <span className="font-medium">
                  {r.tipo === "REUNIAO" ? "Reunião" : "Contato"}
                </span>
                <span className="text-foreground-muted">
                  {" · "}
                  {formatDate(r.quando)}
                  {r.quem && ` · ${r.quem.name.split(" ")[0]}`}
                  {r.observacao && ` — ${r.observacao}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Bloco({
  numero,
  icone,
  titulo,
  estado,
  detalhe,
  selo,
  children,
}: {
  numero: number;
  icone: React.ReactNode;
  titulo: string;
  estado: { texto: string; tom: "bom" | "meio" | "ruim" };
  detalhe: string;
  selo?: React.ReactNode;
  children: React.ReactNode;
}) {
  const cor =
    estado.tom === "ruim"
      ? "text-red-400"
      : estado.tom === "meio"
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-500";

  return (
    <div
      className={`rounded-2xl border bg-surface p-5 ${
        estado.tom === "ruim" ? "border-red-500/40" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-5 h-5 rounded-full bg-surface-muted text-[11px] font-bold flex items-center justify-center text-foreground-muted shrink-0">
          {numero}
        </span>
        {icone}
        <h2 className="font-semibold">{titulo}</h2>
        {selo}
      </div>
      <p className={`text-sm font-medium mt-2 ${cor}`}>{estado.texto}</p>
      <p className="text-xs text-foreground-muted mt-0.5">{detalhe}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
