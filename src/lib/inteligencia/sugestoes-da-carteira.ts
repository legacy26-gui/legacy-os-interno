import "server-only";

import { prisma } from "@/lib/prisma";
import { CARTEIRA, escopoDaCarteira, type PessoaDaCasa } from "@/lib/carteira";
import { gerarSugestoes, type DadosDaLoja, type Sugestao } from "./sugestoes";

// Busca no banco o que o motor das sugestões precisa (sugestoes.ts), loja por loja da carteira de quem pergunta.
// Só lojas com o site de estoque ligado: sem estoque não há carro pra cruzar com anúncio.

const DIA = 86_400_000;

export interface SugestoesDaLoja {
  loja: { id: string; nome: string };
  carrosNoSite: number;
  sugestoes: Sugestao[];
}

export async function sugestoesDaCarteira(
  pessoa: PessoaDaCasa,
  opcoes: { clientId?: string; agora?: Date } = {},
): Promise<{ lojas: SugestoesDaLoja[]; semEstoque: { id: string; nome: string }[] }> {
  const agora = opcoes.agora ?? new Date();
  const limite = new Date(agora.getTime() - 30 * DIA);

  const lojas = await prisma.client.findMany({
    where: { ...CARTEIRA, ...escopoDaCarteira(pessoa), ...(opcoes.clientId ? { id: opcoes.clientId } : {}) },
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      estoqueDaLoja: { select: { criadoEm: true } },
      metaAdAccounts: { where: { active: true }, select: { id: true } },
      estoqueCarros: {
        where: { OR: [{ sumiuEm: null }, { sumiuEm: { gte: limite } }] },
        select: {
          id: true,
          titulo: true,
          anoModelo: true,
          km: true,
          precoCents: true,
          url: true,
          primeiraVezEm: true,
          sumiuEm: true,
          precos: { orderBy: { vistoEm: "asc" }, select: { precoCents: true, vistoEm: true } },
        },
      },
    },
  });

  const resultado: SugestoesDaLoja[] = [];
  const semEstoque: { id: string; nome: string }[] = [];

  for (const l of lojas) {
    if (!l.estoqueDaLoja) {
      semEstoque.push({ id: l.id, nome: l.companyName });
      continue;
    }
    const contas = l.metaAdAccounts.map((c) => c.id);
    const [criativos, vidas, vendas] = await Promise.all([
      prisma.metaAdCreative.findMany({
        where: { adAccountId: { in: contas }, NOT: { status: { in: ["ARCHIVED", "DELETED"] } } },
        select: { adId: true, adName: true, effectiveStatus: true, titulo: true, legenda: true },
      }),
      prisma.metaLifetime.findMany({ where: { adAccountId: { in: contas } }, select: { adId: true, spendCents: true, leads: true } }),
      prisma.clientSale.findMany({
        where: { clientId: l.id, anuncioIds: { not: null }, soldAt: { gte: new Date(agora.getTime() - 120 * DIA) } },
        select: { anuncioIds: true },
      }),
    ]);
    const vida = new Map(vidas.map((v) => [v.adId, v]));
    const dados: DadosDaLoja = {
      loja: { id: l.id, nome: l.companyName },
      estoqueLigadoEm: l.estoqueDaLoja.criadoEm,
      carros: l.estoqueCarros,
      anuncios: criativos.map((c) => ({
        adId: c.adId,
        nome: c.adName,
        textos: [c.titulo, c.legenda].filter((x): x is string => !!x),
        status: c.effectiveStatus,
        spendCents: vida.get(c.adId)?.spendCents ?? 0,
        leads: vida.get(c.adId)?.leads ?? 0,
      })),
      anunciosVendidos: new Set(vendas.flatMap((v) => (v.anuncioIds ?? "").split(",").filter(Boolean))),
    };
    resultado.push({
      loja: dados.loja,
      carrosNoSite: l.estoqueCarros.filter((c) => !c.sumiuEm).length,
      sugestoes: gerarSugestoes(dados, agora),
    });
  }
  return { lojas: resultado, semEstoque };
}
