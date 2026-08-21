/**
 * Next.js instrumentation hook — runs once per server start (node runtime
 * only; the edge/middleware bundle must not pull in Prisma or nodemailer).
 * Starts the in-process job scheduler (SPEC §7 offer expiry + fyrirvarar
 * reminders).
 */
export async function register(): Promise<void> {
  // The literal `if` lets webpack drop the whole branch (and nodemailer/
  // Prisma behind it) from the edge bundle at parse time.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (!process.env.DATABASE_URL) return; // e.g. `next build` without env
    const { startJobScheduler } = await import("@/lib/jobs");
    startJobScheduler();
  }
}
