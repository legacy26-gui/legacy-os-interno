import "server-only";

import { prisma } from "@/lib/prisma";
import { acharMarca, decidir, escolherAno, precoDaFipe, rankingDeModelos, type Candidato } from "./casar";
import { buscarFipe, novoOrcamento, SemCota, type Orcamento } from "./cliente";

// Põe a tabela FIPE nos carros do estoque. Roda sozinho (9h30 e 15h30, depois da leitura dos sites) e pelo botão
// da tela de Estoque. Cada carro é reconferido a cada 20 dias (a FIPE muda uma vez por mês).
//
// O resultado de cada carro é honesto: "exato" (uma versão), "faixa" (versões empatadas: menor e maior preço) ou
// "nenhum" (não achou com segurança). "nenhum" não é erro: é o sistema dizendo que não sabe.

const RECONFERIR_DIAS = 20;
const VERSOES_A_CONFERIR = 6;

interface Marca {
  code: string;
  name: string;
}
interface Ano {
  code: string;
  name: string;
}
interface Preco {
  price?: string;
  model?: string;
  codeFipe?: string;
  referenceMonth?: string;
}

export interface ResultadoDaFipe {
  conferidos: number;
  exatos: number;
  faixas: number;
  semFipe: number;
  consultas: number;
  parouPorque: string | null;
}

/** A FIPE de um carro. Lança SemCota se a rodada acabar no meio (o carro fica pra próxima). */
async function fipeDoCarro(
  c: { marca: string | null; modelo: string | null; versao: string | null; titulo: string; anoModelo: number | null },
  orc: Orcamento,
) {
  const marcas = await buscarFipe<Marca[]>("/brands", 30, orc);
  const b = Array.isArray(marcas) ? acharMarca(c.marca, marcas) : null;
  if (!b) return { tipo: "nenhum" as const };
  const modelos = await buscarFipe<{ code: string; name: string }[]>(`/brands/${b}/models`, 30, orc);
  if (!Array.isArray(modelos)) return { tipo: "nenhum" as const };

  const ranking = rankingDeModelos(c, modelos).slice(0, VERSOES_A_CONFERIR);
  const comAno: (Candidato & { ano: string })[] = [];
  for (const cand of ranking) {
    const anos = await buscarFipe<Ano[]>(`/brands/${b}/models/${cand.modelo.code}/years`, 30, orc);
    const ano = Array.isArray(anos) ? escolherAno(anos, c) : null;
    if (ano) comAno.push({ ...cand, ano });
  }
  const escolha = decidir(comAno);
  if (escolha.tipo === "nenhum") return { tipo: "nenhum" as const };

  const precos: { cents: number; nome: string; codigo: string | null; ref: string | null }[] = [];
  for (const cand of escolha.candidatos as (Candidato & { ano: string })[]) {
    const p = await buscarFipe<Preco>(`/brands/${b}/models/${cand.modelo.code}/years/${cand.ano}`, 20, orc);
    const cents = precoDaFipe(p?.price);
    if (cents) precos.push({ cents, nome: p.model ?? cand.modelo.name, codigo: p.codeFipe ?? null, ref: p.referenceMonth ?? null });
  }
  if (precos.length === 0) return { tipo: "nenhum" as const };
  const min = Math.min(...precos.map((p) => p.cents));
  const max = Math.max(...precos.map((p) => p.cents));
  return {
    tipo: precos.length === 1 || min === max ? ("exato" as const) : ("faixa" as const),
    cents: min,
    maxCents: max === min ? null : max,
    modelo: precos.map((p) => p.nome).join(" | ").slice(0, 500),
    codigo: precos.length === 1 ? precos[0].codigo : null,
    referencia: precos[0].ref,
  };
}

/** Confere a FIPE dos carros que estão no site e ainda não têm (ou têm velha). */
export async function atualizarFipe(opcoes: { consultas?: number; ms?: number; clientId?: string } = {}): Promise<ResultadoDaFipe> {
  const orc = novoOrcamento(opcoes.consultas ?? 180, opcoes.ms ?? 240_000);
  const limite = new Date(Date.now() - RECONFERIR_DIAS * 86_400_000);
  const carros = await prisma.estoqueCarro.findMany({
    where: {
      sumiuEm: null,
      ...(opcoes.clientId ? { clientId: opcoes.clientId } : {}),
      OR: [{ fipeConferidoEm: null }, { fipeConferidoEm: { lt: limite } }],
    },
    orderBy: [{ fipeConferidoEm: { sort: "asc", nulls: "first" } }, { primeiraVezEm: "desc" }],
    take: 400,
    select: { id: true, marca: true, modelo: true, versao: true, titulo: true, anoModelo: true },
  });

  const r: ResultadoDaFipe = { conferidos: 0, exatos: 0, faixas: 0, semFipe: 0, consultas: 0, parouPorque: null };
  for (const c of carros) {
    try {
      const f = await fipeDoCarro(c, orc);
      await prisma.estoqueCarro.update({
        where: { id: c.id },
        data:
          f.tipo === "nenhum"
            ? { fipeTipo: "nenhum", fipeCents: null, fipeMaxCents: null, fipeModelo: null, fipeCodigo: null, fipeReferencia: null, fipeConferidoEm: new Date() }
            : { fipeTipo: f.tipo, fipeCents: f.cents, fipeMaxCents: f.maxCents, fipeModelo: f.modelo, fipeCodigo: f.codigo, fipeReferencia: f.referencia, fipeConferidoEm: new Date() },
      });
      r.conferidos++;
      if (f.tipo === "exato") r.exatos++;
      else if (f.tipo === "faixa") r.faixas++;
      else r.semFipe++;
    } catch (e) {
      if (e instanceof SemCota) {
        r.parouPorque = e.message;
        break;
      }
      // Um carro que deu erro não para a rodada: fica pra próxima (fipeConferidoEm não muda).
      console.error("[fipe] carro", c.id, e instanceof Error ? e.message : e);
    }
  }
  r.consultas = orc.feitas;
  return r;
}
