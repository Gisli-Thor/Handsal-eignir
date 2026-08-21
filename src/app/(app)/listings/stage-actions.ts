"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { executeTransition } from "@/core/pipeline/engine";
import { getPipeline } from "@/lib/pipelines";
import { ListingAccessError, requireManageableListing } from "./listing-access";

export type StageActionState = {
  ok?: boolean;
  error?:
    | "invalid"
    | "notFound"
    | "forbidden"
    | "unknown"
    | "invalidTransition"
    | "reasonRequired"
    | "conflict";
  blocked?: { code: string; overridable: boolean };
} | null;

const stageInput = z.object({
  to: z.string().min(1).max(40),
  reason: z.string().trim().max(2_000).optional(),
  override: z.boolean().optional(),
});

export async function transitionStageAction(
  listingId: string,
  input: z.infer<typeof stageInput>,
): Promise<StageActionState> {
  try {
    const { session, db, listing } = await requireManageableListing(listingId);
    const parsed = stageInput.safeParse(input);
    if (!parsed.success) return { error: "invalid" };
    // Guard overrides are an ADMIN power (SPEC §7); silently drop the flag
    // for agents so the guard block is reported instead.
    const override = parsed.data.override === true && session.user.role === "ADMIN";

    const pipeline = getPipeline(listing.vertical);
    const result = await executeTransition(db, pipeline, {
      tenantId: session.user.tenantId,
      listing,
      to: parsed.data.to,
      actorUserId: session.user.id,
      reason: parsed.data.reason,
      override,
    });
    if (!result.ok) {
      if (result.error === "blocked") {
        return { blocked: { code: result.code, overridable: result.overridable } };
      }
      return { error: result.error };
    }
    revalidatePath("/listings");
    revalidatePath(`/listings/${listing.id}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    if (error instanceof ListingAccessError) return { error: error.reason };
    return { error: "unknown" };
  }
}
