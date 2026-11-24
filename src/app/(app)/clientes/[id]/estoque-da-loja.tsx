import { Car, ExternalLink, PackageSearch, Tag } from "lucide-react";
import { formatDateTime } from "@/lib/labels";
import type { EstoqueDaFicha, SituacaoDoAnuncio } from "@/lib/estoque/da-loja";
import { AnunciarAgora } from "./anunciar-agora";

// O estoque da loja (lido do site dela) na ficha: cada carro com os dados, a FIPE e se já tem anúncio. Nos que não têm,
// o botão "Anunciar agora" abre a bolha pra escolher campanha, conjunto e fotos e criar o rascunho PAUSADO na Meta.

const reais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Situacao({ s }: { s: SituacaoDoAnuncio }) {
  if (s.tipo === "tem")
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        {s.ativos > 0 ? `${s.ativos} ${s.ativos === 1 ? "anúncio no ar" : "anúncios no ar"}` : `${s.total} ${s.total === 1 ? "anúncio (pausado)" : "anúncios (pausados)"}`}
      </span>
    );
  if (s.tipo === "rascunho") return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400">rascunho criado</span>;
  if (s.tipo === "incerto") return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">não deu pra confirmar anúncio</span>;
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-500">sem anúncio</span>;
}

export function EstoqueDaLoja({ estoque }: { estoque: EstoqueDaFicha }) {
  if (!estoque.ligado) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium flex items-center gap-2">
          <Car size={14} /> Estoque no site
        </p>
        <p className="text-sm text-foreground-muted mt-2 flex items-start gap-2">
          <PackageSearch size={15} className="shrink-0 mt-0.5" /> O site de estoque desta loja ainda não está conectado. Quando estiver, os carros aparecem aqui, com o botão pra anunciar.
        </p>
      </div>
    );
  }
  const semAnuncio = estoque.carros.filter((c) => c.anuncio.tipo === "sem").length;
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium flex items-center gap-2">
            <Car size={14} /> Estoque no site
          </p>
          <p className="text-xs text-foreground-muted mt-1">
            {estoque.carros.length} {estoque.carros.length === 1 ? "carro" : "carros"}
            {semAnuncio > 0 ? ` · ${semAnuncio} sem anúncio` : ""}
            {estoque.ultimaLeituraEm ? ` · lido em ${formatDateTime(estoque.ultimaLeituraEm)}` : " · ainda não foi lido"}
          </p>
        </div>
        {estoque.erro && <p className="text-xs text-amber-600 dark:text-amber-400">⚠️ Última leitura: {estoque.erro}</p>}
      </div>

      {!estoque.temConta && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Esta loja não tem conta de anúncio ligada, então não dá pra anunciar por aqui.</p>
      )}

      {estoque.carros.length === 0 ? (
        <p className="text-sm text-foreground-muted">Nenhum carro no site agora.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {estoque.carros.map((c) => (
            <li key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {c.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.foto} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-16 w-24 rounded-lg object-cover bg-surface-muted shrink-0" />
                ) : (
                  <div className="h-16 w-24 rounded-lg bg-surface-muted shrink-0 flex items-center justify-center text-foreground-muted">
                    <Car size={20} />
                  </div>
                )}
                <div className="min-w-0">
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline inline-flex items-center gap-1 max-w-full">
                    <span className="truncate">{c.titulo}</span> <ExternalLink size={11} className="shrink-0 text-foreground-muted" />
                  </a>
                  <p className="text-xs text-foreground-muted">
                    {[c.ano, c.km !== null ? `${c.km.toLocaleString("pt-BR")} km` : null, c.cor, c.precoCents ? reais(c.precoCents) : null].filter(Boolean).join(" · ")}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <Situacao s={c.anuncio} />
                    <span className="text-[11px] text-foreground-muted">
                      {c.diasExatos ? "" : "pelo menos "}
                      {c.dias === 0 ? "entrou hoje" : `${c.dias} ${c.dias === 1 ? "dia" : "dias"} no site`}
                    </span>
                    {c.fipe && (
                      <span className={`text-[11px] inline-flex items-center gap-1 ${c.fipe.pct > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground-muted"}`} title={c.fipe.texto}>
                        <Tag size={10} /> {c.fipe.pct === 0 ? "na FIPE" : `${Math.abs(Math.round(c.fipe.pct * 100))}% ${c.fipe.pct > 0 ? "acima" : "abaixo"} da FIPE`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {estoque.temConta && (c.anuncio.tipo === "sem" || c.anuncio.tipo === "incerto") && (
                <div className="shrink-0">
                  <AnunciarAgora carroId={c.id} carro={c.titulo} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
