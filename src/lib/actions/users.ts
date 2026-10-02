"use server";

import * as z from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { EMPRESAS, ehEmpresa } from "@/lib/empresa";
import type { Empresa } from "@/generated/prisma/enums";

function randomTempPassword() {
  return Math.random().toString(36).slice(-8) + "!A1";
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (user.role !== "ADMIN") throw new Error("Apenas administradores podem gerenciar usuários.");
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
