import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ImageOff, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireTenantUser } from "@/lib/auth-guards";
import { getTenantDb } from "@/lib/db";
import { presignDownload } from "@/lib/storage";
import { formatISK } from "@/lib/format";
import { propertyAddressLine } from "@/verticals/eignir/display";

export async function generateMetadata() {
  const t = await getTranslations("listings");
  return { title: t("title") };
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireTenantUser();
  const t = await getTranslations("listings");
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const listings = await getTenantDb(session.user.tenantId).listing.findMany({
    where: query
      ? {
          property: {
            is: {
              OR: [
                { gotuheiti: { contains: query, mode: "insensitive" } },
                { fastanumer: { contains: query, mode: "insensitive" } },
                { postnumer: { contains: query } },
              ],
            },
          },
        }
      : undefined,
    include: {
      property: { include: { postalCode: true } },
      agents: { include: { user: { select: { name: true } } } },
      media: {
        where: { isCover: true },
        select: { thumbKey: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const rows = await Promise.all(
    listings.map(async (listing) => ({
      listing,
      thumbUrl: listing.media[0]?.thumbKey
        ? await presignDownload(listing.media[0].thumbKey)
        : null,
    })),
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {session.user.vertical === "EIGNIR" ? (
          <Button asChild>
            <Link href="/listings/new">
              <Plus aria-hidden className="size-4" />
              {t("new")}
            </Link>
          </Button>
        ) : null}
      </div>

      <form action="/listings" className="relative max-w-sm">
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t("searchPlaceholder")}
          className="pl-9"
        />
      </form>

      {rows.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-muted-foreground py-10 text-center text-sm">
              {query ? t("emptySearch") : t("empty")}
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ listing, thumbUrl }) => (
            <li key={listing.id}>
              <Link
                href={`/listings/${listing.id}`}
                className="border-border bg-card hover:border-ring/40 block overflow-hidden rounded-xl border transition-colors"
              >
                <div className="bg-muted relative aspect-[4/3]">
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbUrl}
                      alt=""
                      className="absolute inset-0 size-full object-cover"
                    />
                  ) : (
                    <div className="text-muted-foreground/50 absolute inset-0 grid place-items-center">
                      <ImageOff aria-hidden className="size-8" />
                    </div>
                  )}
                  <Badge className="absolute top-2 left-2" variant="secondary">
                    {t(`stage.${listing.stage}`)}
                  </Badge>
                </div>
                <div className="grid gap-1 p-4">
                  <div className="font-medium">
                    {listing.property
                      ? propertyAddressLine(listing.property)
                      : t("untitled")}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {listing.property
                      ? `${listing.property.postnumer} ${listing.property.postalCode.locality} · ${t(`propertyType.${listing.property.tegund}`)}`
                      : null}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="font-semibold tabular-nums">
                      {listing.askingPriceISK !== null
                        ? formatISK(Number(listing.askingPriceISK))
                        : "–"}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {listing.agents.map((agent) => agent.user.name).join(", ")}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
