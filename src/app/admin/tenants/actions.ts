"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/auth-guards";
import { unscopedDb } from "@/lib/db";
import { logAudit } from "@/core/audit/log";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const optionalTrimmed = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v === "" ? null : v));

const createTenantSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().toLowerCase().regex(SLUG_REGEX).max(100),
  vertical: z.enum(["EIGNIR", "BILAR"]),
  planId: z.string().min(1),
});

const updateTenantSchema = createTenantSchema.omit({ vertical: true }).extend({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  email: optionalTrimmed,
  phone: optionalTrimmed,
  address: optionalTrimmed,
  brandColor: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.union([z.null(), z.string().regex(/^#[0-9a-fA-F]{6}$/)])),
  logoUrl: optionalTrimmed,
});

const createAdminSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().toLowerCase(),
  tempPassword: z.string().min(8).max(200),
});

export type TenantActionState = {
  ok?: boolean;
  error?: "invalid" | "slugTaken" | "emailTaken" | "unknown";
} | null;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export async function createTenantAction(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const session = await requireSuperadmin();
  const parsed = createTenantSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    vertical: formData.get("vertical"),
    planId: formData.get("planId"),
  });
  if (!parsed.success) return { error: "invalid" };

  try {
    const tenant = await unscopedDb.tenant.create({ data: parsed.data });
    await logAudit(unscopedDb, {
      actorUserId: session.user.id,
      action: "TENANT_CREATED",
      targetType: "Tenant",
      targetId: tenant.id,
      metadata: { name: tenant.name, slug: tenant.slug, vertical: tenant.vertical },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "slugTaken" };
    return { error: "unknown" };
  }
  revalidatePath("/admin/tenants");
  return { ok: true };
}

export async function updateTenantAction(
  tenantId: string,
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const session = await requireSuperadmin();
  const parsed = updateTenantSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    planId: formData.get("planId"),
    status: formData.get("status"),
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    address: formData.get("address") ?? "",
    brandColor: formData.get("brandColor") ?? "",
    logoUrl: formData.get("logoUrl") ?? "",
  });
  if (!parsed.success) return { error: "invalid" };

  try {
    const before = await unscopedDb.tenant.findUnique({
      where: { id: tenantId },
      select: { planId: true },
    });
    const tenant = await unscopedDb.tenant.update({
      where: { id: tenantId },
      data: parsed.data,
    });
    await logAudit(unscopedDb, {
      actorUserId: session.user.id,
      action: "TENANT_UPDATED",
      targetType: "Tenant",
      targetId: tenant.id,
      metadata: { name: tenant.name },
    });
    if (before && before.planId !== tenant.planId) {
      await logAudit(unscopedDb, {
        actorUserId: session.user.id,
        action: "PLAN_ASSIGNED",
        targetType: "Tenant",
        targetId: tenant.id,
        metadata: { fromPlanId: before.planId, toPlanId: tenant.planId },
      });
    }
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "slugTaken" };
    return { error: "unknown" };
  }
  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true };
}

export async function createTenantAdminAction(
  tenantId: string,
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const session = await requireSuperadmin();
  const parsed = createAdminSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    tempPassword: formData.get("tempPassword"),
  });
  if (!parsed.success) return { error: "invalid" };

  try {
    const passwordHash = await hash(parsed.data.tempPassword, 12);
    const user = await unscopedDb.user.create({
      data: {
        tenantId,
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        role: "ADMIN",
      },
    });
    await logAudit(unscopedDb, {
      tenantId,
      actorUserId: session.user.id,
      action: "USER_CREATED",
      targetType: "User",
      targetId: user.id,
      metadata: { email: user.email, role: user.role },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "emailTaken" };
    return { error: "unknown" };
  }
  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true };
}
