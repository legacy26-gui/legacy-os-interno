import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Empresa } from "@/generated/prisma/enums";
import { EMPRESA_COOKIE, ehEmpresa, empresasPermitidas } from "@/lib/empresa";

// Qual empresa do grupo está aberta na tela agora.
//
// A regra que manda aqui: a separação vale na CONSULTA AO BANCO, não no menu.
// Esconder a aba não protege nada — quem digita o endereço na mão chega na
// página do mesmo jeito. Então toda tela de dinheiro e de funil busca a
// empresa por esta função, e toda consulta leva o filtro.
//
// Como funciona: a escolha fica num cookie (pra a pessoa não ter que escolher
// a cada clique), mas o cookie NUNCA decide sozinho. Ele é sempre conferido
// contra a lista de empresas que a pessoa tem no banco; se não estiver na
// lista, cai na primeira empresa dela. Cookie forjado não abre nada.

// A empresa aberta na tela, já conferida contra o que a pessoa pode ver.
export const empresaAtual = cache(async (): Promise<Empresa> => {
  // Import aqui dentro, e não no topo, porque o dal.ts também importa este
  // arquivo — subir o import criaria um ciclo entre os dois.
  const { getCurrentUser } = await import("@/lib/dal");
  const user = await getCurrentUser();
  const permitidas = empresasPermitidas(user.empresas);

  const escolhida = (await cookies()).get(EMPRESA_COOKIE)?.value;
  if (ehEmpresa(escolhida) && permitidas.includes(escolhida)) return escolhida;

  return permitidas[0];
});

// Filtro pronto pra entrar em qualquer `where` do Prisma. Existe pra a
// chamada ficar curta e pra ninguém escrever o nome do campo errado.
export async function filtroEmpresa(): Promise<{ empresa: Empresa }> {
  return { empresa: await empresaAtual() };
}

// Quem vê mais de uma empresa pode ver o consolidado do grupo. Quem vê uma só
// não pode nem saber que a outra existe.
export const podeVerGrupo = cache(async (): Promise<boolean> => {
  const { getCurrentUser } = await import("@/lib/dal");
  const user = await getCurrentUser();
  return empresasPermitidas(user.empresas).length > 1;
});

export const minhasEmpresas = cache(async (): Promise<Empresa[]> => {
  const { getCurrentUser } = await import("@/lib/dal");
  const user = await getCurrentUser();
  return empresasPermitidas(user.empresas);
});

// Barra a página inteira quando a pessoa tenta abrir dado de uma empresa que
// não é dela — por link direto, por endereço digitado, não importa. 404 em vez
// de "acesso negado" de propósito: não confirma que a outra empresa existe.
export async function exigirEmpresa(empresa: Empresa): Promise<Empresa> {
  const permitidas = await minhasEmpresas();
  if (!permitidas.includes(empresa)) notFound();
  return empresa;
}
