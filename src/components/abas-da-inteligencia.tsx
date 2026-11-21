"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lightbulb, Package, Sparkles, Trophy, TrendingUp } from "lucide-react";

// As abas da Inteligência Comercial.
//
// Uma aba só no menu, com as telas que respondem perguntas parecidas ("como estão as lojas,
// o que estão vendendo, o que têm no estoque") por dentro. Cada aba é um endereço de verdade
// (Link, não botão): abre em outra aba do navegador, volta no botão de voltar e pode ser
// mandada por mensagem. Ranking e Controle de Vendas continuam nos endereços de sempre;
// o layout deles é que põe estas abas em cima.

const ABAS = [
  { href: "/inteligencia-comercial", rotulo: "Visão geral", icone: Lightbulb, exata: true },
  { href: "/inteligencia-comercial/sugestoes", rotulo: "Sugestões", icone: Sparkles, exata: false },
  { href: "/inteligencia-comercial/estoque", rotulo: "Estoque", icone: Package, exata: false },
  { href: "/ranking-lojas", rotulo: "Ranking de lojas", icone: Trophy, exata: false },
  { href: "/controle-vendas", rotulo: "Controle de vendas", icone: TrendingUp, exata: false },
] as const;

export function AbasDaInteligencia() {
  const pathname = usePathname();
  return (
    <nav aria-label="Inteligência Comercial" className="flex flex-wrap gap-2 mb-6">
      {ABAS.map(({ href, rotulo, icone: Icone, exata }) => {
        const ativa = exata ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativa ? "page" : undefined}
            className={`inline-flex items-center gap-2 px-3.5 min-h-10 rounded-lg text-sm font-medium border transition-colors ${
              ativa
                ? "bg-accent text-white border-accent"
                : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"
            }`}
          >
            <Icone size={15} />
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
