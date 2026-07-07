import type { Role } from "@/generated/prisma/enums";

export const MODULES = [
  "dashboard",
  "clientes",
  "financeiro",
  "contratos",
  "comercial",
  "operacoes",
  "trafego",
  "relatorios",
  "equipe",
  "marketing",
  "calendario",
  "suporte",
  "gestao-contas",
  "configuracoes",
] as const;

export type ModuleKey = (typeof MODULES)[number];

// Matriz de acesso por módulo. ADMIN sempre tem acesso total.
// Ajuste esta matriz conforme a política de acesso da agência evoluir.
const MODULE_ACCESS: Record<ModuleKey, Role[]> = {
  dashboard: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  clientes: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  financeiro: ["ADMIN", "GERENTE"],
  contratos: ["ADMIN", "GERENTE"],
  comercial: ["ADMIN", "GERENTE"],
  operacoes: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  trafego: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  relatorios: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  equipe: ["ADMIN"],
  marketing: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  calendario: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  suporte: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  "gestao-contas": ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  configuracoes: ["ADMIN"],
};

const ROUTE_MODULE: { prefix: string; module: ModuleKey }[] = [
  { prefix: "/clientes", module: "clientes" },
  { prefix: "/financeiro", module: "financeiro" },
  { prefix: "/contratos", module: "contratos" },
  { prefix: "/comercial", module: "comercial" },
  { prefix: "/operacoes", module: "operacoes" },
  { prefix: "/trafego", module: "trafego" },
  { prefix: "/relatorios", module: "relatorios" },
  { prefix: "/equipe", module: "equipe" },
  { prefix: "/marketing", module: "marketing" },
  { prefix: "/calendario", module: "calendario" },
  { prefix: "/suporte", module: "suporte" },
  { prefix: "/gestao-contas", module: "gestao-contas" },
  { prefix: "/configuracoes", module: "configuracoes" },
];

export function canAccessModule(role: Role, module: ModuleKey): boolean {
  return MODULE_ACCESS[module].includes(role);
}

export function moduleForPath(pathname: string): ModuleKey | null {
  const match = ROUTE_MODULE.find((r) => pathname.startsWith(r.prefix));
  return match?.module ?? null;
}

export function canAccessPath(role: Role, pathname: string): boolean {
  const mod = moduleForPath(pathname);
  if (!mod) return true; // rotas não mapeadas (dashboard, login etc.) são liberadas
  return canAccessModule(role, mod);
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  GERENTE: "Gerente",
  GESTOR_TRAFEGO: "Gestor de Tráfego",
};
