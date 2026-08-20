import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenantUser } from "@/lib/auth-guards";
import { unscopedDb } from "@/lib/db";
import { PropertyForm } from "../property-form";

export async function generateMetadata() {
  const t = await getTranslations("listings");
  return { title: t("new") };
}

export default async function NewListingPage() {
  const session = await requireTenantUser();
  // The property form is Eignir-specific; the Bílar listing scaffold is M6.
  if (session.user.vertical !== "EIGNIR") redirect("/listings");
  const t = await getTranslations("listings");
  const tCommon = await getTranslations("common");

  // Global reference data (no tenant scope).
  const postalCodes = await unscopedDb.postalCode.findMany({
    orderBy: { code: "asc" },
    select: { code: true, locality: true },
  });

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/listings">
            <ArrowLeft aria-hidden className="size-4" />
            {tCommon("back")}
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("new")}</CardTitle>
        </CardHeader>
        <CardContent>
          <PropertyForm postalCodes={postalCodes} />
        </CardContent>
      </Card>
    </div>
  );
}
