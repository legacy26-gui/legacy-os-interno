"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/dal";
import { EMPRESA_COOKIE, ehEmpresa } from "@/lib/empresa";
import { minhasEmpresas } from "@/lib/empresa-atual";

// Troca a empresa aberta na tela.
//
// A escolha fica num cookie, mas o cookie é conferido de novo em toda consulta
// (ver src/lib/empresa-atual.ts) — esta ação não é a tranca, é só o interruptor.
// Mesmo assim ela recusa empresa que a pessoa não tem: melhor não gravar lixo.
export async function trocarEmpresa(valor: string) {
  await getCurrentUser(); // precisa estar logado
  if (!ehEmpresa(valor)) return;

  const permitidas = await minhasEmpresas();
  if (!permitidas.includes(valor)) return;

  const cookieStore = await cookies();
  cookieStore.set(EMPRESA_COOKIE, valor, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Um ano: é preferência de uso, não credencial. Quem manda é a lista do
    // banco, que é consultada em cada página.
    maxAge: 60 * 60 * 24 * 365,
  });

  // A empresa muda o conteúdo de tudo, então revalida a árvore inteira.
  revalidatePath("/", "layout");
}
