import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireTenantUser } from "@/lib/auth-guards";
import { getTenantDb, unscopedDb } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  CommissionSchemeForm,
  type SchemeJson,
} from "@/components/commission-scheme-form";
import { ACTIVE_STAGES } from "@/verticals/eignir/pipeline";
import { updateTenantCommissionSchemeAction } from "./actions";

export async function generateMetadata() {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const session = await requireTenantUser();
  const t = await getTranslations("settings");
  const tCommon = await getTranslations("common");
  const isAdmin = session.user.role === "ADMIN";
  const db = getTenantDb(session.user.tenantId);

  const tenant = await unscopedDb.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: {
      name: true,
      vertical: true,
      commissionScheme: true,
      plan: { select: { name: true, maxActiveListings: true } },
    },
  });
  if (!tenant) notFound();

  const users = await db.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  // Plan usage meter (SPEC §12) — ADMINs only.
  const activeCount = isAdmin
    ? await db.listing.count({ where: { stage: { in: [...ACTIVE_STAGES] } } })
    : 0;
  const limit = tenant.plan.maxActiveListings;
  const usagePct = limit ? Math.min(100, Math.round((activeCount / limit) * 100)) : null;

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("tenantInfo")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">{t("name")}</dt>
              <dd className="mt-0.5 font-medium">{tenant.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("vertical")}</dt>
              <dd className="mt-0.5 font-medium">
                {tCommon(`verticalLabel.${tenant.vertical}`)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("plan")}</dt>
              <dd className="mt-0.5 font-medium">{tenant.plan.name}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("usage.title")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <p className="text-sm">
              {limit === null
                ? t("usage.unlimited", { count: activeCount })
                : t("usage.meter", { count: activeCount, limit })}
            </p>
            {usagePct !== null ? (
              <div
                role="meter"
                aria-valuemin={0}
                aria-valuemax={limit ?? 0}
                aria-valuenow={activeCount}
                className="bg-muted h-2.5 w-full max-w-md overflow-hidden rounded-full"
              >
                <div
                  className={cn(
                    "bg-vertical h-full rounded-full transition-all",
                    usagePct >= 90 && "bg-amber-500",
                    usagePct >= 100 && "bg-red-600",
                  )}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            ) : null}
            {usagePct !== null && usagePct >= 90 ? (
              <p className="text-sm font-medium text-amber-600">
                {usagePct >= 100 ? t("usage.atLimit") : t("usage.nearLimit")}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("commissionTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4 text-sm">{t("commissionHint")}</p>
            <CommissionSchemeForm
              initialScheme={(tenant.commissionScheme as SchemeJson | null) ?? null}
              onSave={updateTenantCommissionSchemeAction}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("usersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {tCommon("noResults")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{tCommon("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {user.email} ·{" "}
                        {t(`roles.${user.role}`)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.active ? "secondary" : "outline"}>
                        {user.active ? tCommon("active") : tCommon("suspended")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
