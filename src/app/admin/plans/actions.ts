"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/auth-guards";
import { unscopedDb } from "@/lib/db";
import { logAudit } from "@/core/audit/log";

const planSchema = z.object({
  name: z.string().trim().min(1).max(100),
  maxActiveListings: z
    .union([z.literal(""), z.coerce.number().int().min(1)])
    .transform((v) => (v === "" ? null : v)),
  monthlyPriceISK: z.coerce.number().int().min(0),
});

export type PlanActionState = {
  ok?: boolean;
  error?: "invalid" | "nameTaken" | "unknown";
} | null;

function parsePlanForm(formData: FormData) {
  return planSchema.safeParse({
    name: formData.get("name"),
    maxActiveListings: formData.get("maxActiveListings") ?? "",
    monthlyPriceISK: formData.get("monthlyPriceISK"),
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export async function createPlanAction(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const session = await requireSuperadmin();
  const parsed = parsePlanForm(formData);
  if (!parsed.success) return { error: "invalid" };

  try {
    const plan = await unscopedDb.plan.create({ data: parsed.data });
    await logAudit(unscopedDb, {
      actorUserId: session.user.id,
      action: "PLAN_CREATED",
      targetType: "Plan",
      targetId: plan.id,
      metadata: { name: plan.name },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "nameTaken" };
    return { error: "unknown" };
  }
  revalidatePath("/admin/plans");
  return { ok: true };
}

export async function updatePlanAction(
  planId: string,
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const session = await requireSuperadmin();
  const parsed = parsePlanForm(formData);
  if (!parsed.success) return { error: "invalid" };

  try {
    const plan = await unscopedDb.plan.update({
      where: { id: planId },
      data: parsed.data,
    });
    await logAudit(unscopedDb, {
      actorUserId: session.user.id,
      action: "PLAN_UPDATED",
      targetType: "Plan",
      targetId: plan.id,
      metadata: { name: plan.name },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "nameTaken" };
    return { error: "unknown" };
  }
  revalidatePath("/admin/plans");
  return { ok: true };
}
