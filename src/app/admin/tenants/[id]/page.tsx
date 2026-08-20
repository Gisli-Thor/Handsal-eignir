import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { requireSuperadmin } from "@/lib/auth-guards";
import { unscopedDb } from "@/lib/db";
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
import { EditTenantForm } from "./edit-tenant-form";
import { CreateAdminForm } from "./create-admin-form";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperadmin();
  const { id } = await params;
  const t = await getTranslations("admin.tenants");
  const tCommon = await getTranslations("common");
  const tSettings = await getTranslations("settings");

  const [tenant, plans] = await Promise.all([
    unscopedDb.tenant.findUnique({
      where: { id },
      include: {
        users: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true, role: true, active: true },
        },
      },
    }),
    unscopedDb.plan.findMany({
      orderBy: { monthlyPriceISK: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!tenant) notFound();

  return (
    <div className="grid gap-6">
      <div>
        <Link
          href="/admin/tenants"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          {tCommon("back")}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {tenant.name}
          </h1>
          <Badge variant="outline">
            {tCommon(`verticalLabel.${tenant.vertical}`)}
          </Badge>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("edit")}</CardTitle>
          </CardHeader>
          <CardContent>
            <EditTenantForm
              tenant={{
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                planId: tenant.planId,
                status: tenant.status,
                email: tenant.email,
                phone: tenant.phone,
                address: tenant.address,
                brandColor: tenant.brandColor,
                logoUrl: tenant.logoUrl,
              }}
              plans={plans}
            />
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("usersSection")}</CardTitle>
            </CardHeader>
            <CardContent>
              {tenant.users.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("noUsers")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("name")}</TableHead>
                      <TableHead>{tCommon("status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenant.users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-muted-foreground text-xs">
                            {user.email} · {tSettings(`roles.${user.role}`)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.active ? "secondary" : "outline"}>
                            {user.active
                              ? tCommon("active")
                              : tCommon("suspended")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("addAdmin")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CreateAdminForm tenantId={tenant.id} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
