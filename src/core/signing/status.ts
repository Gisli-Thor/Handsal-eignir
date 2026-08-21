/**
 * Signing request status derivation (SPEC §11). Domain state is
 * webhook-driven; this maps the signers' states to the request status.
 */
import type {
  SigningRequestStatus,
  SigningSignerStatus,
} from "@/generated/prisma/enums";

/** Statuses that still accept webhook events. */
export function isOpenRequestStatus(status: SigningRequestStatus): boolean {
  return status === "SENT" || status === "PARTIALLY_SIGNED";
}

/**
 * Derive the request status from its signers. Any rejection rejects the
 * whole request; all signed → SIGNED; some signed → PARTIALLY_SIGNED;
 * none → SENT.
 */
export function deriveRequestStatus(
  signerStatuses: readonly SigningSignerStatus[],
): Extract<SigningRequestStatus, "SENT" | "PARTIALLY_SIGNED" | "SIGNED" | "REJECTED"> {
  if (signerStatuses.some((status) => status === "REJECTED")) return "REJECTED";
  if (signerStatuses.length > 0 && signerStatuses.every((status) => status === "SIGNED")) {
    return "SIGNED";
  }
  if (signerStatuses.some((status) => status === "SIGNED")) return "PARTIALLY_SIGNED";
  return "SENT";
}
