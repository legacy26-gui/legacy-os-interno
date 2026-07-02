import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionCookie, decrypt } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canAccessModule, type ModuleKey } from "@/lib/permissions";

export const verifySession = cache(async () => {
  const cookie = await getSessionCookie();
  const session = await decrypt(cookie);

  if (!session?.userId || session.expiresAt < Date.now()) {
    redirect("/login");
  }

  return session;
});

export const getCurrentUser = cache(async () => {
  const session = await verifySession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, active: true, mustChangePassword: true },
  });

  if (!user || !user.active) {
    redirect("/login");
  }

  return user;
});

export async function requireModuleAccess(module: ModuleKey) {
  const user = await getCurrentUser();
  if (!canAccessModule(user.role, module)) {
    redirect("/dashboard?erro=acesso-negado");
  }
  return user;
}
