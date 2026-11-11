import Link from "next/link";
import { ClipboardList, PartyPopper, ExternalLink, AlertTriangle, Car } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { estadoDaVenda, DIAS_VERMELHO, DIAS_CRITICO } from "@/lib/controle-vendas";
import { diaDaCasaComoData, ehDiaDaFoto } from "@/lib/dia-da-casa";
import { LinhaDoCliente, type ClienteDoDia } from "./linha-do-cliente";

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

export default async function MeuDiaPage() {
  // requireModuleAccess e não getCurrentUser: é ele que confere a empresa
  // aberta. Esta tela lista cliente de loja, então é da agência.
  const user = await requireModuleAccess("clientes");
  const hoje = new Date();
  const hoje0 = diaDaCasaComoData();

  const [clients, vendas, conferidos] = await Promise.all([
    prisma.client.findMany({
      where: { managerId: user.id, status: { not: "CANCELADO" } },
      select: {
        id: true,
        companyName: true,
        startDate: true,
        createdAt: true,
        controlaVendas: true,
      },
      orderBy: { companyName: "asc" },
    }),
    // A última venda de cada loja — é ela que dá a cor, igual no Controle.
    prisma.clientSale.groupBy({ by: ["clientId"], _max: { soldAt: true } }),
    // Quem já foi conferido hoje.
    prisma.clienteConferido.findMany({
      where: { dia: hoje0, client: { managerId: user.id } },
      select: { clientId: true, fotoUrl: true, quem: { select: { name: true } } },
    }),
  ]);

  const ultimaVenda = new Map(vendas.map((v) => [v.clientId, v._max.soldAt]));
  const conferidosPorId = new Map(conferidos.map((c) => [c.clientId, c]));
  const diaDaFoto = ehDiaDaFoto();

  const linhas: ClienteDoDia[] = clients.map((c) => {
    // Sem venda nenhuma, a conta parte de quando a loja entrou — mesma regra
    // do Controle de Vendas, mesma função.
    const estado = estadoDaVenda(ultimaVenda.get(c.id) ?? null, c.startDate ?? c.createdAt, hoje);
    const conferido = conferidosPorId.get(c.id);
    return {
      id: c.id,
      companyName: c.companyName,
      conferidoHoje: !!conferido,
      conferidoPor: conferido?.quem?.name?.split(" ")[0] ?? null,
      temFoto: !!conferido?.fotoUrl,
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
  const diasQueContam = (l: ClienteDoDia) => (l.controlaVendas ? l.diasSemVender : -1);
  linhas.sort(
    (a, b) =>
      Number(a.conferidoHoje) - Number(b.conferidoHoje) ||
      diasQueContam(b) - diasQueContam(a) ||
      a.companyName.localeCompare(b.companyName)
  );

  const total = linhas.length;
  const feitos = linhas.filter((l) => l.conferidoHoje).length;
  const tudoFeito = total > 0 && feitos === total;
  const porcento = total > 0 ? Math.round((feitos / total) * 100) : 0;

  const urgentes = linhas.filter((l) => l.controlaVendas && l.diasSemVender >= DIAS_CRITICO);
  const atencao = linhas.filter(
    (l) => l.controlaVendas && l.diasSemVender >= DIAS_VERMELHO && l.diasSemVender < DIAS_CRITICO
  );

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ClipboardList size={20} className="text-accent" /> Meu Dia
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Sua carteira inteira — {user.name.split(" ")[0]}. Marque a caixinha de cada cliente que
          você olhou hoje.{" "}
          {diaDaFoto && (
            <strong className="text-amber-600 dark:text-amber-400">
              Hoje é segunda: a caixinha pede a foto da campanha.
            </strong>
          )}
        </p>
      </div>

      {/* O que não pode passar batido vem antes da lista. */}
      {urgentes.length > 0 && (
        <div className="rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-red-500 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              {urgentes.length} {urgentes.length === 1 ? "loja" : "lojas"} há {DIAS_CRITICO} dias ou
              mais sem vender — resolver hoje:{" "}
              <span className="font-normal">{urgentes.map((u) => u.companyName).join(", ")}</span>
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
            tudoFeito ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-surface"
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
                {diaDaFoto && " · segunda é dia de foto"}
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
          Nenhum cliente atribuído a você ainda. Fale com seu gestor para receber sua carteira.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {linhas.map((l) => (
            <LinhaDoCliente key={l.id} cliente={l} diaDaFoto={diaDaFoto} />
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
            <ExternalLink size={14} /> Revisão semanal, relatórios e histórico completo
          </Link>
        </div>
      )}
    </div>
  );
}
