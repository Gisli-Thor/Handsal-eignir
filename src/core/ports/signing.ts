/**
 * E-signing port (SPEC §11), modeled on the common Icelandic providers'
 * pattern (Taktikal / Signet / Dokobit). Implementations live in
 * src/adapters/signing, selected via src/lib/services.ts (ADAPTER_SIGNING).
 *
 * Status flow is webhook-driven: providers call POST /api/webhooks/signing,
 * and our SigningRequest rows are the authoritative domain state.
 */

export interface SigningSignerInput {
  name: string;
  kennitala: string;
  email?: string;
  phone?: string;
}

export interface CreatedSigner {
  /** Provider-side signer id — webhook payloads identify signers by this. */
  providerSignerId: string;
  /** Link the signer opens to sign (mock: points at /dev/signing). */
  signerLink: string;
}

export interface CreateSigningRequestResult {
  providerRequestId: string;
  signers: CreatedSigner[];
}

/** Provider-side status snapshot. Mock providers cannot answer (stateless) —
 * they return { supported: false }; domain state stays webhook-authoritative. */
export type SigningProviderStatus =
  | { supported: false }
  | {
      supported: true;
      status: "PENDING" | "PARTIALLY_SIGNED" | "SIGNED" | "REJECTED" | "EXPIRED" | "CANCELLED";
    };

export interface SigningAdapter {
  createSigningRequest(
    document: { title: string; pdf: Buffer },
    signers: SigningSignerInput[],
  ): Promise<CreateSigningRequestResult>;
  getStatus(providerRequestId: string): Promise<SigningProviderStatus>;
  cancel(providerRequestId: string): Promise<void>;
}
