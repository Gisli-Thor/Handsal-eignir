/**
 * CSV export for the commission reports (SPEC §10): UTF-8 with BOM and
 * semicolon delimiter (Icelandic Excel), amounts as plain integer ISK.
 * ?report=monthly|agents|forecast
 */
import { NextResponse } from "next/server";
import {
  buildCsv,
  commissionByAgent,
  commissionForecast,
  monthlyCommission,
} from "@/core/commission/reports";
import { requireTenantAdmin } from "@/lib/auth-guards";
import { getTenantDb, unscopedDb } from "@/lib/db";
import { ACTIVE_STAGES } from "@/verticals/eignir/pipeline";

export const runtime = "nodejs";

const FORECAST_STAGES = ACTIVE_STAGES.filter((stage) => stage !== "I_SOLU");

export async function GET(request: Request): Promise<NextResponse> {
  const session = await requireTenantAdmin();
  const db = getTenantDb(session.user.tenantId);
  const report = new URL(request.url).searchParams.get("report") ?? "monthly";

  let csv: string;
  if (report === "agents") {
    const rows = await commissionByAgent(db);
    csv = buildCsv(
      ["agent", "sales", "earned_isk"],
      rows.map((row) => [row.name, row.records, row.amountISK.toString()]),
    );
  } else if (report === "forecast") {
    const tenant = await unscopedDb.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { commissionScheme: true },
    });
    const rows = await commissionForecast(
      db,
      tenant?.commissionScheme ?? null,
      FORECAST_STAGES,
    );
    csv = buildCsv(
      ["stage", "listings", "expected_gross_isk", "expected_total_isk"],
      rows.map((row) => [
        row.stage,
        row.count,
        row.expectedGrossISK.toString(),
        row.expectedTotalISK.toString(),
      ]),
    );
  } else if (report === "monthly") {
    const rows = await monthlyCommission(db);
    csv = buildCsv(
      ["month", "sales", "gross_isk", "vsk_isk", "total_isk"],
      rows.map((row) => [
        row.month,
        row.count,
        row.grossISK.toString(),
        row.vskISK.toString(),
        row.totalISK.toString(),
      ]),
    );
  } else {
    return NextResponse.json({ error: "unknownReport" }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="handsal-${report}.csv"`,
    },
  });
}
