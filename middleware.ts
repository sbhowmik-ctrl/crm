import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that are always publicly accessible.
const PUBLIC_ROUTES = ["/login", "/api/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

export default auth((req: NextRequest & { auth: Awaited<ReturnType<typeof auth>> | null }) => {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // No valid session → redirect to login, preserving the original destination.
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Run middleware on every route except static assets and Next.js internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
