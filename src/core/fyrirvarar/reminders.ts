/**
 * Fyrirvarar deadline reminders (SPEC §7): email the responsible agent (the
 * listing's primary agent) at 7 days, 2 days, and on the deadline. Each tier
 * is stamped on the row so a reminder is never sent twice; sending a more
 * urgent tier also stamps the milder ones (an overdue fyrirvari discovered
 * late gets one email, not three).
 *
 * Runs across all tenants from src/lib/jobs.ts with the unscoped client.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import type { EmailAdapter } from "@/core/ports/email";
import { formatDate } from "@/lib/format";

const DAY_MS = 24 * 60 * 60 * 1000;

type Tier = "due" | "twoDays" | "sevenDays";

function tierFor(
  fyrirvari: {
    deadline: Date;
    reminder7SentAt: Date | null;
    reminder2SentAt: Date | null;
    reminderDueSentAt: Date | null;
  },
  now: Date,
): Tier | null {
  const remaining = fyrirvari.deadline.getTime() - now.getTime();
  if (remaining <= 0) return fyrirvari.reminderDueSentAt ? null : "due";
  if (remaining <= 2 * DAY_MS) return fyrirvari.reminder2SentAt ? null : "twoDays";
  if (remaining <= 7 * DAY_MS) return fyrirvari.reminder7SentAt ? null : "sevenDays";
  return null;
}

const FYRIRVARI_LABELS: Record<string, string> = {
  FJARMOGNUN: "Fjármögnun",
  SALA_EIGIN_EIGNAR: "Sala eigin eignar",
  ASTANDSSKODUN: "Ástandsskoðun",
  SAMTHYKKI_STJORNAR: "Samþykki stjórnar",
  ANNAD: "Annað",
};

function reminderEmail(input: {
  agentName: string;
  address: string;
  typeLabel: string;
  description: string;
  deadline: Date;
  tier: Tier;
}): { subject: string; text: string } {
  const deadlineStr = formatDate(input.deadline);
  const urgency =
    input.tier === "due"
      ? `rennur út í dag (${deadlineStr})`
      : input.tier === "twoDays"
        ? `rennur út innan 2 daga (${deadlineStr})`
        : `rennur út innan 7 daga (${deadlineStr})`;
  return {
    subject: `Fyrirvari ${urgency} — ${input.address}`,
    text: [
      `Sæl/l ${input.agentName},`,
      "",
      `Fyrirvari á samþykktu tilboði í ${input.address} ${urgency}:`,
      "",
      `  ${input.typeLabel}: ${input.description}`,
      `  Frestur: ${deadlineStr}`,
      "",
      "Skráðu niðurstöðu fyrirvarans í Handsal.",
      "",
      "— Handsal",
      "",
      `(Reminder: a fyrirvari on an accepted offer for ${input.address} is due ${deadlineStr}.)`,
    ].join("\n"),
  };
}

export interface ReminderRunResult {
  sent: number;
  errors: number;
}

export async function sendFyrirvariReminders(
  db: PrismaClient,
  email: EmailAdapter,
  now: Date = new Date(),
): Promise<ReminderRunResult> {
  // Candidate window: pending fyrirvarar on accepted offers due within 7 days
  // (or overdue). The per-row tier check handles stamps and exact windows.
  const candidates = await db.fyrirvari.findMany({
    where: {
      status: "PENDING",
      deadline: { lt: new Date(now.getTime() + 7 * DAY_MS) },
      offer: { status: "ACCEPTED" },
    },
    include: {
      offer: {
        select: {
          listingId: true,
          listing: {
            select: {
              property: { select: { gotuheiti: true, husnumer: true } },
              agents: {
                where: { isPrimary: true },
                select: { user: { select: { name: true, email: true } } },
              },
            },
          },
        },
      },
    },
  });

  let sent = 0;
  let errors = 0;
  for (const fyrirvari of candidates) {
    const tier = tierFor(fyrirvari, now);
    if (!tier) continue;
    const agent = fyrirvari.offer.listing.agents[0]?.user;
    const property = fyrirvari.offer.listing.property;
    const address = property
      ? `${property.gotuheiti} ${property.husnumer}`
      : fyrirvari.offer.listingId;

    // Stamp before sending: a crash after send must not re-send; a failed
    // send is retried on the next run because we roll the stamp back.
    const stamps: Record<string, Date> = { reminder7SentAt: now };
    if (tier === "twoDays" || tier === "due") stamps.reminder2SentAt = now;
    if (tier === "due") stamps.reminderDueSentAt = now;
    await db.fyrirvari.update({ where: { id: fyrirvari.id }, data: stamps });

    if (!agent?.email) continue;
    try {
      const message = reminderEmail({
        agentName: agent.name,
        address,
        typeLabel: FYRIRVARI_LABELS[fyrirvari.type] ?? fyrirvari.type,
        description: fyrirvari.description,
        deadline: fyrirvari.deadline,
        tier,
      });
      await email.send({ to: agent.email, ...message });
      sent += 1;
    } catch {
      errors += 1;
      // Roll the stamps back so the next run retries this tier.
      const rollback: Record<string, null> = { reminder7SentAt: null };
      if (tier === "twoDays" || tier === "due") rollback.reminder2SentAt = null;
      if (tier === "due") rollback.reminderDueSentAt = null;
      await db.fyrirvari
        .update({ where: { id: fyrirvari.id }, data: rollback })
        .catch(() => {});
    }
  }
  return { sent, errors };
}
