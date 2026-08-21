import { describe, expect, it } from "vitest";
import { deriveRequestStatus, isOpenRequestStatus } from "@/core/signing/status";

describe("deriveRequestStatus (SPEC §11)", () => {
  it("SENT while nobody has acted", () => {
    expect(deriveRequestStatus(["PENDING", "PENDING"])).toBe("SENT");
  });

  it("PARTIALLY_SIGNED when some signed", () => {
    expect(deriveRequestStatus(["SIGNED", "PENDING"])).toBe("PARTIALLY_SIGNED");
  });

  it("SIGNED when all signed", () => {
    expect(deriveRequestStatus(["SIGNED"])).toBe("SIGNED");
    expect(deriveRequestStatus(["SIGNED", "SIGNED", "SIGNED"])).toBe("SIGNED");
  });

  it("any rejection rejects the request, even alongside signatures", () => {
    expect(deriveRequestStatus(["SIGNED", "REJECTED"])).toBe("REJECTED");
    expect(deriveRequestStatus(["REJECTED", "PENDING"])).toBe("REJECTED");
  });

  it("no signers → SENT (defensive)", () => {
    expect(deriveRequestStatus([])).toBe("SENT");
  });
});

describe("isOpenRequestStatus", () => {
  it("only SENT and PARTIALLY_SIGNED accept webhook events", () => {
    expect(isOpenRequestStatus("SENT")).toBe(true);
    expect(isOpenRequestStatus("PARTIALLY_SIGNED")).toBe(true);
    for (const closed of ["DRAFT", "SIGNED", "REJECTED", "EXPIRED", "CANCELLED"] as const) {
      expect(isOpenRequestStatus(closed)).toBe(false);
    }
  });
});
