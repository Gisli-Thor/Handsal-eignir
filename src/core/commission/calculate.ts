/**
 * Söluþóknun calculator (SPEC §10). Pure BigInt arithmetic:
 *  - percentages become integer basis points (Math.round(percent * 100) —
 *    exact because the zod schema caps percent at 2 decimals; avoids float
 *    drift like 2.2 * 100 === 220.00000000000003);
 *  - every division is BigInt floor division (deterministic whole-ISK);
 *  - VSK is 24% added on commission + line items (all scheme amounts ex-VSK).
 *
 * Agent splits (user decision, PROGRESS.md): line items are agency fees and
 * are excluded; the gross commission goes 100% to the primary agent unless
 * per-listing split percentages are set, in which case those distribute it
 * (rounding remainder to the primary agent).
 */
import type { CommissionScheme } from "./scheme";

export const VSK_BASIS_POINTS = 2400n; // 24%

export interface CommissionAgentInput {
  userId: string;
  name: string;
  isPrimary: boolean;
  /** Per-listing split percentage; null = unset. */
  splitPct: number | null;
}

export interface CommissionSplit {
  userId: string;
  name: string;
  percent: number;
  amountISK: bigint;
}

export interface CommissionResult {
  salePriceISK: bigint;
  /** Commission ex-VSK. */
  grossISK: bigint;
  lineItems: Array<{ label: string; amountISK: bigint }>;
  lineItemsTotalISK: bigint;
  /** gross + line items, ex-VSK. */
  netISK: bigint;
  vskISK: bigint;
  /** net + VSK. */
  totalISK: bigint;
  splits: CommissionSplit[];
}

function basisPoints(percent: number): bigint {
  return BigInt(Math.round(percent * 100));
}

function applyBp(amount: bigint, bp: bigint): bigint {
  return (amount * bp) / 10_000n;
}

function grossFor(scheme: CommissionScheme, salePriceISK: bigint): bigint {
  switch (scheme.type) {
    case "FIXED_PERCENT":
      return applyBp(salePriceISK, basisPoints(scheme.percent));
    case "FLAT_PLUS_PERCENT":
      return BigInt(scheme.flatISK) + applyBp(salePriceISK, basisPoints(scheme.percent));
    case "TIERED": {
      // Marginal brackets; uptoISK is an inclusive upper bound.
      let gross = 0n;
      let lower = 0n;
      for (const tier of scheme.tiers) {
        const upper = tier.uptoISK === null ? salePriceISK : BigInt(tier.uptoISK);
        const sliceUpper = upper < salePriceISK ? upper : salePriceISK;
        if (sliceUpper > lower) {
          gross += applyBp(sliceUpper - lower, basisPoints(tier.percent));
        }
        if (upper >= salePriceISK) break;
        lower = upper;
      }
      return gross;
    }
  }
}

function splitsFor(
  grossISK: bigint,
  agents: readonly CommissionAgentInput[],
): CommissionSplit[] {
  if (agents.length === 0) return [];
  const primary = agents.find((agent) => agent.isPrimary) ?? agents[0];

  const hasCustom = agents.some((agent) => agent.splitPct !== null);
  if (!hasCustom) {
    return agents.map((agent) => ({
      userId: agent.userId,
      name: agent.name,
      percent: agent.userId === primary.userId ? 100 : 0,
      amountISK: agent.userId === primary.userId ? grossISK : 0n,
    }));
  }

  const splits = agents.map((agent) => {
    const percent = agent.splitPct ?? 0;
    return {
      userId: agent.userId,
      name: agent.name,
      percent,
      amountISK: applyBp(grossISK, basisPoints(percent)),
    };
  });
  // Floor division leaves a remainder — the primary agent absorbs it so the
  // splits always sum exactly to the gross.
  const distributed = splits.reduce((sum, split) => sum + split.amountISK, 0n);
  const remainder = grossISK - distributed;
  if (remainder !== 0n) {
    const target = splits.find((split) => split.userId === primary.userId) ?? splits[0];
    target.amountISK += remainder;
  }
  return splits;
}

export function calculateCommission(
  scheme: CommissionScheme,
  salePriceISK: bigint,
  agents: readonly CommissionAgentInput[],
): CommissionResult {
  const grossISK = grossFor(scheme, salePriceISK);
  const lineItems = scheme.lineItems.map((item) => ({
    label: item.label,
    amountISK: BigInt(item.amountISK),
  }));
  const lineItemsTotalISK = lineItems.reduce((sum, item) => sum + item.amountISK, 0n);
  const netISK = grossISK + lineItemsTotalISK;
  const vskISK = applyBp(netISK, VSK_BASIS_POINTS);
  return {
    salePriceISK,
    grossISK,
    lineItems,
    lineItemsTotalISK,
    netISK,
    vskISK,
    totalISK: netISK + vskISK,
    splits: splitsFor(grossISK, agents),
  };
}
