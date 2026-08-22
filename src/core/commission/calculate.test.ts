import { describe, expect, it } from "vitest";
import { calculateCommission, type CommissionAgentInput } from "@/core/commission/calculate";
import { parseScheme, type CommissionScheme } from "@/core/commission/scheme";
import { describeSchemeIs } from "@/core/commission/describe";

const agent = (
  userId: string,
  overrides: Partial<CommissionAgentInput> = {},
): CommissionAgentInput => ({
  userId,
  name: `Agent ${userId}`,
  isPrimary: false,
  splitPct: null,
  ...overrides,
});

const fixed = (percent: number, lineItems: Array<{ label: string; amountISK: string }> = []): CommissionScheme =>
  ({ version: 1, type: "FIXED_PERCENT", percent, lineItems }) as CommissionScheme;

describe("calculateCommission — FIXED_PERCENT (SPEC §10)", () => {
  it("computes gross, VSK 24% and total; basis points avoid float drift", () => {
    // 2.2% of 57.500.000 = 1.265.000 exactly (2.2*100 floats to 220.00000000000003)
    const result = calculateCommission(fixed(2.2), 57_500_000n, [
      agent("a", { isPrimary: true }),
    ]);
    expect(result.grossISK).toBe(1_265_000n);
    expect(result.vskISK).toBe(303_600n);
    expect(result.totalISK).toBe(1_568_600n);
  });

  it("adds fixed line items ex-VSK before VSK (per examples/NOTES.md fees)", () => {
    const result = calculateCommission(
      fixed(2.2, [
        { label: "Gagnaöflun", amountISK: "39900" },
        { label: "Umsýslugjald", amountISK: "74900" },
      ]),
      57_500_000n,
      [],
    );
    expect(result.lineItemsTotalISK).toBe(114_800n);
    expect(result.netISK).toBe(1_379_800n);
    expect(result.vskISK).toBe(331_152n);
    expect(result.totalISK).toBe(1_710_952n);
    expect(result.splits).toEqual([]); // zero agents still yields a result
  });

  it("floors fractional ISK deterministically", () => {
    // 1.11% of 999 = 11.0889 → 11
    const result = calculateCommission(fixed(1.11), 999n, []);
    expect(result.grossISK).toBe(11n);
  });
});

describe("calculateCommission — TIERED (marginal brackets)", () => {
  const tiered: CommissionScheme = {
    version: 1,
    type: "TIERED",
    tiers: [
      { uptoISK: "50000000", percent: 2.5 },
      { uptoISK: null, percent: 1.8 },
    ],
    lineItems: [],
  } as CommissionScheme;

  it("applies each percent to the slice within its bracket", () => {
    // 2.5% of 50M + 1.8% of 30M = 1.250.000 + 540.000
    const result = calculateCommission(tiered, 80_000_000n, []);
    expect(result.grossISK).toBe(1_790_000n);
  });

  it("uptoISK is an inclusive upper bound", () => {
    // Exactly at the boundary: only the first bracket applies.
    const atBoundary = calculateCommission(tiered, 50_000_000n, []);
    expect(atBoundary.grossISK).toBe(1_250_000n);
    // One króna above: 1 króna lands in the second bracket (floors to 0).
    const above = calculateCommission(tiered, 50_000_001n, []);
    expect(above.grossISK).toBe(1_250_000n);
  });

  it("price below the first bound never reaches later tiers", () => {
    const result = calculateCommission(tiered, 10_000_000n, []);
    expect(result.grossISK).toBe(250_000n);
  });
});

describe("calculateCommission — FLAT_PLUS_PERCENT", () => {
  it("adds the flat fee to the percentage", () => {
    const scheme: CommissionScheme = {
      version: 1,
      type: "FLAT_PLUS_PERCENT",
      flatISK: "350000",
      percent: 1.5,
      lineItems: [],
    } as CommissionScheme;
    const result = calculateCommission(scheme, 60_000_000n, []);
    expect(result.grossISK).toBe(350_000n + 900_000n);
  });
});

describe("agent splits (user decision: primary gets 100% unless per-listing pcts)", () => {
  it("defaults everything to the primary agent", () => {
    const result = calculateCommission(fixed(2), 50_000_000n, [
      agent("jon"),
      agent("anna", { isPrimary: true }),
    ]);
    expect(result.splits).toEqual([
      { userId: "jon", name: "Agent jon", percent: 0, amountISK: 0n },
      { userId: "anna", name: "Agent anna", percent: 100, amountISK: 1_000_000n },
    ]);
  });

  it("falls back to the first agent when none is primary", () => {
    const result = calculateCommission(fixed(2), 50_000_000n, [agent("a"), agent("b")]);
    expect(result.splits[0].amountISK).toBe(1_000_000n);
    expect(result.splits[1].amountISK).toBe(0n);
  });

  it("distributes by custom percentages with the remainder to the primary", () => {
    // Gross 1.000.001: 60% = 600.000 (floor of 600000.6), 40% = 400.000 →
    // remainder 1 goes to the primary.
    const result = calculateCommission(fixed(2), 50_000_050n, [
      agent("anna", { isPrimary: true, splitPct: 60 }),
      agent("jon", { splitPct: 40 }),
    ]);
    expect(result.grossISK).toBe(1_000_001n);
    const anna = result.splits.find((split) => split.userId === "anna")!;
    const jon = result.splits.find((split) => split.userId === "jon")!;
    expect(anna.amountISK + jon.amountISK).toBe(result.grossISK);
    expect(jon.amountISK).toBe(400_000n);
    expect(anna.amountISK).toBe(600_001n);
  });

  it("an agent without a pct gets 0 when custom pcts are in play", () => {
    const result = calculateCommission(fixed(2), 50_000_000n, [
      agent("anna", { isPrimary: true, splitPct: 100 }),
      agent("jon"),
    ]);
    expect(result.splits.find((split) => split.userId === "jon")!.amountISK).toBe(0n);
  });
});

describe("scheme zod (parseScheme)", () => {
  it("accepts the three valid shapes", () => {
    expect(parseScheme({ version: 1, type: "FIXED_PERCENT", percent: 2.2, lineItems: [] })).not.toBeNull();
    expect(
      parseScheme({
        version: 1,
        type: "TIERED",
        tiers: [
          { uptoISK: "50000000", percent: 2.5 },
          { uptoISK: null, percent: 1.8 },
        ],
        lineItems: [],
      }),
    ).not.toBeNull();
    expect(
      parseScheme({ version: 1, type: "FLAT_PLUS_PERCENT", flatISK: "350000", percent: 1.5, lineItems: [] }),
    ).not.toBeNull();
  });

  it("degrades corrupt blobs to null instead of throwing", () => {
    expect(parseScheme(null)).toBeNull();
    expect(parseScheme("garbage")).toBeNull();
    expect(parseScheme({ version: 2, type: "FIXED_PERCENT", percent: 2 })).toBeNull();
    expect(parseScheme({ version: 1, type: "FIXED_PERCENT", percent: 2.223, lineItems: [] })).toBeNull(); // >2 decimals
    // Non-ascending tiers rejected
    expect(
      parseScheme({
        version: 1,
        type: "TIERED",
        tiers: [
          { uptoISK: "50000000", percent: 2 },
          { uptoISK: "40000000", percent: 1 },
          { uptoISK: null, percent: 1 },
        ],
        lineItems: [],
      }),
    ).toBeNull();
    // Last tier must be open-ended
    expect(
      parseScheme({
        version: 1,
        type: "TIERED",
        tiers: [{ uptoISK: "50000000", percent: 2 }],
        lineItems: [],
      }),
    ).toBeNull();
  });
});

describe("describeSchemeIs (söluyfirlit disclosure)", () => {
  it("renders each scheme type in Icelandic with comma decimals", () => {
    expect(describeSchemeIs(fixed(2.2))).toBe(
      "Söluþóknun er 2,2% af söluverði, auk vsk.",
    );
    expect(
      describeSchemeIs({
        version: 1,
        type: "FLAT_PLUS_PERCENT",
        flatISK: "350000",
        percent: 1.5,
        lineItems: [],
      } as CommissionScheme),
    ).toBe("Söluþóknun er 350.000 kr. auk 1,5% af söluverði, auk vsk.");
    expect(
      describeSchemeIs({
        version: 1,
        type: "TIERED",
        tiers: [
          { uptoISK: "50000000", percent: 2.5 },
          { uptoISK: null, percent: 1.8 },
        ],
        lineItems: [],
      } as CommissionScheme),
    ).toBe(
      "Söluþóknun er þrepaskipt: 2,5% af fyrstu 50.000.000 kr. og 1,8% af því sem umfram er, auk vsk.",
    );
  });

  it("appends line items", () => {
    expect(
      describeSchemeIs(
        fixed(2.2, [
          { label: "gagnaöflun", amountISK: "39900" },
          { label: "umsýslugjald", amountISK: "74900" },
        ]),
      ),
    ).toBe(
      "Söluþóknun er 2,2% af söluverði, auk vsk. Auk þess greiðist gagnaöflun 39.900 kr. og umsýslugjald 74.900 kr., auk vsk.",
    );
  });
});
