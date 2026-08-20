import type { Role, Vertical } from "@/generated/prisma/enums";
import type { DefaultSession } from "next-auth";
// Load the real module so the JWT augmentation below merges instead of
// declaring a fresh ambient module.
import type {} from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** null for SUPERADMIN (platform-level, no tenant) */
      tenantId: string | null;
      role: Role;
      vertical: Vertical | null;
    } & DefaultSession["user"];
  }

  interface User {
    tenantId?: string | null;
    role?: Role;
    vertical?: Vertical | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    tenantId?: string | null;
    role?: Role;
    vertical?: Vertical | null;
  }
}
