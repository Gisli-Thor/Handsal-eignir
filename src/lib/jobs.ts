/**
 * In-process background jobs (SPEC §7: "simple interval job in-process is
 * fine for MVP"). Started once per server process from src/instrumentation.ts.
 *
 * Jobs run across all tenants → unscopedDb (documented legitimate call site).
 */
import { unscopedDb } from "@/lib/db";
import { getEmail } from "@/lib/services";
import { expireOverdueOffers } from "@/core/offers/expiry";
import { sendFyrirvariReminders } from "@/core/fyrirvarar/reminders";
import { sendUsageWarnings } from "@/core/plans/usage-warning";
import { ACTIVE_STAGES } from "@/verticals/eignir/pipeline";

/** Active-band stages per vertical for plan-usage checks (SPEC §12).
 * Bílar joins in M6 with its own config. */
const ACTIVE_STAGES_BY_VERTICAL: Record<string, readonly string[]> = {
  EIGNIR: ACTIVE_STAGES,
};

const INTERVAL_MS = 60_000;

const globalForJobs = globalThis as unknown as {
  handsalJobsStarted?: boolean;
  handsalJobRunning?: boolean;
};

export async function runJobsOnce(): Promise<void> {
  if (globalForJobs.handsalJobRunning) return; // no overlapping runs
  globalForJobs.handsalJobRunning = true;
  try {
    const expired = await expireOverdueOffers(unscopedDb);
    if (expired > 0) console.log(`[jobs] offers expired: ${expired}`);
    const reminders = await sendFyrirvariReminders(unscopedDb, getEmail());
    if (reminders.sent > 0 || reminders.errors > 0) {
      console.log(
        `[jobs] fyrirvari reminders sent: ${reminders.sent}, errors: ${reminders.errors}`,
      );
    }
    const usage = await sendUsageWarnings(unscopedDb, getEmail(), ACTIVE_STAGES_BY_VERTICAL);
    if (usage.sent > 0 || usage.errors > 0) {
      console.log(
        `[jobs] plan-usage warnings sent: ${usage.sent}, errors: ${usage.errors}`,
      );
    }
  } catch (error) {
    console.error("[jobs] run failed:", error);
  } finally {
    globalForJobs.handsalJobRunning = false;
  }
}

/** Idempotent: dev HMR and multiple imports must not stack intervals. */
export function startJobScheduler(): void {
  if (globalForJobs.handsalJobsStarted) return;
  globalForJobs.handsalJobsStarted = true;
  // Fire shortly after boot, then every minute. unref() keeps the timer from
  // holding the process open (tests, one-off scripts).
  setTimeout(() => void runJobsOnce(), 5_000).unref?.();
  setInterval(() => void runJobsOnce(), INTERVAL_MS).unref?.();
  console.log(
    "[jobs] scheduler started (offer expiry + fyrirvari reminders + plan-usage warnings, 60s)",
  );
}
