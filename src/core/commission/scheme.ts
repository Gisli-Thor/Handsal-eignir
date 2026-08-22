/**
 * Söluþóknun scheme (SPEC §10), stored as zod-validated JSON on
 * Tenant.commissionScheme (default) and Listing.commissionSchemeOverride.
 *
 * Conventions:
 *  - all amounts are ex-VSK ISK stored as digit strings (Json can't hold
 *    BigInt); percentages have at most 2 decimals;
 *  - TIERED uses MARGINAL brackets (tax-band style — each percent applies to
 *    the slice inside its bracket; single-bracket-by-total would make a tiny
 *    price increase reduce the commission). `uptoISK` is an inclusive upper
 *    bound; tiers ascend strictly; the last tier has `uptoISK: null`;
 *  - `version` travels inside frozen CommissionRecord snapshots forever.
 */
import { z } from "zod";

const iskString = z.string().regex(/^\d{1,15}$/);

const percent = z
  .number()
  .min(0)
  .max(100)
  // Max 2 decimals — epsilon comparison because e.g. 2.2 * 100 floats to
  // 220.00000000000003 (the calculator later rounds to exact basis points).
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: "max 2 decimals",
  });

const lineItem = z.object({
  label: z.string().trim().min(1).max(120),
  amountISK: iskString,
});

export const commissionSchemeSchema = z
  .object({
    version: z.literal(1),
    lineItems: z.array(lineItem).max(10).default([]),
  })
  .and(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("FIXED_PERCENT"), percent }),
      z.object({
        type: z.literal("TIERED"),
        tiers: z
          .array(z.object({ uptoISK: iskString.nullable(), percent }))
          .min(1)
          .max(10)
          .refine((tiers) => tiers[tiers.length - 1].uptoISK === null, {
            message: "last tier must be open-ended (uptoISK null)",
          })
          .refine(
            (tiers) => tiers.slice(0, -1).every((tier) => tier.uptoISK !== null),
            { message: "only the last tier may be open-ended" },
          )
          .refine(
            (tiers) => {
              const bounds = tiers
                .slice(0, -1)
                .map((tier) => BigInt(tier.uptoISK!));
              return bounds.every((bound, i) => i === 0 || bound > bounds[i - 1]);
            },
            { message: "tier bounds must ascend strictly" },
          ),
      }),
      z.object({
        type: z.literal("FLAT_PLUS_PERCENT"),
        flatISK: iskString,
        percent,
      }),
    ]),
  );

export type CommissionScheme = z.infer<typeof commissionSchemeSchema>;

/** Tolerant reader: a missing/corrupt blob degrades to "no scheme" — the
 * söluyfirlit and the finalize hook must never throw on bad data. */
export function parseScheme(value: unknown): CommissionScheme | null {
  if (value === null || value === undefined) return null;
  const parsed = commissionSchemeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
