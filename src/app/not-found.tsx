import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Global 404 (M5 polish pass). Locale comes from the cookie-based request
 * config — no path segment involved. */
export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <SearchX aria-hidden className="text-muted-foreground size-10" />
      <p className="text-lg font-medium">{t("notFound")}</p>
      <Button asChild variant="outline">
        <Link href="/">{t("backHome")}</Link>
      </Button>
    </div>
  );
}
