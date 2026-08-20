/**
 * Listing RBAC (SPEC §3): ADMIN manages all listings in the tenant; AGENT
 * manages listings they are assigned to ("own + shared"). All tenant users
 * can view all tenant listings. Decision recorded in PROGRESS.md (M2).
 */
import type { Role } from "@/generated/prisma/enums";

export function canManageListing(
  role: Role,
  userId: string,
  agentUserIds: readonly string[],
): boolean {
  return role === "ADMIN" || agentUserIds.includes(userId);
}
