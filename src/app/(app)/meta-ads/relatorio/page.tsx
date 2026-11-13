import Link from "next/link";
import { ArrowLeft, FileBarChart, AlertTriangle } from "lucide-react";
import { Voltar } from "@/components/voltar";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CARTEIRA, escopoDaCarteira, clienteEDaCarteira, veTodaACarteira } from "@/lib/carteira";
import { lerIntervalo, reais, numero, textoDaData, diaCurto } from "@/lib/meta/insights";
import { montarRelatorio } from "@/lib/meta/relatorio";
import { FormDoRelatorio } from "./form";
import { BotaoImagem } from "./imprimir";

// O relatório que vai pro dono da loja.
//
// ── Por que quatro números e não catorze ──────────────────────────────────
//
// Investido, leads, custo por lead e visualizações. Foi o Guilherme quem
// escolheu, e está certo: quem lê é dono de loja de carro, não gestor de
// tráfego. CTR e alcance não ajudam ele a decidir nada — só fazem o que
// importa competir por atenção com o que não importa.
//
// A tela interna continua mostrando tudo. São leitores diferentes, e misturar
// os dois seria servir mal aos dois.
//
// ── Por que é uma página e não um arquivo ────────────────────────────────
//
// Porque "Imprimir" no navegador já salva em PDF, e porque assim dá pra
// mexer no desenho sem refazer geração de arquivo. O Guilherme vai mandar o
// layout padrão dele — quando chegar, muda só o visual, e a conta por baixo
// continua a mesma.

export const maxDuration = 60;

type Busca = {
  loja?: string;
  periodo?: string;
  de?: string;
  ate?: string;
};

export default async function RelatorioPage({
  searchParams,
}: {
  searchParams: Promise<Busca>;
}) {
  const user = await requireModuleAccess("clientes");
  const busca = await searchParams;
  const periodo = lerIntervalo(busca);

  const lojas = await prisma.client.findMany({
    where: { ...CARTEIRA, ...escopoDaCarteira(user) },
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      manager: { select: { name: true } },
      _count: { select: { metaAdAccounts: true } },
    },
  });

  // Sem loja escolhida: só o formulário.
  if (!busca.loja) {
    return (
      <div className="flex flex-col gap-5 max-w-3xl">
        <Cabecalho />
        <FormDoRelatorio
          lojas={lojas.map((l) => ({
            id: l.id,
            nome: l.companyName,
            gestor: l.manager?.name ?? null,
            temConta: l._count.metaAdAccounts > 0,
          }))}
          mostrarGestor={veTodaACarteira(user)}
          lojaAtual=""
          periodoAtual={periodo.chave}
          deAtual={periodo.de && !periodo.chave ? textoDaData(periodo.de) : ""}
          ateAtual={periodo.ate && !periodo.chave ? textoDaData(periodo.ate) : ""}
        />
      </div>
    );
  }

  // A loja vem da URL: confere contra a carteira antes de qualquer número.
  if (!(await clienteEDaCarteira(user, busca.loja))) {
    return (
      <div className="flex flex-col gap-4 max-w-2xl">
        <Cabecalho />
        <p className="text-sm text-foreground-muted rounded-xl border border-border bg-surface p-8 text-center">
          Essa loja não está na sua lista.
        </p>
      </div>
    );
  }

  const r = await montarRelatorio(busca.loja, periodo);
  if (!r) return <p className="text-sm text-foreground-muted">Loja não encontrada.</p>;

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      {/* Tudo com print:hidden some na impressão: no papel fica só o
          relatório, que é o que vai pro cliente. */}
      <div className="print:hidden flex flex-col gap-5">
        <Cabecalho />
        <FormDoRelatorio
          lojas={lojas.map((l) => ({
            id: l.id,
            nome: l.companyName,
            gestor: l.manager?.name ?? null,
            temConta: l._count.metaAdAccounts > 0,
          }))}
          mostrarGestor={veTodaACarteira(user)}
          lojaAtual={busca.loja}
          periodoAtual={periodo.chave}
          deAtual={periodo.de && !periodo.chave ? textoDaData(periodo.de) : ""}
          ateAtual={periodo.ate && !periodo.chave ? textoDaData(periodo.ate) : ""}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-foreground-muted">
            Confira abaixo e baixe a imagem pra mandar no WhatsApp da loja.
          </p>
          <BotaoImagem
            endereco={`/api/meta-ads/relatorio?${new URLSearchParams({
              loja: busca.loja,
              ...(busca.periodo ? { periodo: busca.periodo } : {}),
              ...(busca.de ? { de: busca.de } : {}),
              ...(busca.ate ? { ate: busca.ate } : {}),
            })}`}
            nome={`${r.loja.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.png`}
          />
        </div>
      </div>

      {!r.temDados ? (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 print:hidden">
          <p className="text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              Esta loja ainda não teve uma leitura boa da Meta — ou não tem conta vinculada, ou a
              última busca falhou. Um relatório com R$ 0,00 em tudo é pior que relatório nenhum,
              então não gerei. Abra a loja em Meta Ads e aperte “Atualizar agora”.
            </span>
          </p>
        </div>
      ) : (
        <Folha
          relatorio={r}
          periodo={
            // Datas de verdade e não "7 dias": o relatório vai pro cliente, e
            // "5 a 12 de nov" é conferível — "7 dias" depende de saber quando
            // o papel foi impresso.
            periodo.vidaInteira || !periodo.de || !periodo.ate
              ? periodo.rotulo
              : periodo.de.getTime() === periodo.ate.getTime()
                ? diaCurto(periodo.de)
                : `${diaCurto(periodo.de)} a ${diaCurto(periodo.ate)}`
          }
        />
      )}
    </div>
  );
}

function Cabecalho() {
  return (
    <div>
      <Voltar href="/meta-ads">Meta Ads</Voltar>
      <h1 className="text-xl font-semibold flex items-center gap-2 mt-2">
        <FileBarChart size={20} className="text-accent" /> Relatório para o cliente
      </h1>
      <p className="text-sm text-foreground-muted mt-0.5">
        Escolha a loja, o período e o detalhe. O relatório sai pronto pra mandar.
      </p>
    </div>
  );
}

/**
 * A folha do relatório.
 *
 * Fundo branco e texto escuro FIXOS, não os tons do sistema: isto vira papel
 * ou imagem, e tema escuro no papel sai um borrão de tinta.
 */
function Folha({
  relatorio: r,
  periodo,
}: {
  relatorio: NonNullable<Awaited<ReturnType<typeof montarRelatorio>>>;
  periodo: string;
}) {
  return (
    <div className="bg-white text-zinc-900 rounded-2xl border border-border print:border-0 print:rounded-none overflow-hidden">
      <div className="bg-zinc-900 text-white px-8 py-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.25em] text-zinc-400 font-medium">
            LEGACY<span className="text-indigo-400">OS</span> · TRÁFEGO PAGO
          </p>
          <h2 className="text-2xl font-semibold mt-1.5">{r.loja}</h2>
          <p className="text-sm text-zinc-400 mt-0.5">{periodo}</p>
        </div>
        {r.fotoDeCapa && (
          // A arte do anúncio que mais rodou: dá cara ao relatório e mostra
          // ao dono da loja o que de fato foi ao ar no dinheiro dele.
          <img
            src={r.fotoDeCapa}
            alt=""
            width={72}
            height={72}
            referrerPolicy="no-referrer"
            className="w-18 h-18 rounded-xl object-cover border border-white/20 shrink-0"
          />
        )}
      </div>

      {/* Os quatro números. Grandes, porque é o que a pessoa vai olhar. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-zinc-200 border-b border-zinc-200">
        <Numero titulo="Investido" valor={reais(r.total.spendCents)} />
        <Numero titulo="Leads" valor={numero(r.total.leads)} destaque />
        <Numero
          titulo="Custo por lead"
          valor={r.cplTotal === null ? "—" : reais(r.cplTotal)}
        />
        <Numero titulo="Visualizações" valor={numero(r.total.impressions)} />
      </div>

      {r.linhas.length > 0 && (
        <div className="px-8 py-6">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium mb-3">
Por campanha
          </p>
          <div className="flex flex-col divide-y divide-zinc-200">
            {r.linhas.map((l) => (
              <div key={l.id} className="py-3 flex items-center gap-3">
                <span className="flex-1 min-w-0 text-sm font-medium truncate">{l.nome}</span>
                <span className="text-sm tabular-nums text-right w-24 shrink-0">
                  {reais(l.spendCents)}
                </span>
                <span className="text-sm tabular-nums text-right w-16 shrink-0 font-semibold">
                  {l.leads > 0 ? numero(l.leads) : "—"}
                </span>
                <span className="text-sm tabular-nums text-right w-24 shrink-0 text-zinc-500">
                  {l.cpl === null ? "—" : `${reais(l.cpl)}/lead`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-8 py-4 border-t border-zinc-200 text-[11px] text-zinc-500 leading-relaxed">
        Lead é cada pessoa que entrou em contato pelo anúncio. Visualizações é quantas vezes o
        anúncio apareceu na tela de alguém. Valores em reais, direto da conta de anúncio.
        {r.gestor && <> Gestor responsável: {r.gestor.split(" ")[0]}.</>}
      </div>
    </div>
  );
}

function Numero({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className="px-5 py-5">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">{titulo}</p>
      <p
        className={`text-2xl font-semibold mt-1 tabular-nums ${
          destaque ? "text-indigo-600" : "text-zinc-900"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}
