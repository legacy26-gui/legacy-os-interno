import Link from "next/link";
import {
  Megaphone,
  AlertTriangle,
  Image as Arte,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { reais } from "@/lib/meta/insights";
import { comoPorcentagem } from "@/lib/meta/ritmo-do-combinado";
import { comoVariacao } from "@/lib/meta/criativo-cansado";
import { desdeOEnvio } from "@/lib/meta/pedido-de-verba";
import type { PainelDoDia, LojaNoDia } from "@/lib/meta/painel-do-dia";

// O que a conta de anúncio tem a dizer, no Meu Dia.
//
// ── A régua pra entrar aqui ───────────────────────────────────────────────
//
// Só coisa que PRECISA DE AÇÃO HOJE. Esta é a primeira tela da manhã do
// gestor, e toda linha a mais empurra pra baixo a que importa. "A loja está
// bem" não é notícia e não entra; o número dela mora na tela do Meta Ads.
//
// Por isso aqui não há lista de lojas: há lista de PENDÊNCIAS. Carteira sem
// pendência nenhuma não mostra bloco algum — o silêncio é a informação.

/** Quantas artes cansadas mostrar antes de resumir o resto. */
const ARTES_NA_TELA = 3;

export function BlocoMetaDoDia({ painel }: { painel: PainelDoDia }) {
  const cobrancaVencida = painel.lojas.filter(
    (l) => l.veredito.pedido === "vencido",
  );
  // Fora as que já estão na lista de cobrança vencida: elas continuam sem
  // saldo, mas apareceriam duas vezes — e a segunda apareceria sem o motivo
  // que importa, que é a cobrança ignorada.
  const semSaldo = painel.lojas.filter(
    (l) =>
      (l.veredito.tom === "sem-saldo" || l.veredito.tom === "acabando") &&
      l.veredito.pedido !== "vencido",
  );
  const aguardando = painel.lojas.filter(
    (l) => l.veredito.tom === "aguardando",
  );
  const acelerado = painel.lojas.filter(
    (l) => l.projecao.ritmo === "acelerado",
  );
  const parado = painel.lojas.filter((l) => l.projecao.ritmo === "parado");
  const artes = painel.criativos.filter(
    (c) => c.diagnostico.estado === "cansado",
  );

  const temAlgo =
    semSaldo.length +
      cobrancaVencida.length +
      aguardando.length +
      acelerado.length +
      parado.length +
      artes.length >
    0;

  // Silêncio é resposta. Carteira sem pendência não ganha um bloco dizendo
  // "nada aqui" — ganha a tela mais curta, que é o prêmio de estar em dia.
  if (!temAlgo) return null;

  return (
    <div className="rounded-2xl border border-border-forte bg-surface p-4 flex flex-col gap-3">
      <p className="text-xs uppercase text-foreground-muted tracking-wide font-medium flex items-center gap-2">
        <Megaphone size={14} className="text-accent" /> Nas contas de anúncio
      </p>

      {/* Cobrança vencida vem primeiro: ali não falta só dinheiro, falta uma
          cobrança que já foi feita e ignorada. */}
      {cobrancaVencida.length > 0 && (
        <Aviso
          tom="grave"
          icone={AlertTriangle}
          titulo={`${cobrancaVencida.length === 1 ? "Loja cobrada e o Pix não veio" : `${cobrancaVencida.length} lojas cobradas e o Pix não veio`}`}
        >
          {cobrancaVencida.map((l) => (
            <Loja key={l.clientId} l={l}>
              {l.saldoCents !== null ? `${reais(l.saldoCents)} · ` : ""}
              cobrada {l.pedidoEnviadoEm ? desdeOEnvio(l.pedidoEnviadoEm) : ""}
            </Loja>
          ))}
        </Aviso>
      )}

      {semSaldo.length > 0 && (
        <Aviso
          tom="grave"
          icone={AlertTriangle}
          titulo={`${semSaldo.length === 1 ? "1 loja precisa" : `${semSaldo.length} lojas precisam`} de Pix`}
        >
          {semSaldo.map((l) => (
            <Loja key={l.clientId} l={l}>
              {l.saldoCents !== null ? `${reais(l.saldoCents)} · ` : ""}
              {l.diasDeSaldo ?? "sem leitura de saldo"}
            </Loja>
          ))}
        </Aviso>
      )}

      {aguardando.length > 0 && (
        <Aviso
          tom="calmo"
          icone={Megaphone}
          titulo={`${aguardando.length === 1 ? "1 loja esperando" : `${aguardando.length} lojas esperando`} a verba cair`}
        >
          {aguardando.map((l) => (
            <Loja key={l.clientId} l={l}>
              link enviado{" "}
              {l.pedidoEnviadoEm ? desdeOEnvio(l.pedidoEnviadoEm) : ""}
            </Loja>
          ))}
        </Aviso>
      )}

      {acelerado.length > 0 && (
        <Aviso
          tom="atencao"
          icone={TrendingUp}
          titulo={`${acelerado.length === 1 ? "1 loja gastando" : `${acelerado.length} lojas gastando`} acima do combinado`}
        >
          {acelerado.map((l) => (
            <Loja key={l.clientId} l={l}>
              {comoPorcentagem(l.projecao.fracao)} · nesse ritmo fecha em{" "}
              {reais(l.projecao.projetadoCents ?? 0)}
            </Loja>
          ))}
        </Aviso>
      )}

      {parado.length > 0 && (
        <Aviso
          tom="atencao"
          icone={TrendingDown}
          titulo={`${parado.length === 1 ? "1 loja com verba" : `${parado.length} lojas com verba`} sobrando`}
        >
          {parado.map((l) => (
            <Loja key={l.clientId} l={l}>
              {comoPorcentagem(l.projecao.fracao)} · nesse ritmo fecha em{" "}
              {reais(l.projecao.projetadoCents ?? 0)}
            </Loja>
          ))}
        </Aviso>
      )}

      {artes.length > 0 && (
        <Aviso
          tom="atencao"
          icone={Arte}
          titulo={`${artes.length === 1 ? "1 arte cansada" : `${artes.length} artes cansadas`}`}
        >
          {artes.slice(0, ARTES_NA_TELA).map((c) => (
            <Link
              key={`${c.clientId}-${c.adId}`}
              href={`/meta-ads/${c.clientId}?nivel=anuncio`}
              className="flex items-baseline gap-2 flex-wrap hover:text-foreground"
            >
              <span className="font-medium text-foreground">{c.loja}</span>
              <span className="text-foreground-muted truncate max-w-[20rem]">
                {c.nome}
              </span>
              <span className="text-foreground-muted">
                — custo por lead{" "}
                {comoVariacao(c.diagnostico.variacaoDoCusto) ?? "mudou"}
                {c.diagnostico.custoAgoraCents !== null &&
                  `, de ${reais(c.diagnostico.custoAntesCents ?? 0)} pra ${reais(c.diagnostico.custoAgoraCents)}`}
              </span>
            </Link>
          ))}
          {artes.length > ARTES_NA_TELA && (
            <span className="text-foreground-muted">
              e mais {artes.length - ARTES_NA_TELA}.
            </span>
          )}
        </Aviso>
      )}

      <p className="text-xs text-foreground-muted">
        Comparação dos últimos 7 dias com os 7 anteriores, anúncio por anúncio.{" "}
        <Link href="/meta-ads" className="text-accent hover:underline">
          Ver tudo no Meta Ads
        </Link>
        .
      </p>
    </div>
  );
}

function Aviso({
  tom,
  icone: Icone,
  titulo,
  children,
}: {
  tom: "grave" | "atencao" | "calmo";
  icone: typeof Megaphone;
  titulo: string;
  children: React.ReactNode;
}) {
  const cor =
    tom === "grave"
      ? "border-red-500/60 bg-red-500/5 text-red-600 dark:text-red-400"
      : tom === "atencao"
        ? "border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-400"
        : "border-sky-500/50 bg-sky-500/5 text-sky-700 dark:text-sky-300";

  return (
    <div className={`rounded-xl border px-3.5 py-3 ${cor}`}>
      <p className="text-sm font-semibold flex items-center gap-2">
        <Icone size={15} className="shrink-0" />
        {titulo}
      </p>
      <div className="mt-1.5 flex flex-col gap-1 text-sm text-foreground">
        {children}
      </div>
    </div>
  );
}

/** Uma loja na lista de um aviso — nome em destaque, motivo ao lado. */
function Loja({ l, children }: { l: LojaNoDia; children: React.ReactNode }) {
  return (
    <Link
      href={`/meta-ads/${l.clientId}`}
      className="flex items-baseline gap-2 flex-wrap hover:text-accent"
    >
      <span className="font-medium">{l.nome}</span>
      <span className="text-foreground-muted">— {children}</span>
    </Link>
  );
}
