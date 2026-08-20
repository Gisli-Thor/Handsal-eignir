import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/lib/auth.config";
import { unscopedDb } from "@/lib/db";
import { logAudit } from "@/core/audit/log";

const credentialsSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    // Future: rafræn skilríki (electronic ID) is added as another provider
    // here — the session shape and callbacks stay unchanged.
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await unscopedDb.user.findUnique({
          where: { email },
          include: { tenant: { select: { status: true, vertical: true } } },
        });
        if (!user || !user.active) return null;
        if (user.tenantId && user.tenant?.status !== "ACTIVE") return null;

        const passwordOk = await compare(password, user.passwordHash);
        if (!passwordOk) return null;

        await logAudit(unscopedDb, {
          tenantId: user.tenantId,
          actorUserId: user.id,
          action: "LOGIN",
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          tenantId: user.tenantId,
          role: user.role,
          vertical: user.tenant?.vertical ?? null,
        };
      },
    }),
  ],
});
