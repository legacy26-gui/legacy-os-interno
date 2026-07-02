import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { logout } from "@/lib/actions/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";

export function Topbar({ name, role }: { name: string; role: Role }) {
  return (
    <header className="h-16 border-b border-border bg-surface flex items-center justify-between px-4 md:px-6 flex-shrink-0">
      <div className="md:hidden w-8" />
      <div className="hidden md:block" />
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="flex items-center gap-2.5 pl-1">
          <div className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center font-semibold text-xs flex-shrink-0">
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-medium">{name}</p>
            <p className="text-xs text-foreground-muted">{ROLE_LABELS[role]}</p>
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-surface-muted hover:bg-border/60 transition-colors text-foreground-muted"
            aria-label="Sair"
          >
            <LogOut size={16} />
          </button>
        </form>
      </div>
    </header>
  );
}
