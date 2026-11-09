import Link from "next/link";
import { Car, ArrowRight, Store } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { filtroDeClientes, marcaParaTodos } from "@/lib/vendas-permitidas";
import { formatCurrency } from "@/lib/labels";
import { MarcarVendaForm, type LojaDaLista } from "./formulario";
import { ApagarVenda } from "./apagar-venda";

// Marcar venda — o caminho curto de quem está na operação.
//
// A venda já podia ser lançada pela ficha do cliente, na Gestão de Contas. O
// problema é que lá se chega pela lista de todos os clientes, e quem marca
// venda o dia inteiro não quer navegar: quer escolher a loja e pôr o valor.
//
// Quem vê o quê está em src/lib/vendas-permitidas.ts — e a mesma regra que
// monta a lista é a que confere o que chega do navegador.

export const metadata = { title: "Marcar venda" };

export default async function MarcarVendaPage() {
  const user = await requireModuleAccess("gestao-contas");
  const permitidas = filtroDeClientes(user);
  const todas = marcaParaTodos(user);

  const [lojas, ultimas] = await Promise.all([
    prisma.client.findMany({
      where: permitidas,
      select: { id: true, companyName: true, city: true, state: true },
      orderBy: { companyName: "asc" },
    }),
    // As últimas marcadas, pra a pessoa ver que entrou e poder desfazer o
    // engano na hora. Só das lojas que ela pode ver — a lista de vendas não
    // pode virar uma janela pra carteira dos outros.
    prisma.clientSale.findMany({
      where: { client: permitidas },
      select: {
        id: true,
        value: true,
        soldAt: true,
        description: true,
        createdById: true,
        client: { select: { companyName: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  const paraLista: LojaDaLista[] = lojas.map((l) => ({
    id: l.id,
    nome: l.companyName,
    onde: [l.city, l.state].filter(Boolean).join("/") || null,
  }));

  const hoje = new Date().toISOString().slice(0, 10);
  const dia = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Car size={20} className="text-accent" /> Marcar venda
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            {todas
              ? `Escolha a loja e lance a venda — todas as ${lojas.length} lojas.`
              : `Escolha a loja e lance a venda — ${lojas.length === 1 ? "sua 1 loja" : `suas ${lojas.length} lojas`}.`}
          </p>
        </div>
        <Link
          href="/controle-vendas"
          className="text-xs font-medium px-3 py-2 rounded-lg border border-border bg-surface-muted hover:bg-border/60 transition-colors inline-flex items-center gap-1.5 shrink-0"
        >
          Ver o controle <ArrowRight size={12} />
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        {lojas.length === 0 ? (
          <div className="text-center py-6">
            <Store size={28} className="mx-auto text-foreground-muted" />
            <p className="mt-3 font-medium">Nenhuma loja na sua carteira</p>
            <p className="text-sm text-foreground-muted mt-1">
              Quando um cliente for colocado sob sua gestão, ele aparece aqui pra marcar venda.
            </p>
          </div>
        ) : (
          <MarcarVendaForm lojas={paraLista} hoje={hoje} />
        )}
      </div>

      {ultimas.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
              Últimas vendas marcadas
            </p>
          </div>
          <div className="flex flex-col divide-y divide-border/60">
            {ultimas.map((v) => (
              <div key={v.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {v.client.companyName}
                    <span className="ml-2 text-xs font-normal text-foreground-muted">
                      {dia(v.soldAt)}
                    </span>
                  </p>
                  <p className="text-xs text-foreground-muted truncate">
                    {formatCurrency(Number(v.value))}
                    {v.createdBy && ` · por ${v.createdBy.name.split(" ")[0]}`}
                    {v.description && ` · ${v.description}`}
                  </p>
                </div>
                {/* Só quem marcou pode desfazer. Para as outras o botão nem
                    aparece — e o servidor confere de novo de qualquer jeito. */}
                {v.createdById === user.id && (
                  <ApagarVenda saleId={v.id} loja={v.client.companyName} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-foreground-muted">
        A loja é escolhida da lista, nunca digitada — o que se digita serve só
        pra achar. É o que impede a mesma loja de entrar escrita de três jeitos
        diferentes e o controle passar a contar errado.
        {!todas && " Você vê aqui as lojas que estão sob a sua gestão."}
      </p>
    </div>
  );
}
