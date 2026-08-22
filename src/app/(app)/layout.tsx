import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell/app-shell";
import { requireTenantUser } from "@/lib/auth-guards";
import { unscopedDb } from "@/lib/db";
import { eignirNav } from "@/verticals/eignir/nav";
import { bilarNav } from "@/verticals/bilar/nav";

export default async function TenantAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireTenantUser();
  const tenant = await unscopedDb.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { name: true, vertical: true, brandColor: true },
  });
  if (!tenant) notFound();

  const t = await getTranslations("common");
  const verticalKey = tenant.vertical === "EIGNIR" ? "eignir" : "bilar";
  const allNavItems = tenant.vertical === "EIGNIR" ? eignirNav : bilarNav;
  // adminOnly items (reports, SPEC §10) are hidden from agents.
  const navItems = allNavItems.filter(
    (item) => !item.adminOnly || session.user.role === "ADMIN",
  );
  // "Handsal Eignir" -> "Eignir" for the logo lockup
  const verticalShortName = t(`verticalName.${tenant.vertical}`).replace(
    /^Handsal\s+/,
    "",
  );

  return (
    <div
      data-vertical={verticalKey}
      style={
        tenant.brandColor
          ? ({ "--vertical-accent": tenant.brandColor } as React.CSSProperties)
          : undefined
      }
    >
      <AppShell
        verticalKey={verticalKey}
        verticalShortName={verticalShortName}
        tenantName={tenant.name}
        user={{
          name: session.user.name ?? "",
          email: session.user.email ?? "",
        }}
        navItems={navItems}
      >
        {children}
      </AppShell>
    </div>
  );
}
