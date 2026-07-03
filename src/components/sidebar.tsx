"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Users, Wallet, FileText, Target, ListChecks,
  TrendingUp, FileBarChart, UserCog, CalendarDays, CalendarClock, LifeBuoy, Settings,
  Menu, X,
} from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { canAccessModule, type ModuleKey } from "@/lib/permissions";

const NAV_ITEMS: { href: string; label: string; icon: typeof LayoutDashboard; module: ModuleKey | null }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: null },
  { href: "/clientes", label: "Clientes", icon: Users, module: "clientes" },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, module: "financeiro" },
  { href: "/contratos", label: "Contratos", icon: FileText, module: "contratos" },
  { href: "/comercial", label: "Comercial", icon: Target, module: "comercial" },
  { href: "/operacoes", label: "Operações", icon: ListChecks, module: "operacoes" },
  { href: "/trafego", label: "Tráfego Pago", icon: TrendingUp, module: "trafego" },
  { href: "/relatorios", label: "Relatórios", icon: FileBarChart, module: "relatorios" },
  { href: "/marketing", label: "Marketing", icon: CalendarDays, module: "marketing" },
  { href: "/calendario", label: "Calendário", icon: CalendarClock, module: "calendario" },
  { href: "/suporte", label: "Suporte", icon: LifeBuoy, module: "suporte" },
  { href: "/equipe", label: "Equipe", icon: UserCog, module: "equipe" },
  { href: "/configuracoes", label: "Configurações", icon: Settings, module: "configuracoes" },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items = NAV_ITEMS.filter((item) => !item.module || canAccessModule(role, item.module));

  function isActive(href: string) {
    return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
  }

  return (
    <>
      <button
        className="fixed top-4 left-4 z-50 md:hidden bg-sidebar text-sidebar-foreground p-2 rounded-lg shadow-lg border border-border"
        onClick={() => setOpen(!open)}
        aria-label="Menu"
        type="button"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {open && <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-sidebar text-sidebar-foreground z-40 flex flex-col border-r border-black/40
          transform transition-transform duration-300
          ${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 md:static md:flex`}
      >
        <div className="px-6 py-5 border-b border-white/10 flex flex-col min-h-[76px] justify-center">
          <span className="text-white font-black text-lg tracking-tight leading-none">
            LEGACY<span className="text-accent">OS</span>
          </span>
          <span className="text-zinc-500 text-[10px] font-medium tracking-[0.25em] mt-1">LEGACY DIGITAL</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-0.5">
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium text-sm
                  ${active ? "bg-accent text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"}`}
              >
                <Icon size={17} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <p className="text-zinc-600 text-[10px] text-center">Legacy Digital © 2026</p>
        </div>
      </aside>
    </>
  );
}
