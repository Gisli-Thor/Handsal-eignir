import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration (no Prisma/bcrypt imports) shared by the
 * middleware and the full server-side config in src/lib/auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.tenantId = user.tenantId ?? null;
        token.role = user.role;
        token.vertical = user.vertical ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId) session.user.id = token.userId;
      session.user.tenantId = token.tenantId ?? null;
      if (token.role) session.user.role = token.role;
      session.user.vertical = token.vertical ?? null;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
