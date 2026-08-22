"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { logAudit } from "@/core/audit/log";
import { commissionSchemeSchema } from "@/core/commission/scheme";
import { requireTenantAdmin } from "@/lib/auth-guards";
import { unscopedDb } from "@/lib/db";

export type SettingsActionState = { ok?: boolean; error?: "invalid" | "unknown" } | null;

/** Tenant-default söluþóknun scheme (SPEC §10). Tenant is a platform model —
 * written via unscopedDb, but strictly to the caller's own tenant. Passing
 * null clears the scheme (Prisma.DbNull — plain null would store JSON null). */
export async function updateTenantCommissionSchemeAction(
  scheme: unknown,
): Promise<SettingsActionState> {
  try {
    const session = await requireTenantAdmin();
    let value: Prisma.InputJsonObject | null = null;
    if (scheme !== null && scheme !== undefined) {
      const parsed = commissionSchemeSchema.safeParse(scheme);
      if (!parsed.success) return { error: "invalid" };
      value = parsed.data as unknown as Prisma.InputJsonObject;
    }
    await unscopedDb.tenant.update({
      where: { id: session.user.tenantId },
      data: { commissionScheme: value ?? Prisma.DbNull },
    });
    await logAudit(unscopedDb, {
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      action: "COMMISSION_SCHEME_UPDATED",
      targetType: "Tenant",
      targetId: session.user.tenantId,
      metadata: { cleared: value === null },
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch {
    return { error: "unknown" };
  }
}
