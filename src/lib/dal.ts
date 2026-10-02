import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionCookie, decrypt } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canAccessModule, moduleServesEmpresa, type ModuleKey } from "@/lib/permissions";
import { empresaAtual } from "@/lib/empresa-atual";

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
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      mustChangePassword: true,
      // Em quais empresas a pessoa trabalha. Vem do banco, não do cookie — é
      // esta lista que decide o que ela pode ver.
      empresas: true,
    },
  });

  if (!user || !user.active) {
    redirect("/login");
  }

  return user;
});

export async function requireModuleAccess(module: ModuleKey) {
  const user = await getCurrentUser();
  if (!canAccessModule(user.role, module, user.email)) {
    redirect("/dashboard?erro=acesso-negado");
  }
  // Tela que só existe na agência, com o Treinamentos aberto: manda pro
  // dashboard explicando, em vez de mostrar uma tela vazia que parece defeito.
  if (!moduleServesEmpresa(module, await empresaAtual())) {
    redirect("/dashboard?erro=outra-empresa");
  }
  return user;
}
