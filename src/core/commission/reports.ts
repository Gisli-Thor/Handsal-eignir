/**
 * Commission report aggregations (SPEC §10), shared by the /reports page and
 * the CSV export route. Record counts per tenant are small — grouping happens
 * in JS over the frozen CommissionRecord rows.
 */
import type { TenantDb } from "@/core/tenancy/isolation";
import { calculateCommission } from "./calculate";
import { parseScheme } from "./scheme";

export interface MonthlyRow {
  /** YYYY-MM */
  month: string;
  count: number;
  grossISK: bigint;
  vskISK: bigint;
  totalISK: bigint;
}

export interface AgentRow {
  userId: string;
  name: string;
  records: number;
  amountISK: bigint;
}

export interface ForecastRow {
  stage: string;
  count: number;
  expectedGrossISK: bigint;
  expectedTotalISK: bigint;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Earned commission per month, oldest→newest, including empty months so the
 * chart has a continuous axis. */
export async function monthlyCommission(
  db: TenantDb,
  months = 12,
  now: Date = new Date(),
): Promise<MonthlyRow[]> {
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const records = await db.commissionRecord.findMany({
    where: { createdAt: { gte: start } },
    select: { createdAt: true, grossISK: true, vskISK: true, totalISK: true },
  });
  const byMonth = new Map<string, MonthlyRow>();
  for (let i = 0; i < months; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
    const key = monthKey(date);
    byMonth.set(key, { month: key, count: 0, grossISK: 0n, vskISK: 0n, totalISK: 0n });
  }
  for (const record of records) {
    const row = byMonth.get(monthKey(record.createdAt));
    if (!row) continue;
    row.count += 1;
    row.grossISK += record.grossISK;
    row.vskISK += record.vskISK;
    row.totalISK += record.totalISK;
  }
  return [...byMonth.values()];
}

/** Earned commission per agent, folded from the frozen agentSplits JSON. */
export async function commissionByAgent(db: TenantDb): Promise<AgentRow[]> {
  const records = await db.commissionRecord.findMany({ select: { agentSplits: true } });
  const byAgent = new Map<string, AgentRow>();
  for (const record of records) {
    if (!Array.isArray(record.agentSplits)) continue;
    for (const raw of record.agentSplits as Array<Record<string, unknown>>) {
      const userId = typeof raw.userId === "string" ? raw.userId : null;
      const amount =
        typeof raw.amountISK === "string" && /^\d+$/.test(raw.amountISK)
          ? BigInt(raw.amountISK)
          : null;
      if (!userId || amount === null) continue;
      const row = byAgent.get(userId) ?? {
        userId,
        name: typeof raw.name === "string" ? raw.name : userId,
        records: 0,
        amountISK: 0n,
      };
      row.records += 1;
      row.amountISK += amount;
      byAgent.set(userId, row);
    }
  }
  return [...byAgent.values()].sort((a, b) => (b.amountISK > a.amountISK ? 1 : -1));
}

/**
 * Pipeline forecast (SPEC §10): expected commission of listings in stages
 * 3–6, price = accepted offer amount ?? ásett verð, run through the real
 * calculator with the effective scheme (listing override ?? tenant default).
 * Priceless listings are skipped.
 */
export async function commissionForecast(
  db: TenantDb,
  tenantSchemeJson: unknown,
  stages: readonly string[],
): Promise<ForecastRow[]> {
  const tenantScheme = parseScheme(tenantSchemeJson);
  const listings = await db.listing.findMany({
    where: { stage: { in: [...stages] } },
    select: {
      stage: true,
      askingPriceISK: true,
      commissionSchemeOverride: true,
      offers: {
        where: { status: "ACCEPTED" },
        orderBy: { decidedAt: "desc" },
        take: 1,
        select: { amountISK: true },
      },
    },
  });
  const byStage = new Map<string, ForecastRow>(
    stages.map((stage) => [
      stage,
      { stage, count: 0, expectedGrossISK: 0n, expectedTotalISK: 0n },
    ]),
  );
  for (const listing of listings) {
    const price = listing.offers[0]?.amountISK ?? listing.askingPriceISK;
    if (price === null) continue;
    const scheme = parseScheme(listing.commissionSchemeOverride) ?? tenantScheme;
    if (!scheme) continue;
    const result = calculateCommission(scheme, price, []);
    const row = byStage.get(listing.stage);
    if (!row) continue;
    row.count += 1;
    row.expectedGrossISK += result.grossISK;
    row.expectedTotalISK += result.totalISK;
  }
  return [...byStage.values()];
}

/** CSV per Icelandic Excel conventions: UTF-8 BOM, semicolon delimiter.
 * Fields containing the delimiter/quotes/newlines are quoted. */
export function buildCsv(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const escape = (value: string | number): string => {
    const text = String(value);
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers, ...rows].map((row) => row.map(escape).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
