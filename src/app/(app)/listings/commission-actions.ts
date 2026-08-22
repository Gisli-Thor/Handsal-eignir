"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { logAudit } from "@/core/audit/log";
import { commissionSchemeSchema } from "@/core/commission/scheme";
import { ListingAccessError, requireManageableListing } from "./listing-access";

export type CommissionActionState = {
  ok?: boolean;
  error?: "invalid" | "notFound" | "forbidden" | "unknown" | "sumNot100";
} | null;

function mapError(error: unknown): CommissionActionState {
  if (error instanceof ListingAccessError) return { error: error.reason };
  return { error: "unknown" };
}

/** Per-listing söluþóknun override (SPEC §5/§10) — ADMIN only; null reverts
 * to the tenant default. */
export async function updateListingCommissionSchemeAction(
  listingId: string,
  scheme: unknown,
): Promise<CommissionActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    if (session.user.role !== "ADMIN") return { error: "forbidden" };

    let value: Prisma.InputJsonObject | null = null;
    if (scheme !== null && scheme !== undefined) {
      const parsed = commissionSchemeSchema.safeParse(scheme);
      if (!parsed.success) return { error: "invalid" };
      value = parsed.data as unknown as Prisma.InputJsonObject;
    }
    await db.listing.update({
      where: { id: listing.id },
      data: { commissionSchemeOverride: value ?? Prisma.DbNull },
    });
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "COMMISSION_SCHEME_UPDATED",
      targetType: "Listing",
      targetId: listing.id,
      metadata: { cleared: value === null },
    });
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

const splitsSchema = z
  .array(
    z.object({
      linkId: z.string().min(1),
      /** Percent with up to 2 decimals; null = unset. */
      pct: z.number().min(0).max(100).nullable(),
    }),
  )
  .min(1)
  .max(20);

/** Agent commission splits (SPEC §10, user decision): all-null = primary
 * agent receives 100%; when any percentage is set, the set ones must sum
 * to exactly 100. ADMIN only. */
export async function updateAgentSplitsAction(
  listingId: string,
  splits: z.infer<typeof splitsSchema>,
): Promise<CommissionActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    if (session.user.role !== "ADMIN") return { error: "forbidden" };
    const parsed = splitsSchema.safeParse(splits);
    if (!parsed.success) return { error: "invalid" };

    const links = await db.listingAgent.findMany({
      where: { listingId: listing.id },
      select: { id: true },
    });
    const linkIds = new Set(links.map((link) => link.id));
    if (!parsed.data.every((split) => linkIds.has(split.linkId))) {
      return { error: "notFound" };
    }

    const setPcts = parsed.data.filter((split) => split.pct !== null);
    if (setPcts.length > 0) {
      const sum = setPcts.reduce((total, split) => total + split.pct!, 0);
      if (Math.abs(sum - 100) > 0.01) return { error: "sumNot100" };
    }

    await db.$transaction(
      parsed.data.map((split) =>
        db.listingAgent.update({
          where: { id: split.linkId },
          data: { splitPct: split.pct },
        }),
      ),
    );
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "AGENT_SPLIT_UPDATED",
      targetType: "Listing",
      targetId: listing.id,
      metadata: {
        splits: parsed.data.map((split) => ({ linkId: split.linkId, pct: split.pct })),
      },
    });
    revalidatePath(`/listings/${listing.id}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}
