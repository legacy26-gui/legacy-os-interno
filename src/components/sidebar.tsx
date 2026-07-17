"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Users, Wallet, FileText, Target, ListChecks,
  UserCog, CalendarClock, LifeBuoy, Settings,
  Gauge, ClipboardList, ChevronDown, Menu, X,
} from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { canAccessModule, type ModuleKey } from "@/lib/permissions";

type NavLeaf = { href: string; label: string; icon: typeof LayoutDashboard; module: ModuleKey | null };
type NavGroup = { label: string; items: NavLeaf[] };

// Itens soltos no topo, sempre visíveis (sujeitos à permissão do módulo).
const TOP_ITEMS: NavLeaf[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: null },
  { href: "/meu-dia", label: "Meu Dia", icon: ClipboardList, module: null },
];

// Menu completo (Admin/Gerente), organizado em pastas.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Comercial",
    items: [
      { href: "/clientes", label: "Clientes", icon: Users, module: "clientes" },
      { href: "/comercial", label: "Comercial", icon: Target, module: "comercial" },
      { href: "/contratos", label: "Contratos", icon: FileText, module: "contratos" },
      { href: "/financeiro", label: "Financeiro", icon: Wallet, module: "financeiro" },
    ],
  },
  {
    label: "Operacional",
    items: [
      { href: "/operacoes", label: "Operações", icon: ListChecks, module: "operacoes" },
      { href: "/gestao-contas", label: "Gestão de Contas", icon: Gauge, module: "gestao-contas" },
      { href: "/calendario", label: "Calendário", icon: CalendarClock, module: "calendario" },
      { href: "/suporte", label: "Suporte", icon: LifeBuoy, module: "suporte" },
    ],
  },
  {
    label: "RH",
    items: [{ href: "/equipe", label: "Equipe", icon: UserCog, module: "equipe" }],
  },
  {
    label: "Sistema",
    items: [{ href: "/configuracoes", label: "Configurações", icon: Settings, module: "configuracoes" }],
  },
];

// Menu mínimo do Gestor de Tráfego: só o essencial pra trabalhar no dia a dia.
const EMPLOYEE_ITEMS: NavLeaf[] = [
  { href: "/meu-dia", label: "Meu Dia", icon: ClipboardList, module: null },
  { href: "/suporte", label: "Suporte", icon: LifeBuoy, module: "suporte" },
  { href: "/calendario", label: "Calendário", icon: CalendarClock, module: "calendario" },
];

function NavLink({ href, label, icon: Icon, active, onClick }: NavLeaf & { active: boolean; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium text-sm
        ${active ? "bg-accent text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"}`}
    >
      <Icon size={17} />
      {label}
    </Link>
  );
}

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string) {
    return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
  }

  const isEmployee = role === "GESTOR_TRAFEGO";

  const topItems = TOP_ITEMS.filter((item) => !isEmployee && (!item.module || canAccessModule(role, item.module)));
  const employeeItems = EMPLOYEE_ITEMS.filter((item) => !item.module || canAccessModule(role, item.module));
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => !item.module || canAccessModule(role, item.module)),
  })).filter((g) => g.items.length > 0);

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
          {isEmployee
            ? employeeItems.map((item) => (
                <NavLink key={item.href} {...item} active={isActive(item.href)} onClick={() => setOpen(false)} />
              ))
            : (
              <>
                {topItems.map((item) => (
                  <NavLink key={item.href} {...item} active={isActive(item.href)} onClick={() => setOpen(false)} />
                ))}
                <div className="mt-2 flex flex-col gap-0.5">
                  {groups.map((group) => (
                    <NavFolder key={group.label} group={group} isActive={isActive} onNavigate={() => setOpen(false)} />
                  ))}
                </div>
              </>
            )}
        </nav>

        <div className="p-4 border-t border-white/10">
          <p className="text-zinc-600 text-[10px] text-center">Legacy Digital © 2026</p>
        </div>
      </aside>
    </>
  );
}

function NavFolder({
  group,
  isActive,
  onNavigate,
}: {
  group: NavGroup;
  isActive: (href: string) => boolean;
  onNavigate: () => void;
}) {
  const hasActiveChild = group.items.some((item) => isActive(item.href));
  const [expanded, setExpanded] = useState(hasActiveChild);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {group.label}
        <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="flex flex-col gap-0.5 mb-1">
          {group.items.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} onClick={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
