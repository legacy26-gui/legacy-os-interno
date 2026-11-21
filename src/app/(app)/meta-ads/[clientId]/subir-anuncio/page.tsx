import { ExternalLink, FilePlus2 } from "lucide-react";
import { Voltar } from "@/components/voltar";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { exigirClienteDaCarteira } from "@/lib/carteira";
import { escritaLiberada } from "@/lib/meta/escrever-na-graph";
import { lerBaseDoAnuncio, linkDoGerenciador, orcamentoSugerido } from "@/lib/meta/rascunho-anuncio";
import { Formulario } from "./formulario";

// Subir anúncio como rascunho: a loja escolhe o conjunto, um anúncio pra duplicar, as fotos e a legenda;
// o anúncio nasce PAUSADO e o gestor confere e publica no Gerenciador. Ver formulario.tsx.
//
// Quem entra: quem vê a loja na carteira (o gestor só sobe nas lojas dele). Loja de outro gestor dá 404.

export const maxDuration = 60;

const FORA = ["ARCHIVED", "DELETED"];

const ROTULO_DO_STATUS: Record<string, string> = { ACTIVE: "No ar", PAUSED: "Pausado", ARCHIVED: "Arquivado", DELETED: "Excluído" };

function quando(d: Date) {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function SubirAnuncioPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ carro?: string }>;
}) {
  const user = await requireModuleAccess("clientes");
  const { clientId } = await params;
  // Vindo de uma sugestão ("carro novo sem anúncio"): o carro já chega escolhido. Só vale carro do estoque DESTA loja.
  const { carro: carroPedido } = await searchParams;

  const cliente = await exigirClienteDaCarteira(user, clientId, {
    id: true,
    companyName: true,
    gastoMensalPrevistoCents: true,
  });

  const contas = await prisma.metaAdAccount.findMany({ where: { clientId, active: true }, select: { id: true, metaAccountId: true } });
  const ids = contas.map((c) => c.id);

  const [campanhas, conjuntos, anuncios, estoque, recentes, padrao] = await Promise.all([
    prisma.metaCampaign.findMany({
      where: { adAccountId: { in: ids }, NOT: { status: { in: FORA } } },
      orderBy: { name: "asc" },
      select: { campaignId: true, name: true, status: true },
    }),
    prisma.metaAdset.findMany({
      where: { adAccountId: { in: ids }, NOT: { status: { in: FORA } } },
      orderBy: { name: "asc" },
      select: { adsetId: true, campaignId: true, name: true, status: true, dailyBudgetCents: true },
    }),
    prisma.metaAdCreative.findMany({
      where: { adAccountId: { in: ids }, NOT: { status: { in: FORA } } },
      orderBy: { adName: "asc" },
      take: 600,
      select: { adId: true, adName: true, status: true, adsetId: true, campaignId: true },
    }),
    prisma.estoqueCarro.findMany({
      where: { clientId, sumiuEm: null },
      orderBy: { primeiraVezEm: "desc" },
      take: 150,
      select: { id: true, titulo: true, marca: true, modelo: true, versao: true, anoModelo: true, km: true, cor: true, precoCents: true, url: true },
    }),
    prisma.metaAcao.findMany({
      where: { clientId, origem: "criacao-rascunho" },
      orderBy: { criadoEm: "desc" },
      take: 12,
      select: { objetoId: true, nome: true, criadoEm: true, pedidoPor: true, pedidoTexto: true, nivel: true },
    }),
    prisma.padraoDeRascunho.findUnique({ where: { clientId }, select: { adsetId: true, baseAdId: true, duplicarConjunto: true, orcamentoCents: true } }),
  ]);

  // O "mesmo de sempre" já vem com o anúncio-base lido na Meta (se ainda serve): a pessoa não escolhe de novo.
  let baseInicial: { id: string; formato: "foto" | "carrossel"; legenda: string; titulo: string; link: string } | null = null;
  if (padrao && anuncios.some((a) => a.adId === padrao.baseAdId)) {
    const b = await lerBaseDoAnuncio(clientId, padrao.baseAdId).catch(() => null);
    if (b?.ok) baseInicial = { id: padrao.baseAdId, formato: b.base.formato, legenda: b.base.legenda, titulo: b.base.titulo, link: b.base.link };
  }

  // O estado de hoje de cada rascunho (se a varredura já viu o anúncio). Rascunho que o gestor publicou
  // aparece como "No ar" aqui, sem ninguém precisar avisar.
  const estados = await prisma.metaAdCreative.findMany({
    where: { adAccountId: { in: ids }, adId: { in: recentes.map((r) => r.objetoId) } },
    select: { adId: true, status: true, effectiveStatus: true },
  });
  const estadoDe = new Map(estados.map((e) => [e.adId, e.status]));

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div>
        <Voltar href={`/meta-ads/${clientId}`}>{cliente.companyName}</Voltar>
        <h1 className="text-xl font-semibold flex items-center gap-2 mt-3">
          <FilePlus2 size={20} className="text-accent" /> Subir anúncio — {cliente.companyName}
        </h1>
        <p className="text-sm text-foreground-muted mt-1">
          Duplica um anúncio que a loja já tem, troca as fotos e a legenda, e deixa o novo <strong>pausado</strong> pra você conferir e publicar no Gerenciador.
          Criar um anúncio do zero continua sendo no Gerenciador.
        </p>
      </div>

      {contas.length === 0 || campanhas.length === 0 ? (
        <p className="text-sm rounded-lg border border-border bg-surface px-3 py-3">
          Esta loja ainda não tem campanhas lidas da Meta. Vincula a conta de anúncio e atualiza a loja em Meta Ads primeiro.
        </p>
      ) : (
        <Formulario
          clientId={clientId}
          sugeridoCents={orcamentoSugerido(cliente.gastoMensalPrevistoCents)}
          escritaLiberada={escritaLiberada()}
          carroInicial={estoque.some((c) => c.id === carroPedido) ? carroPedido : undefined}
          padrao={padrao}
          baseInicial={baseInicial}
          campanhas={campanhas.map((c) => ({ id: c.campaignId, nome: c.name, status: c.status }))}
          conjuntos={conjuntos.map((c) => ({ id: c.adsetId, campanhaId: c.campaignId, nome: c.name, status: c.status, orcamentoCents: c.dailyBudgetCents }))}
          anuncios={anuncios.map((a) => ({ id: a.adId, nome: a.adName, status: a.status, conjuntoId: a.adsetId, campanhaId: a.campaignId }))}
          estoque={estoque.map((c) => ({ id: c.id, titulo: c.titulo, marca: c.marca, modelo: c.modelo, versao: c.versao, ano: c.anoModelo, km: c.km, cor: c.cor, precoCents: c.precoCents, url: c.url }))}
        />
      )}

      <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
        <h2 className="font-semibold">Rascunhos recentes</h2>
        {recentes.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nenhum rascunho subido por aqui ainda.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {recentes.map((r) => {
              const conta = /conta (act_\w+)/.exec(r.pedidoTexto ?? "")?.[1] ?? (contas.length === 1 ? contas[0].metaAccountId : null);
              const status = estadoDe.get(r.objetoId);
              return (
                <li key={r.objetoId} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.nivel === "conjunto" ? `Conjunto novo: ${r.nome}` : r.nome}</p>
                    <p className="text-xs text-foreground-muted">
                      {quando(r.criadoEm)}{r.pedidoPor ? ` · ${r.pedidoPor.split(" ")[0]}` : ""} ·{" "}
                      {r.nivel === "conjunto" ? "Pausado (criado por aqui)" : status ? (ROTULO_DO_STATUS[status] ?? status) : "Pausado (criado por aqui)"}
                    </p>
                  </div>
                  {conta && (
                    <a href={linkDoGerenciador(conta, r.objetoId, r.nivel === "conjunto" ? "conjunto" : "anuncio")} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-surface-muted">
                      Gerenciador <ExternalLink size={13} />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
