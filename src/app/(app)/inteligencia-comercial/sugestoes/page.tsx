import Link from "next/link";
import { Scale, BadgeDollarSign, CircleDollarSign, ExternalLink, FilePlus2, Megaphone, PackagePlus, Sparkles, Tag, Timer, TrendingDown, Users } from "lucide-react";
import { requireModuleAccess } from "@/lib/dal";
import { sugestoesDaCarteira } from "@/lib/inteligencia/sugestoes-da-carteira";
import { REGUA, type Sugestao, type TipoDeSugestao } from "@/lib/inteligencia/sugestoes";
import { BotaoAnunciarAgora } from "./botao-anunciar-agora";

// As sugestões da Inteligência Comercial: o estoque do site cruzado com anúncio, lead e venda.
// As regras moram em src/lib/inteligencia/sugestoes.ts; esta tela só mostra, por loja, da mais urgente pra menos.

export const dynamic = "force-dynamic";

const ROTULO: Record<TipoDeSugestao, { nome: string; icone: typeof Tag; cor: string }> = {
  "anuncio-de-carro-que-saiu": { nome: "Anúncio de carro que saiu do site", icone: CircleDollarSign, cor: "text-red-600 dark:text-red-400" },
  "preco-diferente": { nome: "Preço diferente do site", icone: Tag, cor: "text-red-600 dark:text-red-400" },
  "gasto-sem-lead": { nome: "Gasto sem lead", icone: TrendingDown, cor: "text-amber-600 dark:text-amber-400" },
  "lead-sem-venda": { nome: "Lead sem venda", icone: Users, cor: "text-amber-600 dark:text-amber-400" },
  "cpl-alto": { nome: "Lead caro", icone: BadgeDollarSign, cor: "text-amber-600 dark:text-amber-400" },
  "acima-da-fipe": { nome: "Acima da FIPE", icone: Scale, cor: "text-amber-600 dark:text-amber-400" },
  "abaixo-da-fipe": { nome: "Abaixo da FIPE", icone: Scale, cor: "text-emerald-600 dark:text-emerald-400" },
  "novo-sem-anuncio": { nome: "Carro novo sem anúncio", icone: PackagePlus, cor: "text-accent" },
  "parado-sem-anuncio": { nome: "Parado sem anúncio", icone: Timer, cor: "text-foreground-muted" },
  parado: { nome: "Parado", icone: Timer, cor: "text-foreground-muted" },
};

function Cartao({ s }: { s: Sugestao }) {
  const r = ROTULO[s.tipo];
  const Icone = r.icone;
  const anunciar = s.tipo === "novo-sem-anuncio" || s.tipo === "parado-sem-anuncio";
  return (
    <li className="rounded-xl border border-border bg-background p-4 flex flex-col gap-2">
      <p className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 ${r.cor}`}>
        <Icone size={14} /> {r.nome}
      </p>
      <p className="font-medium break-words">{s.titulo}</p>
      <p className="text-sm text-foreground-muted">{s.detalhe}</p>
      <p className="text-sm">
        <strong>O que fazer:</strong> {s.acao}
      </p>
      <div className="flex flex-wrap items-start gap-2 pt-1">
        {anunciar && s.carro && <BotaoAnunciarAgora carroId={s.carro.id} carro={s.carro.titulo} />}
        {anunciar && s.carro && (
          <Link
            href={`/meta-ads/${s.lojaId}/subir-anuncio?carro=${s.carro.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-sm font-medium"
          >
            <FilePlus2 size={14} /> Subir anúncio
          </Link>
        )}
        {s.anuncios.length > 0 && (
          <Link
            href={`/meta-ads/${s.lojaId}?nivel=anuncio`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-surface-muted"
          >
            <Megaphone size={14} /> Ver no Meta Ads
          </Link>
        )}
        {s.carro && (
          <a
            href={s.carro.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-surface-muted"
          >
            Ver no site <ExternalLink size={13} />
          </a>
        )}
      </div>
    </li>
  );
}

export default async function SugestoesPage({ searchParams }: { searchParams: Promise<{ loja?: string }> }) {
  const user = await requireModuleAccess("gestao-contas");
  const { loja: lojaFiltro } = await searchParams;
  const { lojas, semEstoque } = await sugestoesDaCarteira(user);

  const visiveis = lojaFiltro ? lojas.filter((l) => l.loja.id === lojaFiltro) : lojas;
  const total = lojas.reduce((s, l) => s + l.sugestoes.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Sparkles size={20} /> Sugestões
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5 max-w-2xl">
          O estoque do site de cada loja cruzado com os anúncios, os leads e as vendas. Cada sugestão diz o porquê, com os números,
          e o que fazer. As mais urgentes (dinheiro saindo) vêm primeiro.
        </p>
        <p className="text-sm mt-2">
          <strong>{total}</strong> {total === 1 ? "sugestão" : "sugestões"} em <strong>{lojas.length}</strong>{" "}
          {lojas.length === 1 ? "loja com estoque ligado" : "lojas com estoque ligado"}
        </p>
      </div>

      {lojas.length > 1 && (
        <nav aria-label="Filtrar por loja" className="flex flex-wrap gap-2">
          <Link
            href="/inteligencia-comercial/sugestoes"
            className={`px-3 min-h-9 inline-flex items-center rounded-lg text-sm border ${!lojaFiltro ? "bg-accent text-white border-accent" : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"}`}
          >
            Todas
          </Link>
          {lojas.map((l) => (
            <Link
              key={l.loja.id}
              href={`/inteligencia-comercial/sugestoes?loja=${l.loja.id}`}
              className={`px-3 min-h-9 inline-flex items-center gap-1.5 rounded-lg text-sm border ${lojaFiltro === l.loja.id ? "bg-accent text-white border-accent" : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"}`}
            >
              {l.loja.nome} <span className="tabular-nums opacity-80">{l.sugestoes.length}</span>
            </Link>
          ))}
        </nav>
      )}

      {lojas.length === 0 && (
        <p className="text-sm rounded-2xl border border-border bg-surface p-5">
          Nenhuma loja com o site de estoque ligado ainda. As sugestões nascem do estoque: liga o site da loja em{" "}
          <Link href="/inteligencia-comercial/estoque" className="text-accent underline underline-offset-2">
            Estoque
          </Link>
          .
        </p>
      )}

      {visiveis.map((l) => (
        <section key={l.loja.id} className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4" aria-labelledby={`s-${l.loja.id}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`s-${l.loja.id}`} className="font-semibold">
              {l.loja.nome}
            </h2>
            <p className="text-sm text-foreground-muted">
              {l.carrosNoSite} {l.carrosNoSite === 1 ? "carro" : "carros"} no site · {l.sugestoes.length}{" "}
              {l.sugestoes.length === 1 ? "sugestão" : "sugestões"}
            </p>
          </div>
          {l.sugestoes.length === 0 ? (
            <p className="text-sm text-foreground-muted">Nada pra mexer agora. 👍</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {l.sugestoes.map((s, i) => (
                <Cartao key={`${s.tipo}-${s.carro?.id ?? i}`} s={s} />
              ))}
            </ul>
          )}
        </section>
      ))}

      <details className="rounded-2xl border border-border bg-surface p-5 text-sm">
        <summary className="font-semibold cursor-pointer">Como as sugestões são feitas</summary>
        <ul className="list-disc pl-5 mt-3 flex flex-col gap-1.5 text-foreground-muted">
          <li>
            O carro do site é ligado ao anúncio pelo nome, e só quando não há dúvida nos dois sentidos. Dois carros iguais no estoque e um
            anúncio só: o sistema não chuta, e esse carro fica fora das sugestões de &quot;anunciar&quot;.
          </li>
          <li>Carro que saiu do site só aparece quando o anúncio dele continua entregando.</li>
          <li>
            Novo: entrou há até {REGUA.novoDias} dias. Parado: {REGUA.paradoDias}+ dias. Lead sem venda: {REGUA.leadsSemVenda}+ leads.
            Gasto sem lead: a partir de R$ {REGUA.gastoSemLeadCents / 100}. Lead caro: {REGUA.cplVezesDaLoja}x a média da própria loja.
          </li>
          <li>
            Os dias contam desde que o sistema viu o carro pela primeira vez; carro que já estava no site quando a leitura foi ligada aparece com
            &quot;pelo menos&quot;.
          </li>
          <li>Gasto e leads são os de vida inteira do anúncio na Meta. Carro com venda registrada não recebe sugestão.</li>
          <li>
            FIPE: conferida 2x por dia pela versão do carro no site. Quando duas ou mais versões parecidas empatam, o sistema usa a faixa
            entre elas (e compara com o lado que favorece a loja). Quando não acha com segurança, não compara. Acima da FIPE: {Math.round(REGUA.acimaDaFipe * 100)}%+;
            abaixo: {Math.round(REGUA.abaixoDaFipe * 100)}%+.
          </li>
        </ul>
      </details>

      {semEstoque.length > 0 && (
        <p className="text-sm text-foreground-muted">
          {semEstoque.length} {semEstoque.length === 1 ? "loja ainda não tem" : "lojas ainda não têm"} o site ligado e ficam fora das sugestões.{" "}
          <Link href="/inteligencia-comercial/estoque" className="text-accent underline underline-offset-2">
            Ligar em Estoque
          </Link>
          .
        </p>
      )}
    </div>
  );
}
