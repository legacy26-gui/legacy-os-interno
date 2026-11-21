import Link from "next/link";
import {
  ClipboardList,
  PartyPopper,
  ExternalLink,
  AlertTriangle,
  Car,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { veTodaACarteira } from "@/lib/carteira";
import {
  estadoDaVenda,
  DIAS_VERMELHO,
  DIAS_CRITICO,
} from "@/lib/controle-vendas";
import { diaDaCasaComoData, segundaDaSemana } from "@/lib/dia-da-casa";
import { montarPainelDoDia } from "@/lib/meta/painel-do-dia";
import { zapiConfigurado } from "@/lib/whatsapp/zapi";
import { LinhaDoCliente, type ClienteDoDia } from "./linha-do-cliente";
import type { RevisaoDeHoje } from "../gestao-contas/[id]/daily-review-form";
import { BlocoMetaDoDia } from "./bloco-meta";
import { BlocoDoRobo } from "./bloco-robo";
import { BlocoRelatorios } from "./bloco-relatorios";
import { oQueORoboFez } from "@/lib/meta/o-que-o-robo-fez";
import { relatoriosQueFalharam } from "@/lib/whatsapp/robo-dos-relatorios";

// Meu Dia: a carteira do gestor numa tela só.
//
// Mudou de ideia em relação ao que era: antes era um cartão grande por
// cliente, com o formulário da revisão dentro. Pra ver o décimo cliente a
// pessoa rolava a página — e o que não se vê não se cobra. Agora cada cliente
// é uma linha baixa, e a carteira inteira aparece de uma vez.
//
// Duas informações por linha, e só:
//   a caixinha do dia  — "passei por aqui hoje"
//   os dias sem vender — nas mesmas cores do Controle de Vendas
//
// Em cima da lista, o que a CONTA DE ANÚNCIO tem a dizer hoje: loja sem
// saldo, verba fora do combinado, arte cansada. Isso vivia a dois cliques
// daqui, numa tela que o gestor abria quando lembrava — e "quando lembrava"
// é a parte que não funciona, porque conta zerada para a campanha no mesmo
// dia e arte cansada estraga o mês em silêncio.

// Quem vê a casa inteira (dono e gerência: o Guilherme e a Andrielli) escolhe
// de quem é o Meu Dia que está olhando, com o placar de cada uma no topo. A
// gestora de tráfego continua vendo só o dela: `?de=` de outra pessoa é
// ignorado pra ela.

export default async function MeuDiaPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string }>;
}) {
  // requireModuleAccess e não getCurrentUser: é ele que confere a empresa
  // aberta. Esta tela lista cliente de loja, então é da agência.
  const user = await requireModuleAccess("clientes");
  const hoje = new Date();
  const hoje0 = diaDaCasaComoData();
  const { de } = await searchParams;

  // ── De quem é o dia que está na tela ─────────────────────────────────
  const veTodas = veTodaACarteira(user);
  const equipe = veTodas
    ? await prisma.user.findMany({
        where: {
          active: true,
          managedClients: { some: { status: { not: "CANCELADO" } } },
        },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              managedClients: { where: { status: { not: "CANCELADO" } } },
            },
          },
        },
        orderBy: { name: "asc" },
      })
    : [];
  const conferidosHojeNaCasa = veTodas
    ? await prisma.clienteConferido.findMany({
        where: { dia: hoje0, client: { status: { not: "CANCELADO" } } },
        select: { client: { select: { managerId: true } } },
      })
    : [];
  const conferidosPorPessoa = new Map<string, number>();
  for (const { client } of conferidosHojeNaCasa) {
    const m = client.managerId;
    if (m) conferidosPorPessoa.set(m, (conferidosPorPessoa.get(m) ?? 0) + 1);
  }
  // Quem está na tela: a pessoa pedida (se quem pede vê todas e ela existe na
  // equipe), senão a própria carteira; pra quem vê todas e não tem carteira, a
  // primeira da equipe.
  const pedida = veTodas && de ? equipe.find((p) => p.id === de) ?? null : null;
  const temCarteira = !veTodas || equipe.some((p) => p.id === user.id);
  const dono = pedida ?? (temCarteira ? { id: user.id, name: user.name } : equipe[0] ?? { id: user.id, name: user.name });
  const donoId = dono.id;
  const ehOMeu = donoId === user.id;

  const [clients, vendas, conferidos, revisoesDeHoje] = await Promise.all([
    prisma.client.findMany({
      where: { managerId: donoId, status: { not: "CANCELADO" } },
      select: {
        id: true,
        companyName: true,
        startDate: true,
        createdAt: true,
        controlaVendas: true,
        // As observações da loja — senha, verba combinada — pra quem abre o
        // cliente no Meu Dia já ter na frente o que precisa pra falar com
        // ela, em vez de ir buscar na ficha a dois cliques daqui.
        internalNotes: true,
        pinnedInfo: {
          select: { label: true, value: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { companyName: "asc" },
    }),
    // A última venda de cada loja — é ela que dá a cor, igual no Controle.
    prisma.clientSale.groupBy({ by: ["clientId"], _max: { soldAt: true } }),
    // Quem já foi conferido hoje.
    prisma.clienteConferido.findMany({
      where: { dia: hoje0, client: { managerId: donoId } },
      select: { clientId: true, quem: { select: { name: true } } },
    }),
    // O que já foi preenchido HOJE. Sem isto o formulário voltava vazio logo
    // depois de salvar, e quem reabria depois do almoço não sabia se já
    // tinha passado por ali — e remarcava.
    prisma.dailyReview.findMany({
      where: { createdAt: { gte: hoje0 }, client: { managerId: donoId } },
      orderBy: { createdAt: "asc" },
      select: {
        clientId: true,
        checkedWhatsappResolved: true,
        notes: true,
        createdAt: true,
        reviewer: { select: { name: true } },
      },
    }),
  ]);

  // O Meta entra DEPOIS da lista de clientes porque precisa dos ids dela. É
  // uma rodada a mais de consulta, e não dá pra juntar com as de cima.
  const idsDaCarteira = clients.map((c) => c.id);
  const [painelMeta, roboFez, falhasDoRobo] = await Promise.all([
    montarPainelDoDia(idsDaCarteira, hoje),
    // O que o robô do WhatsApp mexeu. Mesma carteira: cada gestor vê o que
    // foi feito NAS LOJAS DELE, e de mais ninguém.
    oQueORoboFez(idsDaCarteira, hoje),
    // Lojas que o robô dos relatórios tentou e desistiu nesta semana. Sem
    // isto elas somem da fila dele sem avisar ninguém, e o cliente fica sem
    // relatório, calado, até cobrar.
    relatoriosQueFalharam(idsDaCarteira, hoje),
  ]);

  // ── Os relatórios da semana ──────────────────────────────────────────
  //
  // Só lojas com conta de anúncio vinculada: sem conta não há número, e sem
  // número não há relatório pra mandar. Listá-las aqui só daria uma
  // pendência que ninguém consegue resolver nesta tela.
  const semana = segundaDaSemana(hoje);
  const [lojasComConta, jaEnviados] = await Promise.all([
    prisma.client.findMany({
      where: {
        managerId: donoId,
        status: { not: "CANCELADO" },
        metaAdAccounts: { some: { active: true } },
      },
      select: { id: true, companyName: true, whatsappGrupoId: true },
      orderBy: { companyName: "asc" },
    }),
    prisma.relatorioEnviado.findMany({
      where: { semana, client: { managerId: donoId } },
      select: { clientId: true },
    }),
  ]);
  const enviados = new Set(jaEnviados.map((e) => e.clientId));

  // O dia da semana no fuso da casa, pra saber quando "pendente" vira
  // "atrasado". `segundaDaSemana` já devolve meia-noite UTC do dia certo, e
  // a diferença em dias entre hoje e ela dá 0 na segunda, 1 na terça...
  const diaDaSemana =
    1 +
    Math.round(
      (diaDaCasaComoData(hoje).getTime() - semana.getTime()) / 86_400_000,
    );

  const ultimaVenda = new Map(vendas.map((v) => [v.clientId, v._max.soldAt]));
  const conferidosPorId = new Map(conferidos.map((c) => [c.clientId, c]));

  // Várias revisões no mesmo dia viram UMA: as marcações se somam (quem
  // marcou de manhã não "desmarca" marcando de novo à tarde) e as
  // observações se empilham na ordem em que foram escritas.
  const revisaoPorId = new Map<string, RevisaoDeHoje>();
  for (const r of revisoesDeHoje) {
    const antes = revisaoPorId.get(r.clientId);
    const marcados = new Set(antes?.marcados ?? []);
    if (r.checkedWhatsappResolved) marcados.add("checkedWhatsappResolved");
    const notas =
      [antes?.notas, r.notes?.trim()].filter(Boolean).join("\n\n") || null;
    revisaoPorId.set(r.clientId, {
      marcados: [...marcados],
      notas,
      // Quem e quando são do PRIMEIRO registro do dia: a pergunta é "já
      // passaram por aqui hoje?", e quem passou primeiro é quem responde.
      quem: antes?.quem ?? r.reviewer?.name?.split(" ")[0] ?? null,
      hora:
        antes?.hora ??
        r.createdAt.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Sao_Paulo",
        }),
    });
  }

  const linhas: ClienteDoDia[] = clients.map((c) => {
    // Sem venda nenhuma, a conta parte de quando a loja entrou — mesma regra
    // do Controle de Vendas, mesma função.
    const estado = estadoDaVenda(
      ultimaVenda.get(c.id) ?? null,
      c.startDate ?? c.createdAt,
      hoje,
    );
    const conferido = conferidosPorId.get(c.id);
    return {
      id: c.id,
      companyName: c.companyName,
      conferidoHoje: !!conferido,
      conferidoPor: conferido?.quem?.name?.split(" ")[0] ?? null,
      observacoes: c.internalNotes,
      fixadas: c.pinnedInfo,
      revisaoDeHoje: revisaoPorId.get(c.id) ?? null,
      diasSemVender: estado.dias,
      tomDaVenda: estado.tom,
      textoDaVenda: estado.texto,
      controlaVendas: c.controlaVendas,
    };
  });

  // A ordem: primeiro quem falta conferir, e dentro disso quem está há mais
  // tempo sem vender. É a fila do dia, de cima pra baixo.
  // Conta fora do Controle de Vendas não tem "dias sem vender" pra ordenar:
  // consórcio e banco não vendem carro, e deixá-los subir na fila pelo número
  // empurraria pra baixo as lojas que de fato pararam.
  const diasQueContam = (l: ClienteDoDia) =>
    l.controlaVendas ? l.diasSemVender : -1;
  linhas.sort(
    (a, b) =>
      Number(a.conferidoHoje) - Number(b.conferidoHoje) ||
      diasQueContam(b) - diasQueContam(a) ||
      a.companyName.localeCompare(b.companyName),
  );

  const total = linhas.length;
  const feitos = linhas.filter((l) => l.conferidoHoje).length;
  const tudoFeito = total > 0 && feitos === total;
  const porcento = total > 0 ? Math.round((feitos / total) * 100) : 0;

  const urgentes = linhas.filter(
    (l) => l.controlaVendas && l.diasSemVender >= DIAS_CRITICO,
  );
  const atencao = linhas.filter(
    (l) =>
      l.controlaVendas &&
      l.diasSemVender >= DIAS_VERMELHO &&
      l.diasSemVender < DIAS_CRITICO,
  );

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ClipboardList size={20} className="text-accent" /> Meu Dia
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          {ehOMeu ? (
            <>
              Sua carteira inteira — {user.name.split(" ")[0]}. Marque a caixinha de
              cada cliente que você falou hoje. A setinha abre as observações da
              loja e o que ficou combinado.
            </>
          ) : (
            <>
              Você está vendo o dia da <strong>{dono.name.split(" ")[0]}</strong>: a
              carteira dela, o que já foi conferido hoje e o que falta.
            </>
          )}
        </p>
      </div>

      {/* Dono e gerência: o placar de cada uma, e um clique abre o dia dela. */}
      {equipe.length > 0 && (
        <nav className="flex flex-wrap gap-2" aria-label="De quem é o Meu Dia">
          {equipe.map((p) => {
            const totalDela = p._count.managedClients;
            const feitosDela = Math.min(conferidosPorPessoa.get(p.id) ?? 0, totalDela);
            const fechou = totalDela > 0 && feitosDela === totalDela;
            const ativa = p.id === donoId;
            return (
              <Link
                key={p.id}
                href={p.id === user.id ? "/meu-dia" : `/meu-dia?de=${p.id}`}
                aria-current={ativa ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  ativa
                    ? "border-accent bg-accent/10 text-foreground font-semibold"
                    : "border-border bg-surface text-foreground-muted hover:text-foreground"
                }`}
              >
                {p.id === user.id ? "Eu" : p.name.split(" ")[0]}
                <span
                  className={`tabular-nums text-xs ${
                    fechou ? "text-emerald-500 font-semibold" : ""
                  }`}
                >
                  {feitosDela}/{totalDela}
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* O que não pode passar batido vem antes da lista. */}
      <BlocoMetaDoDia painel={painelMeta} />

      {/* O robô fala no grupo da loja, não com a gente. Sem isto aqui, a
          única forma de saber o que ele andou desligando seria entrar nos
          grupos — e ação automática que ninguém revê vira aposta. */}
      <BlocoDoRobo oQueFez={roboFez} />

      {/* Os relatórios aparecem a partir de segunda e ficam até o último ser
          marcado. Antes de segunda não há o que mandar: a semana ainda está
          acontecendo. */}
      <BlocoRelatorios
        lojas={lojasComConta.map((l) => ({
          id: l.id,
          nome: l.companyName,
          enviado: enviados.has(l.id),
          temGrupo: !!l.whatsappGrupoId,
        }))}
        diaDaSemana={diaDaSemana}
        zapiLigado={zapiConfigurado()}
        falhasDoRobo={falhasDoRobo}
      />

      {urgentes.length > 0 && (
        <div className="rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-red-500 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              {urgentes.length} {urgentes.length === 1 ? "loja" : "lojas"} há{" "}
              {DIAS_CRITICO} dias ou mais sem vender — resolver hoje:{" "}
              <span className="font-normal">
                {urgentes.map((u) => u.companyName).join(", ")}
              </span>
            </span>
          </p>
        </div>
      )}
      {atencao.length > 0 && (
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
            <Car size={15} className="shrink-0 mt-0.5" />
            <span>
              {atencao.length} passando de {DIAS_VERMELHO} dias sem vender:{" "}
              <span className="text-foreground-muted">
                {atencao.map((a) => a.companyName).join(", ")}
              </span>
            </span>
          </p>
        </div>
      )}

      {/* A barra é o placar do dia, e por isso é grande: o número tem que
          ser lido de longe, antes de a pessoa começar a rolar a lista. */}
      {total > 0 && (
        <div
          className={`rounded-2xl border p-5 ${
            tudoFeito
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-border bg-surface"
          }`}
        >
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <p
                className={`text-4xl font-black leading-none ${
                  tudoFeito ? "text-emerald-500" : "text-foreground"
                }`}
              >
                {porcento}%
              </p>
              <p className="text-sm text-foreground-muted mt-1.5">
                {feitos} de {total} conferidos hoje
              </p>
            </div>
            {tudoFeito && (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-500">
                <PartyPopper size={18} /> Carteira fechada
              </span>
            )}
          </div>
          <div className="h-4 rounded-full bg-surface-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                tudoFeito ? "bg-emerald-500" : "bg-accent"
              }`}
              style={{ width: `${porcento}%` }}
            />
          </div>
          {!tudoFeito && (
            <p className="text-xs text-foreground-muted mt-2">
              Faltam {total - feitos}. Não fecha o dia com cliente sem conferir.
            </p>
          )}
        </div>
      )}

      {total === 0 ? (
        <p className="text-sm text-foreground-muted rounded-xl border border-border bg-surface p-8 text-center">
          {ehOMeu
            ? "Nenhum cliente atribuído a você ainda. Fale com seu gestor para receber sua carteira."
            : `Nenhum cliente atribuído à ${dono.name.split(" ")[0]}.`}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {linhas.map((l) => (
            <LinhaDoCliente key={l.id} cliente={l} />
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="flex flex-col gap-1.5">
          <Link
            href="/controle-vendas"
            className="self-start inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground"
          >
            <Car size={14} /> Ver o controle de vendas das suas lojas
          </Link>
          <Link
            href="/gestao-contas"
            className="self-start inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground"
          >
            <ExternalLink size={14} /> Revisão semanal, relatórios e histórico
            completo
          </Link>
        </div>
      )}
    </div>
  );
}
