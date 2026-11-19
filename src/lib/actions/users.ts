"use server";

import * as z from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { EMPRESAS, ehEmpresa, veTodasAsEmpresas } from "@/lib/empresa";
import type { Empresa } from "@/generated/prisma/enums";

function randomTempPassword() {
  return Math.random().toString(36).slice(-8) + "!A1";
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (user.role !== "ADMIN") throw new Error("Apenas administradores podem gerenciar usuários.");
  // Administrar usuário é dar e tirar acesso a empresa. Quem não enxerga o
  // grupo inteiro não pode fazer isso: senão um administrador preso ao
  // Treinamentos marcaria a agência pra si mesmo e a separação cairia.
  if (!veTodasAsEmpresas(user.empresas)) {
    throw new Error("Só quem tem acesso a todas as empresas do grupo pode gerenciar usuários.");
  }
  return user;
}

const UserSchema = z.object({
  name: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail inválido."),
  role: z.enum(["ADMIN", "GERENTE", "GESTOR_TRAFEGO"]),
});

// Em quais empresas a pessoa trabalha. É isto que decide o que ela vê — o
// sócio do Treinamentos marcado só em TREINAMENTOS não vê o caixa da agência
// nem digitando a URL, porque o filtro vale na consulta ao banco.
function lerEmpresas(formData: FormData): Empresa[] {
  const marcadas = formData.getAll("empresas").filter((v): v is string => typeof v === "string");
  const lista = EMPRESAS.filter((e) => marcadas.includes(e));
  // Ninguém fica sem nenhuma: sem empresa a pessoa logaria e não veria nada.
  return lista.length > 0 ? lista : ["AGENCIA"];
}

export type UserFormState = { error?: string; tempPassword?: string } | undefined;

export async function createUser(_prevState: UserFormState, formData: FormData): Promise<UserFormState> {
  await requireAdmin();
  const parsed = UserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const empresas = lerEmpresas(formData);

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase().trim() } });
  if (existing) return { error: "Já existe um usuário com este e-mail." };

  const tempPassword = randomTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase().trim(),
      role: parsed.data.role,
      empresas,
      passwordHash,
      mustChangePassword: true,
    },
  });

  revalidatePath("/configuracoes");
  return { tempPassword };
}

/**
 * Em quais empresas do grupo a pessoa trabalha.
 *
 * É a tranca do acesso entre empresas: quem está só em TREINAMENTOS não
 * consegue ver nada da agência, porque toda consulta de dinheiro e de funil
 * confere esta lista (ver src/lib/empresa-atual.ts). Mexer aqui é mexer no acesso.
 */
export async function setUserEmpresas(userId: string, empresas: string[]) {
  const admin = await requireAdmin();

  const lista = EMPRESAS.filter((e) => empresas.includes(e));
  if (lista.length === 0) return { error: "Escolha pelo menos uma empresa." };
  if (!empresas.every(ehEmpresa)) return { error: "Empresa desconhecida." };

  // O admin não pode tirar a própria empresa e se trancar fora do sistema.
  if (userId === admin.id && lista.length === 0) {
    return { error: "Você não pode ficar sem empresa." };
  }

  await prisma.user.update({ where: { id: userId }, data: { empresas: lista } });
  revalidatePath("/configuracoes");
  revalidatePath("/", "layout");
}

export async function toggleUserActive(userId: string, active: boolean) {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { active } });
  revalidatePath("/configuracoes");
}

export type ResetPasswordState = { tempPassword?: string; error?: string } | undefined;

export async function resetUserPassword(userId: string): Promise<ResetPasswordState> {
  await requireAdmin();
  const tempPassword = randomTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: true } });
  revalidatePath("/configuracoes");
  return { tempPassword };
}

/**
 * Guarda o WhatsApp de uma pessoa da casa.
 *
 * ── Por que este campo existe ────────────────────────────────────────────
 *
 * É por ele que a IA sabe de quem é a mensagem que chega no privado dela — e
 * portanto quais lojas pode mostrar na resposta. Sem número cadastrado, a
 * pessoa recebe o recado de desconhecido, igual a qualquer um de fora.
 *
 * ── Por que só dígitos ───────────────────────────────────────────────────
 *
 * Porque o que a Z-API manda são dígitos, e porque o mesmo telefone circula
 * escrito de cinco maneiras. Guardar "(42) 98812-6561" e comparar com
 * "554288126561" é a receita de um número cadastrado que nunca casa — e o
 * sintoma seria a pessoa falando com a IA e recebendo "este é um atendimento
 * interno", sem ninguém entender por quê.
 *
 * O DDI é exigido pelo mesmo motivo: sem ele, "4288126561" poderia ser
 * brasileiro ou não, e a comparação por sufixo ficaria larga demais.
 */
export async function definirWhatsappDoUsuario(
  userId: string,
  numero: string,
): Promise<{ ok?: string; erro?: string }> {
  const quem = await getCurrentUser();
  if (quem.role !== "ADMIN") return { erro: "Só o administrador mexe nisso." };

  const digitos = numero.replace(/\D/g, "");

  if (!digitos) {
    await prisma.user.update({ where: { id: userId }, data: { whatsapp: null } });
    revalidatePath("/configuracoes");
    return { ok: "Número removido. Esta pessoa não fala mais com a IA." };
  }

  // 12 a 13 dígitos: 55 + DDD + 8 ou 9 do número.
  if (digitos.length < 12 || digitos.length > 13) {
    return {
      erro: "Põe com DDI e DDD, só números: 5542988126561.",
    };
  }
  if (!digitos.startsWith("55")) {
    return { erro: "O número precisa começar com 55 (DDI do Brasil)." };
  }

  const jaEDeOutro = await prisma.user.findFirst({
    where: { whatsapp: digitos, id: { not: userId } },
    select: { name: true },
  });
  if (jaEDeOutro) {
    return { erro: `Este número já é da ${jaEDeOutro.name}.` };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { whatsapp: digitos },
  });
  revalidatePath("/configuracoes");
  return { ok: "Número guardado. Esta pessoa já pode falar com a IA." };
}
