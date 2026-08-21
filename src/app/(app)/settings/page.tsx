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

export async function generateMetadata() {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const session = await requireTenantUser();
  const t = await getTranslations("settings");
  const tCommon = await getTranslations("common");

  const tenant = await unscopedDb.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { name: true, vertical: true, plan: { select: { name: true } } },
  });
  if (!tenant) notFound();

  const users = await getTenantDb(session.user.tenantId).user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, active: true },
  });

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

      <Card>
        <CardHeader>
          <CardTitle>{t("usersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
