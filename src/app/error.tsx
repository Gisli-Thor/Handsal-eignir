"use client";

/**
 * Global error boundary (M5 polish pass). Renders inside the root layout,
 * so the NextIntlClientProvider is available.
 */
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <TriangleAlert aria-hidden className="text-destructive size-10" />
      <p className="text-lg font-medium">{t("errorOccurred")}</p>
      <Button type="button" variant="outline" onClick={reset}>
        <RefreshCw aria-hidden className="size-4" />
        {t("retry")}
      </Button>
    </div>
  );
}
