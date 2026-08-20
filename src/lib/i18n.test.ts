import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, toLocale } from "./i18n";

describe("toLocale", () => {
  it("accepts supported locales", () => {
    expect(toLocale("is")).toBe("is");
    expect(toLocale("en")).toBe("en");
  });

  it("falls back to Icelandic for anything else", () => {
    expect(toLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(toLocale(null)).toBe(DEFAULT_LOCALE);
    expect(toLocale("de")).toBe(DEFAULT_LOCALE);
    expect(toLocale("")).toBe(DEFAULT_LOCALE);
  });
});
