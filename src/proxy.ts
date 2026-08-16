import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt } from "@/lib/session";
import { canAccessPath } from "@/lib/permissions";

const PUBLIC_ROUTES = ["/login"];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  const cookie = request.cookies.get("legacyos_session")?.value;
  const session = await decrypt(cookie);
  const isAuthenticated = !!session?.userId && session.expiresAt > Date.now();

  if (!isAuthenticated && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuthenticated && isPublicRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isAuthenticated && session && !canAccessPath(session.role, pathname)) {
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
