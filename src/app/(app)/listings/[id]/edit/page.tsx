import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenantUser } from "@/lib/auth-guards";
import { getTenantDb, unscopedDb } from "@/lib/db";
import { canManageListing } from "@/core/listings/permissions";
import { propertyAddressLine } from "@/verticals/eignir/display";
import { PropertyForm } from "../../property-form";

/** Icelandic decimal comma for form inputs. */
function decimalString(value: unknown): string {
  return value === null || value === undefined
    ? ""
    : String(value).replace(".", ",");
}

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireTenantUser();
  const t = await getTranslations("listings");
  const tCommon = await getTranslations("common");
  const { id } = await params;

  const listing = await getTenantDb(session.user.tenantId).listing.findUnique({
    where: { id },
    include: { property: true, agents: { select: { userId: true } } },
  });
  if (!listing || !listing.property) notFound();
  if (
    !canManageListing(
      session.user.role,
      session.user.id,
      listing.agents.map((agent) => agent.userId),
    )
  ) {
    redirect(`/listings/${id}`);
  }

  const postalCodes = await unscopedDb.postalCode.findMany({
    orderBy: { code: "asc" },
    select: { code: true, locality: true },
  });

  const property = listing.property;

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/listings/${listing.id}`}>
            <ArrowLeft aria-hidden className="size-4" />
            {tCommon("back")}
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {t("editTitle", { address: propertyAddressLine(property) })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PropertyForm
            postalCodes={postalCodes}
            defaults={{
              listingId: listing.id,
              fastanumer: property.fastanumer,
              landeignarnumer: property.landeignarnumer,
              gotuheiti: property.gotuheiti,
              husnumer: property.husnumer,
              ibud: property.ibud,
              postnumer: property.postnumer,
              tegund: property.tegund,
              birtStaerd: decimalString(property.birtStaerd),
              tharAfGeymsla: decimalString(property.tharAfGeymsla),
              herbergi: property.herbergi?.toString() ?? "",
              svefnherbergi: property.svefnherbergi?.toString() ?? "",
              badherbergi: property.badherbergi?.toString() ?? "",
              haed: property.haed?.toString() ?? "",
              lyfta: property.lyfta,
              parkingType: property.parkingType,
              parkingCount: property.parkingCount?.toString() ?? "",
              byggingarar: property.byggingarar?.toString() ?? "",
              fasteignamatISK: property.fasteignamatISK?.toString() ?? "",
              brunabotamatISK: property.brunabotamatISK?.toString() ?? "",
              askingPriceISK: listing.askingPriceISK?.toString() ?? "",
              descriptionIs: listing.descriptionIs ?? "",
              descriptionEn: listing.descriptionEn ?? "",
              athugasemdir: property.athugasemdir ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
