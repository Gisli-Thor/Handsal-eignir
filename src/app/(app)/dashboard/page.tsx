import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  CalendarClock,
  HandCoins,
  ListChecks,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenantUser } from "@/lib/auth-guards";
import { getTenantDb } from "@/lib/db";
import { formatDate, formatDateTime, formatISK } from "@/lib/format";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addressOf(listing: {
  property: { gotuheiti: string; husnumer: string; ibud: string | null } | null;
}): string {
  const property = listing.property;
  if (!property) return "—";
  return `${property.gotuheiti} ${property.husnumer}${property.ibud ? `, ${property.ibud}` : ""}`;
}

export default async function DashboardPage() {
  const session = await requireTenantUser();
  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");
  const verticalName = tCommon(`verticalName.${session.user.vertical ?? "EIGNIR"}`);
  const db = getTenantDb(session.user.tenantId);
  const now = Date.now();

  const [pendingFyrirvarar, expiringOffers, upcomingViewings, openTasks] =
    await Promise.all([
      // SPEC §7: all pending fyrirvarar across listings, sorted by deadline.
      db.fyrirvari.findMany({
        where: { status: "PENDING", offer: { status: "ACCEPTED" } },
        orderBy: { deadline: "asc" },
        take: 12,
        include: {
          offer: {
            select: { listingId: true, listing: { select: { property: true } } },
          },
        },
      }),
      db.offer.findMany({
        where: {
          status: "PENDING",
          gildistimi: { lt: new Date(now + 7 * DAY_MS) },
        },
        orderBy: { gildistimi: "asc" },
        take: 12,
        include: {
          listing: { select: { property: true } },
          buyers: { include: { contact: { select: { name: true } } } },
        },
      }),
      db.viewing.findMany({
        where: { startsAt: { gte: new Date(now), lt: new Date(now + 14 * DAY_MS) } },
        orderBy: { startsAt: "asc" },
        take: 12,
        include: { listing: { select: { property: true } } },
      }),
      db.listingTask.findMany({
        where: { completedAt: null },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
        take: 12,
        include: {
          listing: { select: { property: true } },
          assignee: { select: { name: true } },
        },
      }),
    ]);

  const endOfDay = (date: Date) => {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end.getTime();
  };

  const sections = [
    {
      key: "fyrirvarar",
      icon: ShieldAlert,
      title: t("panels.fyrirvarar"),
      empty: t("panels.fyrirvararEmpty"),
      rows: pendingFyrirvarar.map((fyrirvari) => {
        const daysLeft = Math.floor((endOfDay(fyrirvari.deadline) - now) / DAY_MS);
        return {
          id: fyrirvari.id,
          href: `/listings/${fyrirvari.offer.listingId}`,
          primary: addressOf(fyrirvari.offer.listing),
          secondary: fyrirvari.description,
          badge:
            daysLeft < 0
              ? { text: t("overdueDays", { days: -daysLeft }), tone: "red" as const }
              : daysLeft < 7
                ? { text: t("daysLeft", { days: daysLeft }), tone: "amber" as const }
                : { text: formatDate(fyrirvari.deadline), tone: "muted" as const },
        };
      }),
    },
    {
      key: "offers",
      icon: HandCoins,
      title: t("panels.expiringOffers"),
      empty: t("panels.expiringOffersEmpty"),
      rows: expiringOffers.map((offer) => ({
        id: offer.id,
        href: `/listings/${offer.listingId}`,
        primary: `${addressOf(offer.listing)} — ${formatISK(Number(offer.amountISK))}`,
        secondary: offer.buyers.map((buyer) => buyer.contact.name).join(", "),
        badge:
          offer.gildistimi.getTime() < now
            ? { text: t("expired"), tone: "red" as const }
            : {
                text: formatDateTime(offer.gildistimi),
                tone:
                  offer.gildistimi.getTime() - now < 2 * DAY_MS
                    ? ("red" as const)
                    : ("amber" as const),
              },
      })),
    },
    {
      key: "viewings",
      icon: CalendarClock,
      title: t("panels.viewings"),
      empty: t("panels.viewingsEmpty"),
      rows: upcomingViewings.map((viewing) => ({
        id: viewing.id,
        href: `/listings/${viewing.listingId}`,
        primary: addressOf(viewing.listing),
        secondary: t(`viewingKind.${viewing.kind}`),
        badge: { text: formatDateTime(viewing.startsAt), tone: "muted" as const },
      })),
    },
    {
      key: "tasks",
      icon: ListChecks,
      title: t("panels.tasks"),
      empty: t("panels.tasksEmpty"),
      rows: openTasks.map((task) => ({
        id: task.id,
        href: `/listings/${task.listingId}`,
        primary: task.title,
        secondary: [addressOf(task.listing), task.assignee?.name]
          .filter(Boolean)
          .join(" · "),
        badge: task.dueDate
          ? {
              text: formatDate(task.dueDate),
              tone: endOfDay(task.dueDate) < now ? ("red" as const) : ("muted" as const),
            }
          : null,
      })),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {t("welcome", { vertical: verticalName })}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.key}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <section.icon aria-hidden className="text-vertical size-4" />
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {section.rows.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  {section.empty}
                </p>
              ) : (
                <ul className="grid gap-1.5">
                  {section.rows.map((row) => (
                    <li key={row.id}>
                      <Link
                        href={row.href}
                        className="hover:bg-muted/60 flex items-center gap-3 rounded-md border px-3 py-2 transition-colors"
                      >
                        <div className="grid min-w-0 flex-1 gap-0.5">
                          <span className="truncate text-sm font-medium">{row.primary}</span>
                          {row.secondary ? (
                            <span className="text-muted-foreground truncate text-xs">
                              {row.secondary}
                            </span>
                          ) : null}
                        </div>
                        {row.badge ? (
                          <Badge
                            variant={row.badge.tone === "muted" ? "secondary" : "default"}
                            className={cn(
                              "shrink-0",
                              row.badge.tone === "red" && "bg-red-600 text-white",
                              row.badge.tone === "amber" && "bg-amber-500 text-white",
                            )}
                          >
                            {row.badge.text}
                          </Badge>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
