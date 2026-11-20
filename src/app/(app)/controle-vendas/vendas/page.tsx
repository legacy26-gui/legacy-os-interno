import Link from "next/link";
import { Car, Plus, Receipt, Search, Store } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { canAccessModule } from "@/lib/permissions";
import { veTodaACarteira } from "@/lib/carteira";
import { filtroDeClientes } from "@/lib/vendas-permitidas";
import { formatCurrency } from "@/lib/labels";
import { lerIntervalo, type Atalho } from "@/lib/meta/insights";
import { agruparPorDia, faixaDeDatas, somarVendas } from "@/lib/controle-vendas";
import { SeletorDePeriodo } from "@/components/seletor-de-periodo";
import { AbasDoControle } from "../abas";

// Venda a venda — o extrato.
//
// ── A pergunta desta tela ────────────────────────────────────────────────
//
// "O que foi vendido, da mais recente pra mais antiga, quanto deu em cada
// data e quantas foram." É a pergunta do Guilherme, e é diferente da aba de
// ao lado: lá a unidade é a LOJA ("quem parou de vender"), aqui é a VENDA.
//
// ── Por que agrupado por dia ─────────────────────────────────────────────
//
// Porque ele pediu o total "de respectivas datas", e porque uma lista corrida
// de 200 vendas não responde "como foi terça". O cabeçalho de cada dia traz a
// quantidade e o valor daquele dia; a faixa de cima traz o período inteiro,
// igual ao Meta Ads faz com o gasto.
//
// ── Por que o mesmo seletor do Meta Ads ──────────────────────────────────
//
// Porque é o mesmo gesto: escolher o período que se quer olhar. Um seletor
// com cara diferente pra fazer a mesma coisa é duas coisas pra aprender em
// vez de uma. Ganha de carona "este mês", "mês passado" e o intervalo à mão.
//
// O padrão aqui é 30 dias, e não os 7 da lista do Meta: loja de carro vende
// alguns por mês, e 7 dias numa loja média mostraria uma lista quase vazia.

export const metadata = { title: "Venda a venda" };

/** 30 dias: o período em que uma loja de carro tem volume pra ler. */
const PADRAO_DAS_VENDAS: Atalho = "30";

/**
 * Teto de linhas numa página.
 *
 * Existe pra "vida inteira" numa agência com anos de histórico não virar uma
 * página de dez mil linhas que trava o navegador de quem clicou sem querer.
 * Quando bate no teto a tela DIZ que bateu — lista cortada em silêncio vira
 * total errado na cabeça de quem lê.
 */
const TETO = 500;

export default async function VendaAVendaPage({
  searchParams,
}: {
  searchParams: Promise<{
    periodo?: string;
    de?: string;
    ate?: string;
    q?: string;
  }>;
}) {
  const user = await requireModuleAccess("gestao-contas");
  const podeVerValores = canAccessModule(user.role, "financeiro");
  const vêTudo = veTodaACarteira(user);
  const { periodo, de, ate, q } = await searchParams;

  const intervalo = lerIntervalo({ periodo, de, ate }, PADRAO_DAS_VENDAS);
  const faixa = faixaDeDatas(intervalo);

  // O mesmo filtro que decide de quem a pessoa pode MARCAR venda decide de
  // quem ela pode VER venda. Se discordassem, esta tela viraria uma janela
  // pra carteira dos outros — e seria a janela mais fácil de não perceber,
  // porque ninguém confere uma lista achando que ela está errada.
  const where = {
    client: {
      ...filtroDeClientes(user),
      ...(q
        ? { companyName: { contains: q, mode: "insensitive" as const } }
        : {}),
    },
    // Vida inteira não tem corte: `faixaDeDatas` devolve `{}` e o `soldAt`
    // nem entra no `where`.
    ...(faixa.gte || faixa.lte ? { soldAt: faixa } : {}),
  };

  const [cruas, quantas] = await Promise.all([
    prisma.clientSale.findMany({
      where,
      select: {
        id: true,
        value: true,
        adSpend: true,
        soldAt: true,
        description: true,
        client: { select: { id: true, companyName: true } },
        createdBy: { select: { name: true } },
        origem: true,
      },
      // A data manda; o lançamento desempata. Duas vendas no mesmo dia saem
      // com a lançada por último em cima, que é a que a pessoa acabou de pôr
      // e quer conferir.
      orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }],
      take: TETO,
    }),
    prisma.clientSale.count({ where }),
  ]);

  // Decimal do banco vira número aqui, num lugar só: daqui pra frente é tudo
  // aritmética comum, e nenhuma soma mistura os dois tipos.
  const vendas = cruas.map((v) => ({
    ...v,
    value: Number(v.value),
    adSpend: Number(v.adSpend),
  }));

  const total = somarVendas(vendas);
  const dias = agruparPorDia(vendas);
  const cortou = quantas > vendas.length;

  const manter: Record<string, string> = q ? { q } : {};

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Car size={19} className="text-accent" /> Controle de vendas
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Cada venda lançada, da mais recente pra mais antiga, com o total de
            cada dia.
            {!vêTudo && " Aqui estão as lojas sob a sua gestão."}
          </p>
        </div>
        <Link
          href="/marcar-venda"
          className="text-xs font-medium px-3 py-2 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 shrink-0"
        >
          <Plus size={13} /> Marcar venda
        </Link>
      </div>

      <AbasDoControle ativa="/controle-vendas/vendas" />

      <SeletorDePeriodo
        caminho="/controle-vendas/vendas"
        manter={manter}
        atalhoAtivo={intervalo.chave}
        deAtual={de ?? ""}
        ateAtual={ate ?? ""}
      />

      {/* A faixa de cima: o período inteiro de uma olhada, igual ao Meta Ads
          faz com o gasto. */}
      <div
        className={`grid grid-cols-2 gap-3 ${
          podeVerValores ? "lg:grid-cols-4" : "lg:grid-cols-2"
        }`}
      >
        <Numero titulo="Vendas" valor={String(total.qtd)} legenda={intervalo.rotulo} />
        {podeVerValores && (
          <Numero
            titulo="Valor vendido"
            valor={formatCurrency(total.total)}
            legenda={intervalo.rotulo}
            destaque
          />
        )}
        {podeVerValores && (
          <Numero
            titulo="Ticket médio"
            valor={total.ticket === null ? "—" : formatCurrency(total.ticket)}
            legenda="por venda"
          />
        )}
        {podeVerValores && (
          <Numero
            titulo="Custo por venda"
            valor={
              total.custoPorVenda === null
                ? "—"
                : formatCurrency(total.custoPorVenda)
            }
            legenda={`${formatCurrency(total.investido)} em anúncio`}
          />
        )}
        {!podeVerValores && (
          <Numero
            titulo="Dias com venda"
            valor={String(dias.length)}
            legenda={intervalo.rotulo}
          />
        )}
      </div>

      <form className="relative max-w-sm">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
        />
        <input
          name="q"
          defaultValue={q}
          placeholder="Filtrar por loja..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        {/* O período escolhido sobrevive à busca: filtrar por loja não pode
            jogar a pessoa de volta pros 30 dias sem ela pedir. */}
        {periodo && <input type="hidden" name="periodo" value={periodo} />}
        {de && <input type="hidden" name="de" value={de} />}
        {ate && <input type="hidden" name="ate" value={ate} />}
      </form>

      {cortou && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Mostrando as {vendas.length} mais recentes de {quantas} vendas no
          período. Os números da faixa de cima são só destas {vendas.length} —
          escolha um período menor pra ver o total certo.
        </p>
      )}

      {dias.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface text-center py-16 text-foreground-muted">
          <Receipt size={28} className="mx-auto mb-2 opacity-40" />
          <p className="font-medium">Nenhuma venda {intervalo.rotulo.toLowerCase()}</p>
          <p className="text-sm mt-1">
            {q
              ? "Nenhuma loja com esse nome vendeu neste período."
              : "Quando alguém marcar uma venda, ela aparece aqui."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {dias.map((d) => (
            <div
              key={d.chave}
              className="rounded-2xl border border-border bg-surface overflow-hidden"
            >
              {/* O cabeçalho do dia: a data e, do outro lado, quanto aquele
                  dia deu. É o "total das respectivas datas". */}
              <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 bg-surface-muted/50">
                <p className="text-sm font-semibold">
                  {diaPorExtenso(d.dia)}
                  <span className="ml-2 text-xs font-normal text-foreground-muted">
                    {d.qtd === 1 ? "1 venda" : `${d.qtd} vendas`}
                  </span>
                </p>
                {podeVerValores && (
                  <p className="text-sm font-semibold whitespace-nowrap">
                    {formatCurrency(d.total)}
                  </p>
                )}
              </div>

              <div className="divide-y divide-border/60">
                {d.vendas.map((v) => (
                  <div
                    key={v.id}
                    className="px-5 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/gestao-contas/${v.client.id}`}
                        className="text-sm font-medium hover:text-accent hover:underline"
                      >
                        {v.client.companyName}
                      </Link>
                      <p className="text-xs text-foreground-muted truncate mt-0.5">
                        {v.description || "Sem descrição"}
                        {v.createdBy &&
                          ` · por ${v.createdBy.name.split(" ")[0]}`}
                        {v.origem === "robo-whatsapp" && " · pelo robô do WhatsApp"}
                      </p>
                    </div>
                    {podeVerValores && (
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium whitespace-nowrap">
                          {formatCurrency(v.value)}
                        </p>
                        {v.adSpend > 0 && (
                          <p className="text-[11px] text-foreground-muted whitespace-nowrap mt-0.5">
                            {formatCurrency(v.adSpend)} em anúncio
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-foreground-muted flex items-center gap-1.5">
        <Store size={13} />
        As vendas saem do Marcar Venda e da ficha do cliente. Loja que não é de
        carro não entra aqui — essas ficam fora do controle, na aba ao lado.
      </p>
    </div>
  );
}

/** Um número da faixa de cima. */
function Numero({
  titulo,
  valor,
  legenda,
  destaque,
}: {
  titulo: string;
  valor: string;
  legenda: string;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
        {titulo}
      </p>
      <p
        className={`text-2xl font-semibold mt-2 ${destaque ? "text-accent" : ""}`}
      >
        {valor}
      </p>
      <p className="text-[11px] text-foreground-muted mt-0.5">{legenda}</p>
    </div>
  );
}

/**
 * "segunda-feira, 17 de novembro".
 *
 * Em UTC pelo mesmo motivo de `formatDate` e do agrupamento: `soldAt` é data
 * pura, e ler no fuso de quem olha faria o dia 17 virar 16 em Brasília.
 */
function diaPorExtenso(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
