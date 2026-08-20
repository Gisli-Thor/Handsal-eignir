import { getTranslations } from "next-intl/server";
import { LayoutDashboard } from "lucide-react";
import { requireTenantUser } from "@/lib/auth-guards";

export async function generateMetadata() {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage() {
  const session = await requireTenantUser();
  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");
  const verticalName = tCommon(
    `verticalName.${session.user.vertical ?? "EIGNIR"}`,
  );

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {t("welcome", { vertical: verticalName })}
      </p>

      {/* Filled with pipeline, fyrirvarar, offers and tasks in M3–M5. */}
      <div className="mt-8 flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
        <div className="bg-vertical/12 mb-4 flex size-12 items-center justify-center rounded-full">
          <LayoutDashboard className="text-vertical size-6" />
        </div>
        <h2 className="text-base font-medium">{t("emptyTitle")}</h2>
        <p className="text-muted-foreground mt-1 max-w-md text-sm">
          {t("emptyBody")}
        </p>
      </div>
    </div>
  );
}
