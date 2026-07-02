"use server";

import * as z from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";

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

export type UserFormState = { error?: string; tempPassword?: string } | undefined;

export async function createUser(_prevState: UserFormState, formData: FormData): Promise<UserFormState> {
  await requireAdmin();
  const parsed = UserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase().trim() } });
  if (existing) return { error: "Já existe um usuário com este e-mail." };

  const tempPassword = randomTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase().trim(),
      role: parsed.data.role,
      passwordHash,
      mustChangePassword: true,
    },
  });

  revalidatePath("/configuracoes");
  return { tempPassword };
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
