"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Abas de uma seção, no alto da tela.
//
// Existem pra tirar linha do menu lateral sem tirar tela nenhuma do sistema.
// Duas telas que respondem a mesma pergunta não precisam de duas linhas na
// lateral: viram uma linha e duas abas, e quem procura acha no mesmo lugar.
//
// O Financeiro já fazia isso com as quatro telas dele. Isto aqui é a mesma
// ideia, genérica, pros outros pares.

export interface Aba {
  href: string;
  label: string;
}

export function AbasDaSecao({ abas }: { abas: Aba[] }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2">
      {abas.map(({ href, label }) => {
        // Comparação exata: com startsWith, uma aba "/x" acenderia junto com
        // "/x/qualquer-coisa" e duas abas ficariam ativas ao mesmo tempo.
        const ativa = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
              ativa
                ? "bg-accent text-white border-accent"
                : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
