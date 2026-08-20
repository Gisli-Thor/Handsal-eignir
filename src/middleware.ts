import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login"];

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const isPublic = PUBLIC_PATHS.some(
    (p) => nextUrl.pathname === p || nextUrl.pathname.startsWith(`${p}/`),
  );

  if (!session?.user) {
    if (isPublic) return NextResponse.next();
    const loginUrl = new URL("/login", nextUrl);
    return NextResponse.redirect(loginUrl);
  }

  const home = session.user.role === "SUPERADMIN" ? "/admin" : "/dashboard";

  if (isPublic || nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL(home, nextUrl));
  }

  const isAdminArea = nextUrl.pathname.startsWith("/admin");
  const isSuperadmin = session.user.role === "SUPERADMIN";

  // Superadmins live in /admin and never see tenant business screens;
  // tenant users never see /admin.
  if (isAdminArea && !isSuperadmin) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }
  if (!isAdminArea && isSuperadmin) {
    return NextResponse.redirect(new URL("/admin", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Everything except Next internals, static assets and the Auth.js API.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)).*)"],
};
