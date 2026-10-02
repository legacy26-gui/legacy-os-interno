// As duas empresas do grupo: quem são e como se chamam na tela.
//
// Este arquivo não toca no banco de propósito — o seletor no topo e as telas de
// configuração são componentes de cliente e precisam dos nomes. Quem decide
// QUAL empresa está aberta (e confere se a pessoa pode vê-la) é
// @/lib/empresa-atual, que só roda no servidor.

import type { Empresa } from "@/generated/prisma/enums";

export const EMPRESAS: Empresa[] = ["AGENCIA", "TREINAMENTOS"];

export const EMPRESA_LABELS: Record<Empresa, string> = {
  AGENCIA: "Legacy Automotivo",
  TREINAMENTOS: "Legacy Treinamentos",
};

// Nome curto, pra caber no seletor e nos títulos.
export const EMPRESA_CURTA: Record<Empresa, string> = {
  AGENCIA: "Automotivo",
  TREINAMENTOS: "Treinamentos",
};

export const EMPRESA_COOKIE = "legacyos_empresa";

export function ehEmpresa(valor: unknown): valor is Empresa {
  return typeof valor === "string" && (EMPRESAS as string[]).includes(valor);
}

// Empresas que a pessoa pode ver. Ninguém fica sem nenhuma: usuário antigo,
// criado antes desta separação existir, é da agência.
export function empresasPermitidas(empresas: Empresa[] | undefined | null): Empresa[] {
  const lista = (empresas ?? []).filter(ehEmpresa);
  return lista.length > 0 ? lista : ["AGENCIA"];
}
