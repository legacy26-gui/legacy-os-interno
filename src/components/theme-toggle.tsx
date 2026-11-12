"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  // Qual ícone mostrar só se sabe NO NAVEGADOR: o tema vem do que a pessoa
  // escolheu da última vez, e o servidor não tem como saber disso.
  //
  // Por isso começa em nulo e só decide depois que a tela montou. Lendo a
  // classe já na primeira renderização — como estava antes — o servidor
  // mandava um ícone e o navegador descobria outro, e o React jogava fora a
  // tela inteira pra refazer. Dava um aviso em TODA página de quem usa o tema
  // claro, e um piscar junto.
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    // Lê a classe de novo em vez de confiar no estado: é ela que manda, e
    // assim um clique antes de a tela montar não inverte pro lado errado.
    const next = !document.documentElement.classList.contains("dark");
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("legacyos-theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-surface-muted hover:bg-border/60 transition-colors text-foreground-muted"
      aria-label="Alternar tema"
      type="button"
    >
      {/* Enquanto não se sabe o tema, o botão fica no lugar e vazio: o
          cabeçalho não pode pular quando o ícone aparece. */}
      {isDark === null ? (
        <span className="w-4 h-4" />
      ) : isDark ? (
        <Sun size={16} />
      ) : (
        <Moon size={16} />
      )}
    </button>
  );
}
