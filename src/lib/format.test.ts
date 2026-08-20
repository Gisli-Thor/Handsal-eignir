import { describe, expect, it } from "vitest";
import { formatArea, formatDate, formatDateTime, formatISK } from "./format";

describe("formatISK", () => {
  it("formats with dot thousands separator and no decimals", () => {
    expect(formatISK(12345678)).toBe("12.345.678 kr.");
    expect(formatISK(1000)).toBe("1.000 kr.");
    expect(formatISK(999)).toBe("999 kr.");
    expect(formatISK(0)).toBe("0 kr.");
  });

  it("rounds fractional amounts", () => {
    expect(formatISK(1234.6)).toBe("1.235 kr.");
  });

  it("handles negative amounts", () => {
    expect(formatISK(-2500000)).toBe("-2.500.000 kr.");
  });

  it("handles non-finite input", () => {
    expect(formatISK(NaN)).toBe("–");
    expect(formatISK(Infinity)).toBe("–");
  });
});

describe("formatDate", () => {
  it("formats as d.M.yyyy without leading zeros", () => {
    expect(formatDate(new Date(2026, 6, 24))).toBe("24.7.2026");
    expect(formatDate(new Date(2026, 0, 3))).toBe("3.1.2026");
  });
});

describe("formatDateTime", () => {
  it("appends kl. HH:mm", () => {
    expect(formatDateTime(new Date(2026, 6, 24, 9, 5))).toBe(
      "24.7.2026 kl. 09:05",
    );
  });
});

describe("formatArea", () => {
  it("formats with one decimal and comma separator", () => {
    expect(formatArea(123.4)).toBe("123,4 m²");
    expect(formatArea(85)).toBe("85,0 m²");
    expect(formatArea(1234.56)).toBe("1.234,6 m²");
  });

  it("handles non-finite input", () => {
    expect(formatArea(NaN)).toBe("–");
  });
});
