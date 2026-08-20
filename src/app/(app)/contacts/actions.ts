"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth-guards";
import { getTenantDb } from "@/lib/db";
import { getThjodskra } from "@/lib/services";
import { logAudit } from "@/core/audit/log";
import { isValidKennitala, normalizeKennitala } from "@/core/contacts/kennitala";
import {
  InvalidKennitalaError,
  RegistryUnavailableError,
} from "@/core/ports/registry";

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const contactSchema = z.object({
  type: z.enum(["PERSON", "COMPANY"]),
  name: z.string().trim().min(1).max(200),
  kennitala: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : normalizeKennitala(v)))
    .refine((v) => v === null || isValidKennitala(v), "invalidKennitala"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.union([z.null(), z.string().email().max(200)])),
  phone: optionalTrimmed(50),
  address: optionalTrimmed(300),
  notes: optionalTrimmed(5000),
  tags: z
    .string()
    .transform((v) =>
      v
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 20),
    )
    .pipe(z.array(z.string().max(40))),
});

export type ContactActionState = {
  ok?: boolean;
  error?: "invalid" | "invalidKennitala" | "kennitalaTaken" | "inUse" | "unknown";
} | null;

export type KennitalaLookupResult =
  | {
      ok: true;
      person: {
        kennitala: string;
        name: string;
        type: "PERSON" | "COMPANY";
        address: string;
      };
    }
  | { ok: false; error: "invalid" | "unavailable" | "notFound" };

function prismaCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: string }).code
    : undefined;
}

function parseContactForm(formData: FormData) {
  return contactSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    kennitala: formData.get("kennitala") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    address: formData.get("address") ?? "",
    notes: formData.get("notes") ?? "",
    tags: formData.get("tags") ?? "",
  });
}

/**
 * Þjóðskrá lookup for contact autofill (SPEC §4). Every attempt — hit, miss
 * or failure — is audit-logged with purpose before the result is returned;
 * the audit write is awaited and failures propagate (compliance requirement).
 */
export async function lookupKennitalaAction(
  kennitalaInput: string,
): Promise<KennitalaLookupResult> {
  const session = await requireTenantUser();
  const db = getTenantDb(session.user.tenantId);
  const kennitala = normalizeKennitala(String(kennitalaInput ?? ""));

  if (!isValidKennitala(kennitala)) return { ok: false, error: "invalid" };

  let result: KennitalaLookupResult;
  let auditResult: "FOUND" | "NOT_FOUND" | "UNAVAILABLE";
  try {
    const person = await getThjodskra().lookupPerson(kennitala);
    if (person) {
      auditResult = "FOUND";
      result = {
        ok: true,
        person: {
          kennitala: person.kennitala,
          name: person.name,
          type: Number(person.kennitala.slice(0, 2)) > 40 ? "COMPANY" : "PERSON",
          address: `${person.legalDomicile.address}, ${person.legalDomicile.postalCode} ${person.legalDomicile.city}`,
        },
      };
    } else {
      auditResult = "NOT_FOUND";
      result = { ok: false, error: "notFound" };
    }
  } catch (error) {
    if (error instanceof InvalidKennitalaError) return { ok: false, error: "invalid" };
    if (!(error instanceof RegistryUnavailableError)) throw error;
    auditResult = "UNAVAILABLE";
    result = { ok: false, error: "unavailable" };
  }

  await logAudit(db, {
    actorUserId: session.user.id,
    action: "THJODSKRA_LOOKUP",
    targetType: "Kennitala",
    targetId: kennitala,
    metadata: { kennitala, purpose: "contact_autofill", result: auditResult },
  });
  return result;
}

export async function createContactAction(
  _prev: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const session = await requireTenantUser();
  const parsed = parseContactForm(formData);
  if (!parsed.success) {
    const kennitalaIssue = parsed.error.issues.some((i) => i.path[0] === "kennitala");
    return { error: kennitalaIssue ? "invalidKennitala" : "invalid" };
  }

  const db = getTenantDb(session.user.tenantId);
  let contactId: string;
  try {
    const contact = await db.contact.create({
      data: { tenantId: session.user.tenantId, ...parsed.data },
    });
    contactId = contact.id;
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "CONTACT_CREATED",
      targetType: "Contact",
      targetId: contact.id,
      metadata: { name: contact.name, type: contact.type },
    });
  } catch (error) {
    if (prismaCode(error) === "P2002") return { error: "kennitalaTaken" };
    return { error: "unknown" };
  }
  revalidatePath("/contacts");
  redirect(`/contacts/${contactId}`);
}

export async function updateContactAction(
  contactId: string,
  _prev: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const session = await requireTenantUser();
  const parsed = parseContactForm(formData);
  if (!parsed.success) {
    const kennitalaIssue = parsed.error.issues.some((i) => i.path[0] === "kennitala");
    return { error: kennitalaIssue ? "invalidKennitala" : "invalid" };
  }

  const db = getTenantDb(session.user.tenantId);
  try {
    const contact = await db.contact.update({
      where: { id: contactId },
      data: parsed.data,
    });
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "CONTACT_UPDATED",
      targetType: "Contact",
      targetId: contact.id,
      metadata: { name: contact.name },
    });
  } catch (error) {
    if (prismaCode(error) === "P2002") return { error: "kennitalaTaken" };
    if (prismaCode(error) === "P2025") return { error: "unknown" };
    return { error: "unknown" };
  }
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}

export async function deleteContactAction(
  contactId: string,
): Promise<ContactActionState> {
  const session = await requireTenantUser();
  const db = getTenantDb(session.user.tenantId);
  try {
    const contact = await db.contact.delete({ where: { id: contactId } });
    await logAudit(db, {
      actorUserId: session.user.id,
      action: "CONTACT_DELETED",
      targetType: "Contact",
      targetId: contactId,
      metadata: { name: contact.name },
    });
  } catch (error) {
    // Restrict FK: the contact is linked to one or more listings.
    if (prismaCode(error) === "P2003") return { error: "inUse" };
    return { error: "unknown" };
  }
  revalidatePath("/contacts");
  redirect("/contacts");
}
