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
  /**
   * Quem decide se esta aba está acesa, quando o caminho não decide.
   *
   * ── Por que isto precisou existir ────────────────────────────────────
   *
   * As abas do Meta Ads não mudam de caminho: trocam o `?nivel=` do MESMO
   * caminho. E a comparação daqui era só `pathname === href`, que ignora a
   * busca — então em `/meta-ads/x?nivel=anuncio` nenhuma das três batia, e
   * acendia a primeira por acaso. A tela mostrava cinco anúncios com a aba
   * "Campanhas" iluminada.
   *
   * Quem sabe qual aba está aberta é a página, que já leu o parâmetro. Aqui
   * só se obedece. Sem este campo, continua valendo o caminho — que é o que
   * as outras quatro telas que usam este componente precisam.
   */
  ativa?: boolean;
}

export function AbasDaSecao({
  abas,
  grandes = false,
}: {
  abas: Aba[];
  grandes?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className={`flex flex-wrap ${grandes ? "gap-1.5" : "gap-2"}`}>
      {abas.map(({ href, label, ativa }) => {
        // Comparação exata: com startsWith, uma aba "/x" acenderia junto com
        // "/x/qualquer-coisa" e duas abas ficariam ativas ao mesmo tempo.
        const acesa = ativa ?? pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={acesa ? "page" : undefined}
            className={
              grandes
                ? // As abas largas do Gerenciador: alvo grande, texto maior,
                  // e a ativa presa na borda de baixo como uma pasta aberta.
                  `px-5 py-3 rounded-t-xl text-sm font-semibold border border-b-0 -mb-px transition-colors ${
                    acesa
                      ? "bg-surface text-accent border-border"
                      : "bg-transparent text-foreground-muted border-transparent hover:bg-surface-muted"
                  }`
                : `px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    acesa
                      ? "bg-accent text-white border-accent"
                      : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"
                  }`
            }
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
