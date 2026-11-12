import Link from "next/link";
import { Megaphone, AlertTriangle, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CARTEIRA, escopoDaCarteira, veTodaACarteira } from "@/lib/carteira";
import {
  saldoEmReais,
  tempoDesde,
  estadoDoSaldo,
  COR_DO_SALDO,
  SALDO_BAIXO,
} from "@/lib/meta/saldo";
import { BotaoAtualizarTudo } from "./atualizar-tudo";

// Meta Ads: a carteira inteira numa tela, loja por loja, com o saldo de cada
// conta de anúncio.
//
// Pra que serve: saldo pré-pago é número que vence. Conta que zera para a
// campanha no meio do dia, e loja com campanha parada é loja sem lead amanhã —
// e ninguém descobre isso olhando conta por conta no Gerenciador da Meta.
//
// "Cada um só vê o seu": o recorte é o mesmo do resto do sistema
// (escopoDaCarteira). Gestor de tráfego vê as lojas dele, direção vê a casa.
// Quem não enxerga a loja não vê a conta nem o saldo dela.
//
// A ordem é UMA: nome da loja, de A a Z. Lista que se reordena pelo saldo
// embaralha a tela a cada atualização, e aí ninguém acha a loja que veio
// procurar. A urgência vem da cor e do aviso no topo, não da posição.

// A varredura é uma chamada de rede por conta, em sequência.
export const maxDuration = 300;

export default async function MetaAdsPage() {
  const user = await requireModuleAccess("clientes");

  const clientes = await prisma.client.findMany({
    where: { ...CARTEIRA, ...escopoDaCarteira(user) },
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      manager: { select: { name: true } },
      metaAdAccounts: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          metaAccountId: true,
          isPrepay: true,
          lastSyncedAt: true,
          lastSyncError: true,
          balanceSnapshots: {
            orderBy: { capturedAt: "desc" },
            take: 1,
            select: { availableCents: true, capturedAt: true },
          },
        },
      },
    },
  });

  const comConta = clientes.filter((c) => c.metaAdAccounts.length > 0);
  const semConta = clientes.filter((c) => c.metaAdAccounts.length === 0);

  // Quem está acabando. Só conta pré-paga com leitura boa entra: conta sem
  // saldo lido não é conta com saldo baixo, e juntar as duas faria o aviso
  // gritar por um erro de leitura.
  const acabando = comConta.flatMap((c) =>
    c.metaAdAccounts
      .filter((a) => a.isPrepay && a.balanceSnapshots[0])
      .filter((a) => a.balanceSnapshots[0].availableCents < SALDO_BAIXO)
      .map((a) => ({
        loja: c.companyName,
        clientId: c.id,
        centavos: a.balanceSnapshots[0].availableCents,
      }))
  );

  const vePorGestor = veTodaACarteira(user);

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Megaphone size={20} className="text-accent" /> Meta Ads
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Saldo pré-pago (Pix) de cada conta de anúncio.{" "}
            {vePorGestor ? "Todas as lojas da casa." : "Suas lojas."}
          </p>
        </div>
        <BotaoAtualizarTudo />
      </div>

      {/* O que não pode passar batido vem antes da lista — mesmo jeito do
          Meu Dia. */}
      {acabando.length > 0 && (
        <div className="rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-red-500 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              {acabando.length} {acabando.length === 1 ? "conta" : "contas"} com saldo acabando:{" "}
              <span className="font-normal">
                {acabando
                  .map((a) => `${a.loja} (${saldoEmReais(a.centavos)})`)
                  .join(", ")}
              </span>
            </span>
          </p>
        </div>
      )}

      {/* O placar de quanto da carteira já foi cadastrada: é isso que diz se
          falta alguém pra colocar. */}
      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <p className="text-sm">
          <strong>{comConta.length}</strong> de <strong>{clientes.length}</strong>{" "}
          {clientes.length === 1 ? "loja" : "lojas"} com conta de anúncio vinculada
          {semConta.length > 0 && (
            <span className="text-foreground-muted"> · {semConta.length} ainda sem</span>
          )}
        </p>
      </div>

      {clientes.length === 0 ? (
        <p className="text-sm text-foreground-muted rounded-xl border border-border bg-surface p-8 text-center">
          Nenhuma loja na sua carteira ainda.
        </p>
      ) : (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-foreground-muted text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Loja</th>
                  {vePorGestor && (
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Gestor</th>
                  )}
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Conta</th>
                  <th className="px-4 py-3 font-medium text-right">Saldo</th>
                  <th className="px-4 py-3 font-medium text-right hidden md:table-cell">
                    Atualizado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clientes.map((c) =>
                  c.metaAdAccounts.length === 0 ? (
                    <tr key={c.id} className="hover:bg-surface-muted transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/clientes/${c.id}`} className="font-medium hover:text-accent">
                          {c.companyName}
                        </Link>
                      </td>
                      {vePorGestor && (
                        <td className="px-4 py-3 text-foreground-muted hidden lg:table-cell">
                          {c.manager?.name?.split(" ")[0] ?? "—"}
                        </td>
                      )}
                      <td colSpan={3} className="px-4 py-3">
                        <Link
                          href={`/clientes/${c.id}`}
                          className="inline-flex items-center gap-1.5 text-foreground-muted hover:text-accent"
                        >
                          <Plus size={13} /> vincular conta
                        </Link>
                      </td>
                    </tr>
                  ) : (
                    c.metaAdAccounts.map((a, i) => {
                      const ultimo = a.balanceSnapshots[0] ?? null;
                      // A idade é do NÚMERO, não da tentativa: se a última
                      // busca falhou, o saldo na tela é o de antes, e dizer
                      // "atualizado agora" em cima dele seria mentira.
                      const quando = a.isPrepay ? (ultimo?.capturedAt ?? null) : a.lastSyncedAt;
                      return (
                        <tr key={a.id} className="hover:bg-surface-muted transition-colors">
                          <td className="px-4 py-3">
                            {/* Loja com duas contas: o nome aparece uma vez,
                                as contas embaixo. */}
                            {i === 0 ? (
                              <Link
                                href={`/clientes/${c.id}`}
                                className="font-medium hover:text-accent"
                              >
                                {c.companyName}
                              </Link>
                            ) : (
                              <span className="text-foreground-muted text-xs">↳ mesma loja</span>
                            )}
                            {a.lastSyncError && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-start gap-1.5">
                                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                <span>{a.lastSyncError}</span>
                              </p>
                            )}
                            <span className="sm:hidden block text-xs font-mono text-foreground-muted mt-0.5">
                              {a.metaAccountId}
                            </span>
                          </td>
                          {vePorGestor && (
                            <td className="px-4 py-3 text-foreground-muted hidden lg:table-cell align-top">
                              {i === 0 ? (c.manager?.name?.split(" ")[0] ?? "—") : ""}
                            </td>
                          )}
                          <td className="px-4 py-3 font-mono text-xs text-foreground-muted hidden sm:table-cell align-top">
                            {a.metaAccountId}
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                            {!a.isPrepay ? (
                              <span className="text-xs text-foreground-muted">cartão</span>
                            ) : ultimo ? (
                              <span
                                className={`font-semibold ${COR_DO_SALDO[estadoDoSaldo(ultimo.availableCents)]}`}
                              >
                                {saldoEmReais(ultimo.availableCents)}
                              </span>
                            ) : (
                              // "indisponível", nunca R$ 0,00: saldo que o
                              // sistema não conseguiu ler não é conta zerada.
                              <span className="text-xs text-foreground-muted">indisponível</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-foreground-muted hidden md:table-cell align-top">
                            {quando ? tempoDesde(quando) : "nunca"}
                          </td>
                        </tr>
                      );
                    })
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-foreground-muted">
        Para vincular uma conta, abra a loja e use o bloco “Meta Ads” na ficha dela. Quem vincula é
        a direção; o saldo todo mundo que cuida da loja vê.
      </p>
    </div>
  );
}
