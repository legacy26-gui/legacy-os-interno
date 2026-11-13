import Link from "next/link";
import { Sparkles, Plus, Clock, Check, Undo2, Palette } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/dal";
import { CARTEIRA, escopoDaCarteira, veTodaACarteira } from "@/lib/carteira";
import { precoDaArte, fichaDoVeiculo } from "@/lib/studio/arte";
import type { StudioStatus } from "@/generated/prisma/enums";

// A central do Legacy Studio.
//
// ── O que esta tela é, e o que ela não é ─────────────────────────────────
//
// É uma FILA DE REVISÃO, não uma galeria. A pergunta que ela responde é "o
// que está esperando por mim agora", e por isso o que precisa de ação vem
// primeiro e o que já foi aprovado desce.
//
// Galeria de tudo que já se produziu é outra tela, e só faz sentido quando
// houver centenas de peças — hoje seria um enfeite que empurra pra baixo o
// que importa.

export const dynamic = "force-dynamic";

/** Quantas peças trazer. Acima disso vira rolagem que ninguém percorre. */
const TETO = 120;

const ORDEM: Record<StudioStatus, number> = {
  CORRIGIR: 0,
  PRONTO: 1,
  APROVADO: 2,
};

const SELO: Record<StudioStatus, { texto: string; classe: string }> = {
  CORRIGIR: {
    texto: "Corrigir",
    classe: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40",
  },
  PRONTO: {
    texto: "Esperando revisão",
    classe: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40",
  },
  APROVADO: {
    texto: "Aprovada",
    classe: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40",
  },
};

export default async function StudioPage() {
  const user = await requireModuleAccess("studio");

  const [artes, lojas] = await Promise.all([
    prisma.studioArte.findMany({
      where: { client: { ...CARTEIRA, ...escopoDaCarteira(user) } },
      orderBy: { criadoEm: "desc" },
      take: TETO,
      select: {
        id: true,
        modelo: true,
        ano: true,
        kmTexto: true,
        precoCents: true,
        status: true,
        correcao: true,
        criadoEm: true,
        client: { select: { id: true, companyName: true } },
        criadoPor: { select: { name: true } },
      },
    }),
    prisma.client.findMany({
      where: { ...CARTEIRA, ...escopoDaCarteira(user) },
      orderBy: { companyName: "asc" },
      select: {
        id: true,
        companyName: true,
        studioMarca: { select: { clientId: true } },
      },
    }),
  ]);

  // A fila: o que precisa de ação em cima, o aprovado embaixo. Dentro de
  // cada grupo, o mais novo primeiro.
  const fila = [...artes].sort(
    (a, b) => ORDEM[a.status] - ORDEM[b.status] || b.criadoEm.getTime() - a.criadoEm.getTime()
  );

  const esperando = artes.filter((a) => a.status === "PRONTO").length;
  const corrigir = artes.filter((a) => a.status === "CORRIGIR").length;
  const semMarca = lojas.filter((l) => !l.studioMarca).length;
  const podeRevisar = user.role === "ADMIN" || user.role === "GERENTE";

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles size={20} className="text-accent" /> Legacy Studio
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Arte de veículo pronta em feed e Stories, com a identidade de cada loja.{" "}
            {veTodaACarteira(user) ? "Todas as lojas." : "Suas lojas."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/studio/marcas"
            className="inline-flex items-center gap-2 px-4 min-h-11 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-muted"
          >
            <Palette size={15} /> Identidade das lojas
          </Link>
          <Link
            href="/studio/nova"
            className="inline-flex items-center gap-2 px-4 min-h-11 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90"
          >
            <Plus size={15} /> Nova arte
          </Link>
        </div>
      </div>

      {/* O aviso de loja sem identidade.
          Fica aqui e não escondido: a arte sai mesmo sem marca, com a cara
          neutra do sistema — e é fácil produzir trinta peças assim sem
          perceber que nenhuma tem a logo da loja. */}
      {semMarca > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          {semMarca === 1
            ? "1 loja ainda não tem identidade visual cadastrada — as artes dela saem sem logo."
            : `${semMarca} lojas ainda não têm identidade visual cadastrada — as artes delas saem sem logo.`}{" "}
          <Link href="/studio/marcas" className="underline">
            Cadastrar
          </Link>
        </p>
      )}

      {(esperando > 0 || corrigir > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {corrigir > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-red-600 dark:text-red-400">
              <Undo2 size={13} /> {corrigir} com correção pedida
            </span>
          )}
          {esperando > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-amber-600 dark:text-amber-400">
              <Clock size={13} /> {esperando} esperando revisão
            </span>
          )}
        </div>
      )}

      {fila.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center">
          <p className="text-sm text-foreground-muted">
            Nenhuma arte ainda. Mande a foto de um carro e os dados — o resto sai pronto.
          </p>
          <Link
            href="/studio/nova"
            className="mt-4 inline-flex items-center gap-2 px-4 min-h-11 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90"
          >
            <Plus size={15} /> Criar a primeira
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {fila.map((a) => {
            const selo = SELO[a.status];
            const ficha = fichaDoVeiculo(a.ano, a.kmTexto);
            const preco = precoDaArte(a.precoCents);
            return (
              <li key={a.id}>
                <Link
                  href={`/studio/${a.id}`}
                  className="flex flex-col h-full rounded-xl border border-border bg-surface overflow-hidden hover:border-border-forte"
                >
                  {/* A miniatura é a própria arte, desenhada na hora. Mostrar
                      a foto crua aqui enganaria: o que vai pro cliente é a
                      peça montada, e é ela que precisa ser conferida. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    // `w=360` e não a arte inteira: doze cartões em tamanho cheio
                    // seriam megabytes só pra abrir a lista.
                    src={`/api/studio/arte/${a.id}?formato=feed&w=360`}
                    alt={`Arte de ${a.modelo}`}
                    className="w-full aspect-square object-cover bg-black"
                    loading="lazy"
                  />
                  <div className="p-3 flex flex-col gap-1.5 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold leading-tight">{a.modelo}</span>
                      <span
                        className={`shrink-0 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${selo.classe}`}
                      >
                        {selo.texto}
                      </span>
                    </div>
                    <span className="text-xs text-foreground-muted">{a.client.companyName}</span>
                    {(ficha || preco) && (
                      <span className="text-xs text-foreground-muted">
                        {[ficha, preco].filter(Boolean).join(" — ")}
                      </span>
                    )}
                    {a.status === "CORRIGIR" && a.correcao && (
                      <span className="text-xs text-red-600 dark:text-red-400 line-clamp-2">
                        {a.correcao}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {!podeRevisar && fila.length > 0 && (
        <p className="text-xs text-foreground-muted">
          <Check size={12} className="inline" /> Quem aprova e pede correção é a direção. Você
          produz e acompanha.
        </p>
      )}
    </div>
  );
}
