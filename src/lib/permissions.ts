import type { Empresa, Role } from "@/generated/prisma/enums";

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
  "gravacoes",
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
  // Mesmo pessoal do Calendário — inclusive o Gestor de Tráfego, que é quem
  // lança gravação no dia a dia.
  gravacoes: ["ADMIN", "GERENTE", "GESTOR_TRAFEGO"],
};

// Quais telas existem em cada empresa.
//
// Esta é uma lista do que É LIBERADO, não do que é bloqueado — e isso é de
// propósito. Com lista de bloqueio, uma tela nova criada amanhã nasceria
// liberada, e bastava alguém esquecer de incluí-la pra vazar dado da agência
// pro sócio do Treinamentos. Com lista de liberação, tela nova nasce fechada:
// o erro possível é "falta uma aba", não "vazou o caixa".
//
// Tudo que não está aqui simplesmente não abre com o Treinamentos na tela.
//
// A agência é a casa inteira: tudo que existe é dela.
const MODULOS_DO_TREINAMENTOS: ModuleKey[] = [
  "dashboard",
  "financeiro",
  "comercial",
  "gravacoes",
];

export function moduleServesEmpresa(module: ModuleKey, empresa: Empresa): boolean {
  if (empresa === "AGENCIA") return true;
  return MODULOS_DO_TREINAMENTOS.includes(module);
}

const ROUTE_MODULE: { prefix: string; module: ModuleKey }[] = [
  // Meu Dia é a rotina de quem cuida de conta de loja: lista os clientes que a
  // pessoa gerencia. Vai junto de "clientes" pra não ficar de fora da
  // conferência de empresa, como ficou até aqui.
  { prefix: "/meu-dia", module: "clientes" },
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
  // Gravações tem chave própria (e não a do Calendário) porque o Calendário
  // geral mostra tarefa, contrato e férias da agência: ele não pode abrir pro
  // Treinamentos, mas a gravação pode.
  { prefix: "/gravacoes", module: "gravacoes" },
  { prefix: "/suporte", module: "suporte" },
  { prefix: "/gestao-contas", module: "gestao-contas" },
  // O ranking das lojas vive fora de /gestao-contas pra ser uma aba própria no
  // menu, mas quem vê é o mesmo pessoal que lança as vendas.
  { prefix: "/ranking-lojas", module: "gestao-contas" },
  // Mesma coisa pro controle de vendas: é a venda da loja, lançada na Gestão
  // de Contas. Como "gestao-contas" não está liberado pro Treinamentos, esta
  // tela fica fora de lá automaticamente.
  { prefix: "/controle-vendas", module: "gestao-contas" },
  { prefix: "/playbooks", module: "playbooks" },
  { prefix: "/configuracoes", module: "configuracoes" },
];

// Acessos dados a pessoas específicas, independente do cargo. Serve pra quando
// alguém precisa de um módulo que o cargo dela não abre por padrão, sem liberar
// pra todo mundo que tem aquele cargo.
// Andrielli é quem trabalha as fichas dos clientes novos e a operação do dia.
// O e-mail dela já apareceu escrito de mais de um jeito (andriele/andrielli),
// então casamos pelo começo do endereço, dentro do domínio da agência — e NÃO
// só pelo começo: com outro domínio, qualquer um que se cadastrasse como
// "andriel@..." herdaria os acessos dela.
//
// Fica exportado porque os alertas também precisam saber quem ela é, e essa
// regra não pode existir escrita em dois lugares: no dia em que o e-mail dela
// mudar, mexe-se aqui e o sistema inteiro acompanha.
export function ehAndrielli(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return /^andriel/i.test(e) && e.endsWith("@legacydigital.com");
}

const ACESSOS_POR_PESSOA: { quem: (email: string) => boolean; modulos: ModuleKey[] }[] = [
  {
    quem: ehAndrielli,
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
