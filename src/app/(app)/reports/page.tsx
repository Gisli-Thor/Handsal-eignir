import { getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireTenantAdmin } from "@/lib/auth-guards";
import { getTenantDb, unscopedDb } from "@/lib/db";
import { formatISK } from "@/lib/format";
import {
  commissionByAgent,
  commissionForecast,
  monthlyCommission,
} from "@/core/commission/reports";
import { ACTIVE_STAGES } from "@/verticals/eignir/pipeline";

export async function generateMetadata() {
  const t = await getTranslations("reports");
  return { title: t("title") };
}

/** SPEC §10: forecast covers stages 3–6 (Tilboð móttekið … Afhending). */
const FORECAST_STAGES = ACTIVE_STAGES.filter((stage) => stage !== "I_SOLU");

function CsvButton({ report, label }: { report: string; label: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={`/reports/csv?report=${report}`} download>
        <Download aria-hidden className="size-4" />
        {label}
      </a>
    </Button>
  );
}

export default async function ReportsPage() {
  const session = await requireTenantAdmin();
  const t = await getTranslations("reports");
  const tStages = await getTranslations("listings.stage");
  const db = getTenantDb(session.user.tenantId);

  const tenant = await unscopedDb.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { commissionScheme: true },
  });

  const [monthly, byAgent, forecast] = await Promise.all([
    monthlyCommission(db),
    commissionByAgent(db),
    commissionForecast(db, tenant?.commissionScheme ?? null, FORECAST_STAGES),
  ]);

  const maxMonthTotal = monthly.reduce(
    (max, row) => (row.totalISK > max ? row.totalISK : max),
    0n,
  );

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </div>

      {/* Earned per month + bar chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("monthly.title")}</CardTitle>
          <CsvButton report="monthly" label={t("csv")} />
        </CardHeader>
        <CardContent className="grid gap-6">
          <div
            role="img"
            aria-label={t("monthly.chartLabel")}
            className="flex h-40 items-end gap-1.5"
          >
            {monthly.map((row) => {
              const heightPct =
                maxMonthTotal > 0n
                  ? Math.max(
                      row.totalISK > 0n ? 3 : 0,
                      Number((row.totalISK * 100n) / maxMonthTotal),
                    )
                  : 0;
              return (
                <div key={row.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-sm"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: "var(--chart-1)",
                        minHeight: row.totalISK > 0n ? "3px" : "0",
                      }}
                      title={`${row.month}: ${formatISK(Number(row.totalISK))}`}
                    />
                  </div>
                  <span className="text-muted-foreground text-[10px]">
                    {row.month.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("monthly.month")}</TableHead>
                <TableHead className="text-right">{t("count")}</TableHead>
                <TableHead className="text-right">{t("gross")}</TableHead>
                <TableHead className="text-right">{t("vsk")}</TableHead>
                <TableHead className="text-right">{t("total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthly
                .filter((row) => row.count > 0)
                .map((row) => (
                  <TableRow key={row.month}>
                    <TableCell>{row.month}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatISK(Number(row.grossISK))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatISK(Number(row.vskISK))}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatISK(Number(row.totalISK))}
                    </TableCell>
                  </TableRow>
                ))}
              {monthly.every((row) => row.count === 0) ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-6 text-center">
                    {t("monthly.empty")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Per agent */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("agents.title")}</CardTitle>
            <CsvButton report="agents" label={t("csv")} />
          </CardHeader>
          <CardContent>
            {byAgent.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                {t("agents.empty")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("agents.agent")}</TableHead>
                    <TableHead className="text-right">{t("agents.sales")}</TableHead>
                    <TableHead className="text-right">{t("agents.earned")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byAgent.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.records}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatISK(Number(row.amountISK))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pipeline forecast */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("forecast.title")}</CardTitle>
            <CsvButton report="forecast" label={t("csv")} />
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-3 text-xs">{t("forecast.hint")}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("forecast.stage")}</TableHead>
                  <TableHead className="text-right">{t("count")}</TableHead>
                  <TableHead className="text-right">{t("gross")}</TableHead>
                  <TableHead className="text-right">{t("total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecast.map((row) => (
                  <TableRow key={row.stage}>
                    <TableCell>{tStages(row.stage)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatISK(Number(row.expectedGrossISK))}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatISK(Number(row.expectedTotalISK))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
