import { describe, expect, it } from "vitest";
import {
  buildAcceptedSnapshot,
  canDecide,
  offerKind,
  validatePaymentItems,
} from "@/core/offers/state";

describe("offer state machine", () => {
  it("only PENDING offers can be decided", () => {
    expect(canDecide("PENDING")).toBe(true);
    for (const terminal of ["ACCEPTED", "REJECTED", "COUNTERED", "EXPIRED", "WITHDRAWN"] as const) {
      expect(canDecide(terminal)).toBe(false);
    }
  });

  it("distinguishes kauptilboð from gagntilboð by parent", () => {
    expect(offerKind(null)).toBe("KAUPTILBOD");
    expect(offerKind("parent-id")).toBe("GAGNTILBOD");
  });
});

describe("greiðslutilhögun validation", () => {
  const item = (amountISK: bigint, description = "x") => ({ description, amountISK });

  it("accepts items summing exactly to the offer amount", () => {
    expect(
      validatePaymentItems([item(60_000_000n), item(29_990_000n)], 89_990_000n),
    ).toEqual({ ok: true });
  });

  it("rejects an empty schedule", () => {
    expect(validatePaymentItems([], 1n)).toEqual({ ok: false, error: "empty" });
  });

  it("rejects zero or negative line items", () => {
    expect(validatePaymentItems([item(0n)], 0n)).toEqual({
      ok: false,
      error: "nonPositiveItem",
    });
    expect(validatePaymentItems([item(-5n), item(10n)], 5n)).toEqual({
      ok: false,
      error: "nonPositiveItem",
    });
  });

  it("rejects a sum mismatch and reports the difference", () => {
    expect(validatePaymentItems([item(50n), item(30n)], 100n)).toEqual({
      ok: false,
      error: "sumMismatch",
      diffISK: 20n,
    });
    expect(validatePaymentItems([item(150n)], 100n)).toEqual({
      ok: false,
      error: "sumMismatch",
      diffISK: -50n,
    });
  });

  it("handles BigInt sums beyond Number.MAX_SAFE_INTEGER", () => {
    const big = 9_007_199_254_740_993n; // MAX_SAFE_INTEGER + 2
    expect(validatePaymentItems([item(big), item(1n)], big + 1n)).toEqual({ ok: true });
  });
});

describe("accepted snapshot", () => {
  it("serializes BigInt and dates to JSON-safe values", () => {
    const snapshot = buildAcceptedSnapshot({
      amountISK: 89_990_000n,
      afhendingDate: new Date("2026-12-01T00:00:00Z"),
      gildistimi: new Date("2026-08-13T18:00:00Z"),
      terms: "Sjá fyrirvara",
      buyers: [{ contactId: "c1", name: "Kaupandi", sharePct: 54 }],
      paymentItems: [
        { description: "Við kaupsamning", amountISK: 9_000_000n, dueDate: null },
        {
          description: "Við afsal",
          amountISK: 80_990_000n,
          dueDate: new Date("2027-01-15T00:00:00Z"),
        },
      ],
    });
    // Must survive JSON round-trip untouched (stored in a Json column).
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(snapshot).toMatchObject({
      amountISK: "89990000",
      terms: "Sjá fyrirvara",
      buyers: [{ contactId: "c1", sharePct: 54 }],
    });
  });
});
