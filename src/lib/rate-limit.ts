/**
 * Minimal in-memory fixed-window rate limiter. Sufficient for the MVP's
 * single-instance deployment (SPEC §13 requires rate limiting on auth);
 * swap for a Redis-backed limiter when scaling horizontally.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

const MAX_BUCKETS = 10_000;

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
}

/** Returns true when the call is allowed, false when the limit is exceeded. */
export function checkRateLimit(
  key: string,
  { limit = 5, windowMs = 60_000 }: RateLimitOptions = {},
): boolean {
  const now = Date.now();

  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** Test helper — clears all rate limit state. */
export function resetRateLimits(): void {
  buckets.clear();
}
