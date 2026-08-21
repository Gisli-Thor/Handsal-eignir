import { describe, expect, it } from "vitest";
import { fyrirvararGuard, FYRIRVARAR_GUARD_CODE } from "@/core/fyrirvarar/guard";
import type { TransitionContext } from "@/core/pipeline/types";
import type { TenantDb } from "@/core/tenancy/isolation";

function ctxWithOpenCount(count: number): TransitionContext {
  const db = {
    fyrirvari: {
      count: async (args: { where: Record<string, unknown> }) => {
        // The guard must scope to PENDING/FAILED fyrirvarar of the listing's
        // ACCEPTED offer.
        expect(args.where).toMatchObject({
          status: { in: ["PENDING", "FAILED"] },
          offer: { listingId: "l1", status: "ACCEPTED" },
        });
        return count;
      },
    },
  } as unknown as TenantDb;
  return {
    db,
    tenantId: "t1",
    listingId: "l1",
    from: "TILBOD_SAMTHYKKT",
    to: "KAUPSAMNINGUR",
    actorUserId: "u1",
  };
}

describe("fyrirvarar stage guard (SPEC §7)", () => {
  it("passes when every fyrirvari is FULFILLED or WAIVED", async () => {
    expect(await fyrirvararGuard(ctxWithOpenCount(0))).toEqual({ ok: true });
  });

  it("blocks (overridable) while PENDING or FAILED fyrirvarar remain", async () => {
    expect(await fyrirvararGuard(ctxWithOpenCount(2))).toEqual({
      ok: false,
      code: FYRIRVARAR_GUARD_CODE,
      overridable: true,
    });
  });
});
