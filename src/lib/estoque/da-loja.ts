import "server-only";

import { prisma } from "@/lib/prisma";
import { comparacaoComFipe, ligarCarroAoAnuncio, type AnuncioDaLoja, type CarroDoEstoque } from "@/lib/inteligencia/sugestoes";

// O estoque de UMA loja pra ficha dela: cada carro do site com os dados, a comparação com a FIPE e a situação de anúncio
// (tem anúncio / sem anúncio / não deu pra saber). A ligação carro↔anúncio é a mesma das Sugestões (só com certeza nos dois
// sentidos); "incerto" nunca vira convite pra anunciar.

const DIA = 86_400_000;

export type SituacaoDoAnuncio =
  /** Tem rascunho criado pelo "Anunciar agora" (ou o anúncio foi achado). */
  | { tipo: "tem"; ativos: number; total: number }
  | { tipo: "rascunho"; adId: string }
  | { tipo: "sem" }
  | { tipo: "incerto" };

export interface CarroDaFicha {
  id: string;
  titulo: string;
  ano: number | null;
  km: number | null;
  cor: string | null;
  precoCents: number | null;
  foto: string | null;
  url: string;
  /** Dias no site; `exato` falso = já estava no site quando a leitura foi ligada (tem pelo menos isso). */
  dias: number;
  diasExatos: boolean;
  fipe: { pct: number; texto: string } | null;
  anuncio: SituacaoDoAnuncio;
}

export interface EstoqueDaFicha {
  /** A loja tem o site de estoque ligado? */
  ligado: boolean;
  ultimaLeituraEm: Date | null;
  erro: string | null;
  carros: CarroDaFicha[];
  /** A loja tem conta de anúncio ligada (sem ela não dá pra anunciar). */
  temConta: boolean;
}

export async function estoqueDaFicha(clientId: string, agora: Date = new Date()): Promise<EstoqueDaFicha> {
  const loja = await prisma.estoqueDaLoja.findUnique({ where: { clientId }, select: { criadoEm: true, ultimaLeituraEm: true, ultimoErro: true } });
  if (!loja) return { ligado: false, ultimaLeituraEm: null, erro: null, carros: [], temConta: false };

  const contas = (await prisma.metaAdAccount.findMany({ where: { clientId, active: true }, select: { id: true } })).map((c) => c.id);
  const [carros, criativos, vidas] = await Promise.all([
    prisma.estoqueCarro.findMany({
      where: { clientId, sumiuEm: null },
      orderBy: { primeiraVezEm: "desc" },
      select: {
        id: true, titulo: true, anoModelo: true, km: true, cor: true, precoCents: true, url: true, foto: true, primeiraVezEm: true, sumiuEm: true, rascunhoAdId: true,
        precos: { orderBy: { vistoEm: "asc" }, select: { precoCents: true, vistoEm: true } },
        fipeTipo: true, fipeCents: true, fipeMaxCents: true, fipeReferencia: true,
      },
    }),
    contas.length
      ? prisma.metaAdCreative.findMany({ where: { adAccountId: { in: contas }, NOT: { status: { in: ["ARCHIVED", "DELETED"] } } }, select: { adId: true, adName: true, effectiveStatus: true, titulo: true, legenda: true } })
      : Promise.resolve([]),
    contas.length ? prisma.metaLifetime.findMany({ where: { adAccountId: { in: contas } }, select: { adId: true, spendCents: true, leads: true } }) : Promise.resolve([]),
  ]);
  const vida = new Map(vidas.map((v) => [v.adId, v]));
  const anuncios: AnuncioDaLoja[] = criativos.map((c) => ({
    adId: c.adId,
    nome: c.adName,
    textos: [c.titulo, c.legenda].filter((x): x is string => !!x),
    status: c.effectiveStatus,
    spendCents: vida.get(c.adId)?.spendCents ?? 0,
    leads: vida.get(c.adId)?.leads ?? 0,
  }));

  const doEstoque: CarroDoEstoque[] = carros.map((c) => ({
    id: c.id, titulo: c.titulo, anoModelo: c.anoModelo, km: c.km, precoCents: c.precoCents, url: c.url, primeiraVezEm: c.primeiraVezEm, sumiuEm: c.sumiuEm,
    precos: c.precos, fipeTipo: c.fipeTipo, fipeCents: c.fipeCents, fipeMaxCents: c.fipeMaxCents, fipeReferencia: c.fipeReferencia,
  }));

  const ligadoEm = loja.criadoEm.getTime();
  return {
    ligado: true,
    ultimaLeituraEm: loja.ultimaLeituraEm,
    erro: loja.ultimoErro,
    temConta: contas.length > 0,
    carros: carros.map((c, i) => {
      const lig = ligarCarroAoAnuncio(doEstoque[i], doEstoque, anuncios);
      const anuncio: SituacaoDoAnuncio =
        c.rascunhoAdId && c.rascunhoAdId !== "pendente"
          ? { tipo: "rascunho", adId: c.rascunhoAdId }
          : lig.tipo === "com-anuncio"
            ? { tipo: "tem", ativos: lig.anuncios.filter((a) => a.status === "ACTIVE").length, total: lig.anuncios.length }
            : lig.tipo === "incerto"
              ? { tipo: "incerto" }
              : { tipo: "sem" };
      return {
        id: c.id,
        titulo: c.titulo,
        ano: c.anoModelo,
        km: c.km,
        cor: c.cor,
        precoCents: c.precoCents,
        foto: c.foto,
        url: c.url,
        dias: Math.max(0, Math.floor((agora.getTime() - c.primeiraVezEm.getTime()) / DIA)),
        diasExatos: c.primeiraVezEm.getTime() - ligadoEm > DIA,
        fipe: comparacaoComFipe(doEstoque[i]),
        anuncio,
      };
    }),
  };
}
