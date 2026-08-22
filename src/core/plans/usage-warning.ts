/**
 * 90% plan-usage warning email (SPEC §12). Runs as an in-process job (a
 * pipeline hook would miss the superadmin-lowers-plan case) across all
 * tenants via the unscoped client.
 *
 * Idempotency copies the fyrirvari-reminder pattern: `Tenant.usageWarnedAt`
 * is stamped BEFORE sending (rolled back on send failure) and CLEARED when
 * usage drops below 90%, so the next crossing warns again.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import type { EmailAdapter } from "@/core/ports/email";

export interface UsageWarningResult {
  sent: number;
  cleared: number;
  errors: number;
}

function warningEmail(input: {
  adminName: string;
  tenantName: string;
  active: number;
  limit: number;
}): { subject: string; text: string } {
  return {
    subject: `Áskrift að nálgast hámark — ${input.active} af ${input.limit} virkum eignum`,
    text: [
      `Sæl/l ${input.adminName},`,
      "",
      `${input.tenantName} er með ${input.active} af ${input.limit} virkum eignum í sölu — áskriftin er komin yfir 90% nýtingu.`,
      "Þegar hámarkinu er náð er ekki hægt að setja fleiri eignir í sölu.",
      "Hafðu samband við Handsal til að uppfæra áskriftina.",
      "",
      "— Handsal",
      "",
      `(Your plan is over 90% utilization: ${input.active} of ${input.limit} active listings.)`,
    ].join("\n"),
  };
}

export async function sendUsageWarnings(
  db: PrismaClient,
  email: EmailAdapter,
  /** Active-band stages per vertical (composed by the caller from the
   * vertical configs — core stays vertical-agnostic). */
  activeStagesByVertical: Record<string, readonly string[]>,
  now: Date = new Date(),
): Promise<UsageWarningResult> {
  const tenants = await db.tenant.findMany({
    where: { status: "ACTIVE", plan: { maxActiveListings: { not: null } } },
    select: {
      id: true,
      name: true,
      vertical: true,
      usageWarnedAt: true,
      plan: { select: { maxActiveListings: true } },
    },
  });

  let sent = 0;
  let cleared = 0;
  let errors = 0;

  for (const tenant of tenants) {
    const stages = activeStagesByVertical[tenant.vertical];
    const limit = tenant.plan.maxActiveListings!;
    if (!stages || limit <= 0) continue;

    const active = await db.listing.count({
      where: { tenantId: tenant.id, stage: { in: [...stages] } },
    });
    const overThreshold = active * 10 >= limit * 9;

    if (!overThreshold) {
      if (tenant.usageWarnedAt !== null) {
        await db.tenant.update({
          where: { id: tenant.id },
          data: { usageWarnedAt: null },
        });
        cleared += 1;
      }
      continue;
    }
    if (tenant.usageWarnedAt !== null) continue; // already warned

    // Stamp before sending; roll back on failure so the next run retries.
    await db.tenant.update({
      where: { id: tenant.id },
      data: { usageWarnedAt: now },
    });
    const admins = await db.user.findMany({
      where: { tenantId: tenant.id, role: "ADMIN", active: true },
      select: { name: true, email: true },
    });
    try {
      for (const admin of admins) {
        await email.send({
          to: admin.email,
          ...warningEmail({
            adminName: admin.name,
            tenantName: tenant.name,
            active,
            limit,
          }),
        });
        sent += 1;
      }
    } catch (error) {
      errors += 1;
      console.error("usage warning send failed:", error);
      await db.tenant
        .update({ where: { id: tenant.id }, data: { usageWarnedAt: null } })
        .catch(() => {});
    }
  }
  return { sent, cleared, errors };
}
