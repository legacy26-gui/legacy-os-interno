import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt } from "@/lib/session";
import { canAccessPath, moduleForPath, moduleHasPersonalGrant } from "@/lib/permissions";

// /formulario é o link que mandamos pro cliente novo preencher: precisa abrir
// sem login e não pode redirecionar quem já está logado (o Guilherme conferindo
// o link também tem que ver o formulário).
const PUBLIC_ROUTES = ["/login"];
const OPEN_ROUTES = ["/formulario"];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  if (OPEN_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get("legacyos_session")?.value;
  const session = await decrypt(cookie);
  const isAuthenticated = !!session?.userId && session.expiresAt > Date.now();

  if (!isAuthenticated && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuthenticated && isPublicRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Sessão criada antes de o e-mail entrar no cookie não sabe dizer se a pessoa
  // tem acesso individual. Nesses módulos deixamos passar aqui e quem decide é
  // a página, que lê o usuário direto do banco.
  const modulo = moduleForPath(pathname);
  const decidirNaPagina = !session?.email && !!modulo && moduleHasPersonalGrant(modulo);

  if (isAuthenticated && session && !decidirNaPagina && !canAccessPath(session.role, pathname, session.email)) {
    return NextResponse.redirect(new URL("/dashboard?erro=acesso-negado", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Arquivos do PWA (manifest, service worker e página de offline) ficam fora
  // da autenticação: o navegador busca o manifest sem cookie, e se ele cair no
  // redirect pro login o app deixa de ser instalável.
  matcher: [
    "/((?!api|_next/static|_next/image|manifest.webmanifest|sw\\.js|offline|.*\\.png$|favicon.ico).*)",
  ],
};
