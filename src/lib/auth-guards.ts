import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";

export type TenantSession = Session & {
  user: Session["user"] & { tenantId: string };
};

/** Home route for a signed-in user's role. */
export function roleHome(session: Session): string {
  return session.user.role === "SUPERADMIN" ? "/admin" : "/dashboard";
}

export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

/** Any signed-in user that belongs to a tenant (ADMIN or AGENT). */
export async function requireTenantUser(): Promise<TenantSession> {
  const session = await requireSession();
  if (!session.user.tenantId) redirect("/admin");
  return session as TenantSession;
}

/** Tenant ADMIN only. */
export async function requireTenantAdmin(): Promise<TenantSession> {
  const session = await requireTenantUser();
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session;
}

/** Platform SUPERADMIN only. */
export async function requireSuperadmin(): Promise<Session> {
  const session = await requireSession();
  if (session.user.role !== "SUPERADMIN") redirect("/dashboard");
  return session;
}
