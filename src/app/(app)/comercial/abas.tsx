"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KanbanSquare, BarChart3 } from "lucide-react";

const ABAS = [
  { href: "/comercial", label: "Funil", icone: KanbanSquare },
  { href: "/comercial/dashboard", label: "Dashboard", icone: BarChart3 },
];

export function AbasComercial() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 p-1 rounded-xl bg-surface-muted border border-border self-start">
      {ABAS.map((aba) => {
        const ativa = aba.href === "/comercial" ? pathname === "/comercial" : pathname.startsWith(aba.href);
        const Icone = aba.icone;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              ativa ? "bg-accent text-white" : "text-foreground-muted hover:text-foreground"
            }`}
          >
            <Icone size={15} />
            {aba.label}
          </Link>
        );
      })}
    </div>
  );
}
