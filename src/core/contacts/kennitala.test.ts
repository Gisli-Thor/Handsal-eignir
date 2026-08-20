import { describe, expect, it } from "vitest";
import {
  formatKennitala,
  isValidKennitala,
  kennitalaCheckDigit,
  kennitalaType,
  normalizeKennitala,
} from "@/core/contacts/kennitala";

describe("normalizeKennitala / formatKennitala", () => {
  it("strips hyphens and spaces", () => {
    expect(normalizeKennitala("010130-2989")).toBe("0101302989");
    expect(normalizeKennitala("010130 2989")).toBe("0101302989");
  });
  it("formats a 10-digit kennitala with a hyphen", () => {
    expect(formatKennitala("0101302989")).toBe("010130-2989");
  });
  it("leaves malformed input untouched when formatting", () => {
    expect(formatKennitala("12345")).toBe("12345");
  });
});

describe("kennitalaCheckDigit", () => {
  it("computes the mod-11 check digit", () => {
    expect(kennitalaCheckDigit("01013029")).toBe(8);
    expect(kennitalaCheckDigit("01013023")).toBe(9);
    expect(kennitalaCheckDigit("41013029")).toBe(7);
  });
  it("returns null when the remainder is 1 (no valid check digit exists)", () => {
    expect(kennitalaCheckDigit("01013000")).toBeNull();
  });
});

describe("isValidKennitala", () => {
  it("accepts valid person kennitölur", () => {
    expect(isValidKennitala("0101302989")).toBe(true);
    expect(isValidKennitala("0101302399")).toBe(true);
    expect(isValidKennitala("0101303019")).toBe(true);
  });
  it("accepts hyphenated input", () => {
    expect(isValidKennitala("010130-2989")).toBe(true);
  });
  it("accepts valid company kennitölur (day + 40)", () => {
    expect(isValidKennitala("4101302979")).toBe(true);
  });
  it("rejects a wrong check digit", () => {
    expect(isValidKennitala("0101302999")).toBe(false);
  });
  it("rejects wrong length and non-digits", () => {
    expect(isValidKennitala("010130298")).toBe(false);
    expect(isValidKennitala("01013029891")).toBe(false);
    expect(isValidKennitala("01013O2989")).toBe(false);
    expect(isValidKennitala("")).toBe(false);
  });
  it("rejects an impossible day even with a valid checksum", () => {
    expect(isValidKennitala("3201302989")).toBe(false);
  });
  it("rejects an impossible month even with a valid checksum", () => {
    expect(isValidKennitala("0113302909")).toBe(false);
  });
  it("rejects an invalid century digit", () => {
    expect(isValidKennitala("0101302985")).toBe(false);
  });
  it("rejects serials whose checksum has no valid digit", () => {
    expect(isValidKennitala("0101300009")).toBe(false);
  });
});

describe("kennitalaType", () => {
  it("classifies persons and companies by day offset", () => {
    expect(kennitalaType("0101302989")).toBe("PERSON");
    expect(kennitalaType("4101302979")).toBe("COMPANY");
  });
});
