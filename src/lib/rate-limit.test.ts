import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, resetRateLimits } from "./rate-limit";

beforeEach(() => {
  vi.useFakeTimers();
  resetRateLimits();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows up to the limit within a window", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("k", { limit: 5, windowMs: 60_000 })).toBe(true);
    }
    expect(checkRateLimit("k", { limit: 5, windowMs: 60_000 })).toBe(false);
  });

  it("resets after the window passes", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("k", { limit: 5, windowMs: 60_000 });
    expect(checkRateLimit("k", { limit: 5, windowMs: 60_000 })).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(checkRateLimit("k", { limit: 5, windowMs: 60_000 })).toBe(true);
  });

  it("tracks keys independently", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("a", { limit: 5 });
    expect(checkRateLimit("a", { limit: 5 })).toBe(false);
    expect(checkRateLimit("b", { limit: 5 })).toBe(true);
  });
});
