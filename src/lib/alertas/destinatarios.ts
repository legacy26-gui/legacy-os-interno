import { canAccessModule, moduleServesEmpresa, ehAndrielli } from "@/lib/permissions";
import { empresasPermitidas, veTodasAsEmpresas } from "@/lib/empresa";
import type { Empresa, Role } from "@/generated/prisma/enums";
import type { Alerta, TipoDeAlerta } from "./tipos";

// Quem recebe cada alerta.
//
// Este arquivo é o roteamento, e é o único lugar onde se mexe pra trocar de
// pessoa. A regra foi definida pelo Guilherme:
//
//   loja sem vender ......... Andrielli
//   gravação atrasada ....... Andrielli
//   implantação parada ...... Andrielli
//   mensalidade vencida ..... só ele
//   gestor de tráfego ....... nada
//
// A decisão que sustenta a central: **todo alerta tem dono.** Alerta que vai
// pra todo mundo é alerta de ninguém — em uma semana a equipe desliga a
// notificação e o sistema fica sem voz. Por isso nada aqui manda "pra todos".

export interface Pessoa {
  id: string;
  name: string;
  email: string;
  role: Role;
  empresas: Empresa[];
}

/**
 * O dono da casa — e NÃO "qualquer ADMIN".
 *
 * A diferença importa: o sócio do Legacy Treinamentos também é ADMIN no
 * sistema. Roteando por cargo, ele passaria a receber no celular o aviso de
 * mensalidade vencida do Treinamentos, que as travas de empresa deixariam
 * passar com razão (é o dinheiro da empresa dele). Só que o pedido foi
 * "mensalidade avisa só eu", e aqui é pra cumprir isso ao pé da letra.
 *
 * Quem é o dono: o ADMIN que enxerga o grupo inteiro. É a mesma definição que
 * o resto do sistema já usa pra liberar a visão consolidada, então as duas
 * coisas não saem de sincronia.
 *
 * Pra o sócio passar a receber as mensalidades da empresa dele, troca-se esta
 * função por `p.role === "ADMIN"` e mais nada: as travas de empresa cuidam do
 * resto sozinhas, e ele continua sem ver um centavo da agência.
 */
export function ehODono(p: Pessoa): boolean {
  return p.role === "ADMIN" && veTodasAsEmpresas(p.empresas);
}

const QUEM_RECEBE: Record<TipoDeAlerta, (p: Pessoa) => boolean> = {
  "venda-parada": (p) => ehAndrielli(p.email),
  "gravacao-atrasada": (p) => ehAndrielli(p.email),
  "implantacao-parada": (p) => ehAndrielli(p.email),
  "mensalidade-vencida": ehODono,
};

/**
 * Se este alerta é desta pessoa. São quatro travas, e todas têm que passar.
 *
 * A primeira é o roteamento. As outras três existem porque o roteamento é uma
 * lista escrita à mão, e lista escrita à mão erra: se amanhã alguém puser o
 * sócio do Treinamentos como destinatário de um alerta da agência por
 * descuido, as travas 2, 3 e 4 barram sozinhas. É o mesmo princípio das telas
 * — a separação vale na consulta, não no menu.
 */
export function alertaEDaPessoa(pessoa: Pessoa, alerta: Alerta): boolean {
  // 1. É pra ela?
  if (!QUEM_RECEBE[alerta.tipo](pessoa)) return false;
  return podeVerAlerta(pessoa, alerta);
}

/**
 * As travas de visibilidade, sem o roteamento. Separadas porque o dono do
 * sistema pode querer VER o que a equipe está vendo sem RECEBER no celular —
 * mas nem ele atravessa a separação das empresas.
 */
export function podeVerAlerta(pessoa: Pessoa, alerta: Alerta): boolean {
  // 2. Ela trabalha na empresa de onde veio o problema?
  if (!empresasPermitidas(pessoa.empresas).includes(alerta.empresa)) return false;
  // 3. A tela onde isso se resolve existe nessa empresa?
  if (!moduleServesEmpresa(alerta.modulo, alerta.empresa)) return false;
  // 4. Ela pode abrir essa tela? Alerta que leva pra porta trancada é pior
  //    que alerta nenhum: a pessoa vê o problema e não tem como agir.
  if (!canAccessModule(pessoa.role, alerta.modulo, pessoa.email)) return false;
  return true;
}

/** Quem é dono de algum tipo de alerta — os únicos que o robô precisa olhar. */
export function recebeAlgumAlerta(pessoa: Pessoa): boolean {
  return Object.values(QUEM_RECEBE).some((ehDele) => ehDele(pessoa));
}
