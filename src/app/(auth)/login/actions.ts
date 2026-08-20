"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { unscopedDb } from "@/lib/db";
import { logAudit } from "@/core/audit/log";
import { checkRateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export type LoginState = {
  error?: "invalidInput" | "invalidCredentials" | "rateLimited";
} | null;

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "invalidInput" };
  const { email, password } = parsed.data;

  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (
    !checkRateLimit(`login:ip:${ip}`, { limit: 20, windowMs: 60_000 }) ||
    !checkRateLimit(`login:email:${email}`, { limit: 5, windowMs: 60_000 })
  ) {
    return { error: "rateLimited" };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      await logAudit(unscopedDb, {
        action: "LOGIN_FAILED",
        metadata: { email, ip },
      });
      return { error: "invalidCredentials" };
    }
    // signIn throws a redirect on success — let Next.js handle it.
    throw error;
  }
}
