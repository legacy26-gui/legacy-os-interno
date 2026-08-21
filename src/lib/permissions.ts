import type { Role } from "@/generated/prisma/enums";

export const MODULES = [
  "dashboard",
  "clientes",
  "formularios",
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
  "playbooks",
  "configuracoes",
] as const;

export type ModuleKey = (typeof MODULES)[number];

// Matriz de acesso por módulo. ADMIN sempre tem acesso total.
// Ajuste esta matriz conforme a política de acesso da agência evoluir.
const MODULE_ACCESS: Record<ModuleKey, Role[]> = {
  dashboard: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  clientes: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  formularios: ["ADMIN", "GERENTE"],
  financeiro: ["ADMIN"],
  contratos: ["ADMIN", "GERENTE"],
  comercial: ["ADMIN"],
  operacoes: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  trafego: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  relatorios: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  equipe: ["ADMIN"],
  marketing: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  calendario: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  suporte: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  "gestao-contas": ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  playbooks: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
  configuracoes: ["ADMIN"],
};

const ROUTE_MODULE: { prefix: string; module: ModuleKey }[] = [
  { prefix: "/clientes", module: "clientes" },
  { prefix: "/formularios", module: "formularios" },
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
  { prefix: "/playbooks", module: "playbooks" },
  { prefix: "/configuracoes", module: "configuracoes" },
];

// Acessos dados a pessoas específicas, independente do cargo. Serve pra quando
// alguém precisa de um módulo que o cargo dela não abre por padrão, sem liberar
// pra todo mundo que tem aquele cargo.
const ACESSOS_POR_PESSOA: { quem: (email: string) => boolean; modulos: ModuleKey[] }[] = [
  {
    // Andrielli é quem trabalha as fichas dos clientes novos. O e-mail dela já
    // apareceu escrito de mais de um jeito (andriele/andrielli), então casamos
    // pelo começo do endereço, dentro do domínio da agência.
    quem: (email) => /^andriel/i.test(email) && email.toLowerCase().endsWith("@legacydigital.com"),
    modulos: ["formularios"],
  },
];

export function canAccessModule(role: Role, module: ModuleKey, email?: string | null): boolean {
  if (MODULE_ACCESS[module].includes(role)) return true;
  if (email && ACESSOS_POR_PESSOA.some((a) => a.quem(email) && a.modulos.includes(module))) return true;
  return false;
}

export function moduleForPath(pathname: string): ModuleKey | null {
  const match = ROUTE_MODULE.find((r) => pathname.startsWith(r.prefix));
  return match?.module ?? null;
}

// Diz se o módulo pode ser liberado pra alguém fora do cargo. O proxy usa isso
// pra não barrar quem tem sessão antiga (sem e-mail no cookie) antes da página
// conferir no banco.
export function moduleHasPersonalGrant(module: ModuleKey): boolean {
  return ACESSOS_POR_PESSOA.some((a) => a.modulos.includes(module));
}

export function canAccessPath(role: Role, pathname: string, email?: string | null): boolean {
  const mod = moduleForPath(pathname);
  if (!mod) return true; // rotas não mapeadas (dashboard, login etc.) são liberadas
  return canAccessModule(role, mod, email);
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  GERENTE: "Gerente",
  GESTOR_TRAFEGO: "Gestor de Tráfego",
};
