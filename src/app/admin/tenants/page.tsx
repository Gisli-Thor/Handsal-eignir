import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireSuperadmin } from "@/lib/auth-guards";
import { unscopedDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateTenantDialog } from "./create-tenant-dialog";

export default async function TenantsPage() {
  await requireSuperadmin();
  const t = await getTranslations("admin.tenants");
  const tCommon = await getTranslations("common");

  const [tenants, plans] = await Promise.all([
    unscopedDb.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        plan: { select: { name: true } },
        _count: { select: { users: true } },
      },
    }),
    unscopedDb.plan.findMany({
      orderBy: { monthlyPriceISK: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <CreateTenantDialog plans={plans} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("vertical")}</TableHead>
            <TableHead>{t("plan")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("users")}</TableHead>
            <TableHead>{t("created")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                {tCommon("noResults")}
              </TableCell>
            </TableRow>
          ) : (
            tenants.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell>
                  <Link
                    href={`/admin/tenants/${tenant.id}`}
                    className="font-medium hover:underline"
                  >
                    {tenant.name}
                  </Link>
                  <div className="text-muted-foreground text-xs">
                    {tenant.slug}
                  </div>
                </TableCell>
                <TableCell>
                  {tCommon(`verticalLabel.${tenant.vertical}`)}
                </TableCell>
                <TableCell>{tenant.plan.name}</TableCell>
                <TableCell>
                  <Badge
                    variant={tenant.status === "ACTIVE" ? "secondary" : "destructive"}
                  >
                    {tenant.status === "ACTIVE"
                      ? tCommon("active")
                      : tCommon("suspended")}
                  </Badge>
                </TableCell>
                <TableCell>{tenant._count.users}</TableCell>
                <TableCell>{formatDate(tenant.createdAt)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
