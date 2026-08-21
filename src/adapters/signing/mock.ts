/**
 * Mock signing adapter (SPEC §11). Deliberately STATELESS: it mints provider
 * ids and fake signer links; all domain state lives in our SigningRequest
 * rows and is driven exclusively through the webhook
 * (POST /api/webhooks/signing), which the /dev/signing simulator fires —
 * exactly the shape a real provider integration has.
 */
import { randomUUID } from "node:crypto";
import type {
  CreateSigningRequestResult,
  SigningAdapter,
  SigningProviderStatus,
  SigningSignerInput,
} from "@/core/ports/signing";

export class MockSigningAdapter implements SigningAdapter {
  async createSigningRequest(
    _document: { title: string; pdf: Buffer },
    signers: SigningSignerInput[],
  ): Promise<CreateSigningRequestResult> {
    const providerRequestId = `mock-sign-${randomUUID()}`;
    return {
      providerRequestId,
      signers: signers.map(() => {
        const providerSignerId = `mock-signer-${randomUUID().slice(0, 12)}`;
        return {
          providerSignerId,
          signerLink: `/dev/signing?request=${providerRequestId}&signer=${providerSignerId}`,
        };
      }),
    };
  }

  async getStatus(_providerRequestId: string): Promise<SigningProviderStatus> {
    // Stateless mock cannot answer; domain state is webhook-authoritative.
    return { supported: false };
  }

  async cancel(_providerRequestId: string): Promise<void> {
    // Nothing to do provider-side in the mock.
  }
}
