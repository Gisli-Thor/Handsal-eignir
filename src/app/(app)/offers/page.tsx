import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireTenantUser } from "@/lib/auth-guards";
import { getTenantDb } from "@/lib/db";
import { formatDateTime, formatISK } from "@/lib/format";
import { offerKind } from "@/core/offers/state";
import { propertyAddressLine } from "@/verticals/eignir/display";

export async function generateMetadata() {
  const t = await getTranslations("offers");
  return { title: t("pageTitle") };
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "default",
  ACCEPTED: "default",
  REJECTED: "destructive",
  COUNTERED: "secondary",
  EXPIRED: "outline",
  WITHDRAWN: "outline",
};

export default async function OffersPage() {
  const session = await requireTenantUser();
  const t = await getTranslations("offers");
  const db = getTenantDb(session.user.tenantId);

  const offers = await db.offer.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      listing: { include: { property: true } },
      buyers: { include: { contact: { select: { name: true } } } },
    },
  });

  const now = Date.now();

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("pageSubtitle")}</p>
      </div>

      {offers.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-6 py-16 text-center text-sm">
          {t("emptyAll")}
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.listing")}</TableHead>
                <TableHead>{t("columns.kind")}</TableHead>
                <TableHead>{t("columns.buyers")}</TableHead>
                <TableHead className="text-right">{t("columns.amount")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.gildistimi")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offers.map((offer) => {
                const expiringSoon =
                  offer.status === "PENDING" &&
                  offer.gildistimi.getTime() - now < 48 * 3_600_000 &&
                  offer.gildistimi.getTime() > now;
                return (
                  <TableRow key={offer.id}>
                    <TableCell>
                      <Link
                        href={`/listings/${offer.listingId}`}
                        className="font-medium hover:underline"
                      >
                        {offer.listing.property
                          ? propertyAddressLine(offer.listing.property)
                          : offer.listingId}
                      </Link>
                    </TableCell>
                    <TableCell>{t(`kind.${offerKind(offer.parentId)}`)}</TableCell>
                    <TableCell className="max-w-48 truncate">
                      {offer.buyers.map((buyer) => buyer.contact.name).join(", ")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatISK(Number(offer.amountISK))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[offer.status] ?? "outline"}>
                        {t(`status.${offer.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDateTime(offer.gildistimi)}
                      {expiringSoon ? (
                        <Badge variant="destructive" className="ml-2">
                          {t("expiringSoon")}
                        </Badge>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
