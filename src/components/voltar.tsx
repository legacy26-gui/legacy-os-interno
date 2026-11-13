import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * O botão de voltar — um só pro sistema inteiro.
 *
 * Antes cada tela desenhava o seu, e todas copiaram o mesmo texto cinza de
 * 14px com uma setinha de 14px: o elemento com a MENOR área clicável da tela
 * era justamente o que a pessoa mais aperta, e no celular quase não dá pra
 * acertar. "Preciso ser mais intuitivo no sistema" começa por aqui.
 *
 * Agora é botão de verdade: borda em volta pra se enxergar como coisa
 * clicável, seta maior, e 44px de altura — que é a medida que a Apple e o
 * Google dão como mínimo pra um dedo acertar sem errar.
 *
 * O texto diz PRA ONDE se volta, não "Voltar". Numa tela de três níveis
 * (lista → loja → campanha) "Voltar" não informa nada; "Todas as lojas"
 * informa.
 */
export function Voltar({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="self-start inline-flex items-center gap-2 min-h-11 px-3.5 py-2.5 rounded-lg
        border border-border bg-surface text-sm font-medium
        text-foreground-muted hover:text-foreground hover:bg-surface-muted
        hover:border-border-forte transition-colors"
    >
      <ArrowLeft size={17} className="shrink-0" />
      {children}
    </Link>
  );
}
