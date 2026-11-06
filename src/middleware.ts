import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled } from "@/lib/auth/config";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/session";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/cron/",
  "/api/health",
  "/api/agent/",
];

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isAuthEnabled() || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/status")) {
    return NextResponse.next();
  }

  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (user) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
