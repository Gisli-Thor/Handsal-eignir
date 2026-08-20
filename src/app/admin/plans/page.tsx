import { getTranslations } from "next-intl/server";
import { requireSuperadmin } from "@/lib/auth-guards";
import { unscopedDb } from "@/lib/db";
import { formatISK } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlanDialog } from "./plan-dialog";

export default async function PlansPage() {
  await requireSuperadmin();
  const t = await getTranslations("admin.plans");
  const tCommon = await getTranslations("common");

  const plans = await unscopedDb.plan.findMany({
    orderBy: { monthlyPriceISK: "asc" },
    include: { _count: { select: { tenants: true } } },
  });

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <PlanDialog mode="create" />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("maxActiveListings")}</TableHead>
            <TableHead>{t("monthlyPrice")}</TableHead>
            <TableHead>{t("tenants")}</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                {tCommon("noResults")}
              </TableCell>
            </TableRow>
          ) : (
            plans.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell className="font-medium">{plan.name}</TableCell>
                <TableCell>
                  {plan.maxActiveListings ?? tCommon("unlimited")}
                </TableCell>
                <TableCell>
                  {formatISK(plan.monthlyPriceISK)}{" "}
                  <span className="text-muted-foreground text-xs">
                    {tCommon("perMonth")}
                  </span>
                </TableCell>
                <TableCell>{plan._count.tenants}</TableCell>
                <TableCell className="text-right">
                  <PlanDialog
                    mode="edit"
                    plan={{
                      id: plan.id,
                      name: plan.name,
                      maxActiveListings: plan.maxActiveListings,
                      monthlyPriceISK: plan.monthlyPriceISK,
                    }}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
