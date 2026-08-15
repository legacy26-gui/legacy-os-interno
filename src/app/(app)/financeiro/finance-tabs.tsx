"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, BarChart3, FileBarChart, Waves } from "lucide-react";

const TABS = [
  { href: "/financeiro", label: "Entradas e saídas", icon: ArrowLeftRight },
  { href: "/financeiro/analise", label: "Análise financeira", icon: BarChart3 },
  { href: "/financeiro/dre", label: "DRE", icon: FileBarChart },
  { href: "/financeiro/dfc", label: "DFC", icon: Waves },
] as const;

export function FinanceTabs({ month }: { month?: string }) {
  const pathname = usePathname();
  const query = month ? `?month=${month}` : "";

  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map(({ href, label, icon: Icon }) => {
        // "/financeiro" só fica ativo na raiz, senão casaria com todas as abas.
        const active = href === "/financeiro" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={`${href}${query}`}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
              active
                ? "bg-accent text-white border-accent"
                : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"
            }`}
          >
            <Icon size={15} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
